# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

# Whitelisted API for the Draw Diagram editor (SPEC §8 persistence, §2 trash):
# owner-or-public reads, revision-checked saves, thumbnail upload, and the daily
# trash purge. Guests may read only public diagrams.
#
# Deliberately NOT here: listing, trash/restore/delete, duplicate and sharing. The
# frontend does all of that CRUD through frappe-ui's list/document resources (see
# frontend/src/data/diagrams.js and TileGrid's duplicate/trash handlers), and
# sharing lives in draw/api/share.py, which is the only implementation — it carries
# the three-level view/comment/edit model. Parallel endpoints for those used to sit
# in this module, unused, and a caller reaching one would have got weaker access
# rules than the live path applies.

import hashlib
import hmac
import json

import frappe
from frappe import _
from frappe.utils import cint, now_datetime
from frappe.utils.password import get_encryption_key

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


# --- real-time collaboration room (SPEC §11.1) -------------------------------
# The editor syncs peer-to-peer over Frappe's *public* signaling server, so the
# room id is the only thing separating one session from another. Deriving it
# from the diagram name alone put every site that slugged a title the same way
# ("flowchart-1") into a single shared room. Room id and encryption password are
# therefore HMACs keyed on the site's encryption key: unguessable from outside
# and distinct per site.
#
# Nothing sits between the peers, so anyone inside a room can write to the shared
# document whatever their client claims. The room is therefore issued only to
# users who may edit, and it is derived from the current access list as well, so
# revoking a share moves everyone else to a new room the revoked user cannot
# derive.


@frappe.whitelist()
def get_collab_room(name: str) -> dict:
	"""Room id and encryption password for a diagram's live session.

	Returns an empty room for a user who may read the diagram but not edit it:
	there is no server in the peer-to-peer data path to hold them to read-only,
	so they stay out of the session entirely.
	"""
	diagram = _get_readable_diagram(name)
	if not (diagram.owner == frappe.session.user or diagram.has_permission("write")):
		return {"room": None}

	access = _access_fingerprint(diagram)
	return {
		"room": _room_secret(diagram.name, "room", access),
		"password": _room_secret(diagram.name, "password", access),
	}


def _access_fingerprint(diagram: "frappe.model.document.Document") -> str:
	"""Digest of who may reach this diagram, mixed into the room id.

	Peers poll for the current room, so a share change moves the session. The
	user who lost access cannot compute the new room and is left behind in the
	old one, alone.
	"""
	shares = frappe.get_all(
		"DocShare",
		filters={"share_doctype": DOCTYPE, "share_name": diagram.name},
		fields=["user", "read", "write", "everyone"],
		order_by="user asc",
	)
	rows = [f"{s.user or ''}:{cint(s.read)}{cint(s.write)}{cint(s.everyone)}" for s in shares]
	rows.append(f"owner:{diagram.owner}")
	return hashlib.sha256("|".join(rows).encode()).hexdigest()


def _room_secret(name: str, purpose: str, access: str) -> str:
	"""Site-scoped, unguessable token for a diagram's collaboration room."""
	message = f"draw:{purpose}:{name}:{access}".encode()
	return hmac.new(get_encryption_key().encode(), message, hashlib.sha256).hexdigest()


# --- writes ------------------------------------------------------------------


@frappe.whitelist(methods=["POST"])
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
	# No explicit commit: this is a POST, so the framework commits the transaction at
	# the end of a successful request. A manual commit here previously made a GET
	# (which the framework rolls back) durable anyway — a CSRF write vector.
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


@frappe.whitelist(methods=["POST"])
def save_thumbnail(name: str, thumbnail: str) -> dict:
	"""Attach a freshly rendered thumbnail (a data URL) to the diagram.

	Throttling is the client's responsibility (SPEC §11.4, ≤ once / 30s); this
	just decodes the data URL, writes a private file, and links it.
	"""
	diagram = _get_writable_diagram(name)
	file_doc = _save_thumbnail_file(diagram, thumbnail)
	diagram.db_set("thumbnail", file_doc.file_url, update_modified=False)
	# POST-only endpoint: the framework commits on a successful request. See the note
	# in save_diagram — the removed manual commit was a CSRF-via-GET write vector.
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
