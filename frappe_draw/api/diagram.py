# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

# Whitelisted API for the Draw Diagram editor (SPEC §8 persistence, §2 trash,
# §9 sharing). Owner-or-public reads, revision-checked saves, trash/restore/
# duplicate, and thumbnail upload. Guests may read only public diagrams.

import json

import frappe
from frappe import _
from frappe.utils import now_datetime

DOCTYPE = "Draw Diagram"


# --- reads -------------------------------------------------------------------


@frappe.whitelist(allow_guest=True)
def get_diagram(name: str) -> dict:
	"""Return a diagram the current user may view (owner, shared, or public).

	Guests are allowed through only when the diagram is public; everyone else
	must pass the owner/permission check.
	"""
	diagram = _get_readable_diagram(name)
	return {
		"name": diagram.name,
		"title": diagram.title,
		"description": diagram.description,
		"folder": diagram.folder,
		"canvas_size": diagram.canvas_size,
		"document": diagram.document,
		"is_public": diagram.is_public,
		"revision": diagram.revision,
		"thumbnail": diagram.thumbnail,
		"is_owner": diagram.owner == frappe.session.user,
		"modified": str(diagram.modified),
	}


def _get_readable_diagram(name: str) -> "frappe.model.document.Document":
	"""Load a diagram, raising a permission error unless the caller may read it."""
	if not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("Diagram not found"), frappe.DoesNotExistError)

	diagram = frappe.get_doc(DOCTYPE, name)
	is_public = bool(diagram.is_public)
	is_guest = frappe.session.user == "Guest"

	if is_guest:
		if not is_public:
			raise frappe.PermissionError(_("You need access to view this diagram"))
		return diagram

	if diagram.owner == frappe.session.user or is_public:
		return diagram

	# Falls back to standard permission rules (covers System Manager + shares).
	if diagram.has_permission("read"):
		return diagram

	raise frappe.PermissionError(_("You need access to view this diagram"))


@frappe.whitelist(allow_guest=True)
def get_public_diagram(name: str) -> dict:
	"""Return a diagram for the read-only viewer (SPEC §9).

	Guest-allowed; reuses the shared read gate so private diagrams (and missing
	access) surface as a permission error the viewer renders as "You need access".
	"""
	return get_diagram(name)


@frappe.whitelist()
def list_diagrams(include_trashed: bool = False) -> list[dict]:
	"""List the current user's diagrams, newest first (trash excluded by default)."""
	filters: dict = {"owner": frappe.session.user}
	filters["is_trashed"] = 1 if include_trashed else 0
	return frappe.get_all(
		DOCTYPE,
		filters=filters,
		fields=[
			"name",
			"title",
			"description",
			"folder",
			"canvas_size",
			"thumbnail",
			"is_public",
			"sort_order",
			"trashed_on",
			"modified",
		],
		order_by="sort_order asc, modified desc",
	)


# --- writes ------------------------------------------------------------------


@frappe.whitelist()
def save_diagram(name: str, document: str, revision: int) -> dict:
	"""Persist a diagram document, guarding against a stale (conflicting) write.

	If the stored revision is newer than the one the client last saw, the save
	is rejected so the editor can freeze with a "changed elsewhere" prompt
	(SPEC §8 two-tab / concurrent-edit conflict).
	"""
	diagram = _get_writable_diagram(name)
	_assert_fresh_revision(diagram, revision)

	diagram.document = _normalize_document(document)
	diagram.save()
	frappe.db.commit()
	return {"name": diagram.name, "revision": diagram.revision, "modified": str(diagram.modified)}


def _assert_fresh_revision(diagram: "frappe.model.document.Document", revision: int) -> None:
	"""Reject the save when the server already holds a newer revision."""
	server_revision = diagram.revision or 0
	if int(revision) < server_revision:
		frappe.throw(
			_("This diagram was changed elsewhere — reload."),
			frappe.ValidationError,
			title=_("Stale revision"),
		)


def _normalize_document(document: str) -> str:
	"""Accept the document as a JSON string or object and store canonical JSON."""
	if isinstance(document, str):
		# Validate it parses so we never persist a broken document.
		json.loads(document)
		return document
	return json.dumps(document)


def _get_writable_diagram(name: str) -> "frappe.model.document.Document":
	"""Load a diagram the caller may write, otherwise raise a permission error."""
	if not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("Diagram not found"), frappe.DoesNotExistError)

	diagram = frappe.get_doc(DOCTYPE, name)
	if diagram.owner != frappe.session.user and not diagram.has_permission("write"):
		raise frappe.PermissionError(_("You cannot edit this diagram"))
	return diagram


@frappe.whitelist()
def set_public_access(name: str, is_public: int) -> dict:
	"""Toggle a diagram's global (link) access (SPEC §9 sharing)."""
	diagram = _get_writable_diagram(name)
	diagram.is_public = 1 if int(is_public) else 0
	diagram.save()
	frappe.db.commit()
	return {"name": diagram.name, "is_public": bool(diagram.is_public)}


@frappe.whitelist()
def save_thumbnail(name: str, thumbnail: str) -> dict:
	"""Attach a freshly rendered thumbnail (a data URL) to the diagram.

	Throttling is the client's responsibility (SPEC §11.4, ≤ once / 30s); this
	just decodes the data URL, writes a private file, and links it.
	"""
	diagram = _get_writable_diagram(name)
	file_doc = _save_thumbnail_file(diagram, thumbnail)
	diagram.db_set("thumbnail", file_doc.file_url, update_modified=False)
	frappe.db.commit()
	return {"thumbnail": file_doc.file_url}


def _save_thumbnail_file(
	diagram: "frappe.model.document.Document", data_url: str
) -> "frappe.model.document.Document":
	"""Decode a base64 data URL into a private File attached to the diagram."""
	import base64

	header, _sep, encoded = data_url.partition(",")
	extension = "png" if "png" in header else "jpg"
	content = base64.b64decode(encoded)
	return frappe.get_doc(
		{
			"doctype": "File",
			"file_name": f"thumbnail-{diagram.name}.{extension}",
			"attached_to_doctype": DOCTYPE,
			"attached_to_name": diagram.name,
			"is_private": 1,
			"content": content,
			"decode": False,
		}
	).insert(ignore_permissions=True)


# --- trash / restore / duplicate ---------------------------------------------


@frappe.whitelist()
def trash_diagram(name: str) -> dict:
	"""Move a diagram to trash (SPEC §2 — no confirmation, trash is the net)."""
	diagram = _get_writable_diagram(name)
	diagram.is_trashed = 1
	diagram.trashed_on = now_datetime()
	diagram.save()
	frappe.db.commit()
	return {"name": diagram.name, "is_trashed": True}


@frappe.whitelist()
def restore_diagram(name: str) -> dict:
	"""Restore a trashed diagram back to the home grid."""
	diagram = _get_writable_diagram(name)
	diagram.is_trashed = 0
	diagram.trashed_on = None
	diagram.save()
	frappe.db.commit()
	return {"name": diagram.name, "is_trashed": False}


@frappe.whitelist()
def delete_diagram(name: str) -> dict:
	"""Permanently delete a diagram (from the Trash view)."""
	diagram = _get_writable_diagram(name)
	frappe.delete_doc(DOCTYPE, diagram.name)
	frappe.db.commit()
	return {"name": name, "deleted": True}


# --- scheduled maintenance ---------------------------------------------------


def purge_old_trashed_diagrams() -> None:
	"""Permanently delete diagrams trashed more than 30 days ago (SPEC §2).

	Registered as a daily scheduler event in hooks.py. Runs without a session
	user, so deletions bypass the per-user permission rules deliberately.
	"""
	from frappe.utils import add_days

	cutoff = add_days(now_datetime(), -30)
	stale = frappe.get_all(
		DOCTYPE,
		filters={"is_trashed": 1, "trashed_on": ["<", cutoff]},
		pluck="name",
	)
	for name in stale:
		frappe.delete_doc(DOCTYPE, name, ignore_permissions=True, force=True)
	if stale:
		frappe.db.commit()


@frappe.whitelist()
def duplicate_diagram(name: str) -> dict:
	"""Copy a diagram (document + metadata) into a fresh draft owned by the caller."""
	source = _get_readable_diagram(name)
	copy = frappe.get_doc(
		{
			"doctype": DOCTYPE,
			"title": _("{0} (copy)").format(source.title),
			"description": source.description,
			"folder": source.folder,
			"canvas_size": source.canvas_size,
			"document": source.document,
		}
	).insert()
	frappe.db.commit()
	return {"name": copy.name, "title": copy.title}
