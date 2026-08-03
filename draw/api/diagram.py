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

from draw.api.permission import can_view_via_general_access

DOCTYPE = "Draw Diagram"


class StaleRevisionError(frappe.ValidationError):
	"""A save rejected because the server holds a newer revision. A distinct type so
	the client detects the conflict from the response `exc_type`, not the translatable
	message text (which broke stale-revision handling on non-English sites)."""


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

	# General access grants VIEW without a per-user share: public_view lets anyone
	# in (guests included), site_users_view lets any signed-in user in. This is the
	# only path a guest ever reads through.
	if can_view_via_general_access(diagram):
		return diagram

	user = frappe.session.user
	if user == "Guest":
		raise frappe.PermissionError(_("You need access to view this diagram"))

	if diagram.owner == user:
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
def save_diagram(name: str, document: str, revision: int, crdt_state: str | None = None) -> dict:
	"""Persist a diagram document, guarding against a stale (conflicting) write.

	If the stored revision is newer than the one the client last saw, the save
	is rejected so the editor can freeze with a "changed elsewhere" prompt
	(SPEC §8 two-tab / concurrent-edit conflict).

	`crdt_state` is the base64 Yjs update binary for the same edits. Stored beside
	`document` so the offline cache and the server share one CRDT lineage — the
	editor seeds its Yjs doc from it on open, so a cached copy merges rather than
	clobbering a newer server document. Optional: a client without collaboration
	active omits it, and the stored value is left untouched.
	"""
	diagram = _get_writable_diagram(name)
	_assert_fresh_revision(diagram, revision)

	diagram.document = _normalize_document(document)
	if crdt_state is not None:
		diagram.crdt_state = _validate_crdt_state(crdt_state)
	diagram.save()
	# No explicit commit: this is a POST, so the framework commits the transaction at
	# the end of a successful request. A manual commit here previously made a GET
	# (which the framework rolls back) durable anyway — a CSRF write vector.
	return {"name": diagram.name, "revision": diagram.revision, "modified": str(diagram.modified)}


# The Yjs update grows with the document but stays far under this; the cap only
# stops a crafted client from parking an arbitrarily large blob on the row.
_MAX_CRDT_STATE_CHARS = 12 * 1024 * 1024


def _validate_crdt_state(crdt_state: str) -> str:
	"""Bound the client-supplied CRDT binary. Type is enforced by the annotation."""
	if len(crdt_state) > _MAX_CRDT_STATE_CHARS:
		frappe.throw(_("Collaboration state is too large"), frappe.ValidationError)
	return crdt_state


def _assert_fresh_revision(diagram: "frappe.model.document.Document", revision: int) -> None:
	"""Reject the save when the server already holds a newer revision."""
	server_revision = diagram.revision or 0
	if int(revision) < server_revision:
		frappe.throw(
			_("This diagram was changed elsewhere — reload."),
			StaleRevisionError,
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
	previous = diagram.thumbnail
	file_doc = _save_thumbnail_file(diagram, thumbnail)
	diagram.db_set("thumbnail", file_doc.file_url, update_modified=False)
	# The client re-saves the thumbnail up to once every 30s, each time a NEW File;
	# drop the one it replaces so File rows and private blobs don't grow unbounded
	# over a diagram's life. Done after the repoint so a failure can't orphan the new.
	_delete_thumbnail_file(diagram, previous)
	# POST-only endpoint: the framework commits on a successful request. See the note
	# in save_diagram — the removed manual commit was a CSRF-via-GET write vector.
	return {"thumbnail": file_doc.file_url}


def _delete_thumbnail_file(diagram: "frappe.model.document.Document", file_url: str | None) -> None:
	"""Delete the diagram's previous thumbnail File, if any and if different."""
	if not file_url or file_url == diagram.thumbnail:
		return
	old = frappe.db.get_value(
		"File",
		{"file_url": file_url, "attached_to_doctype": DOCTYPE, "attached_to_name": diagram.name},
	)
	if old:
		frappe.delete_doc("File", old, ignore_permissions=True)


def _save_thumbnail_file(
	diagram: "frappe.model.document.Document", data_url: str
) -> "frappe.model.document.Document":
	"""Decode a base64 data URL into a private File attached to the diagram."""
	import base64
	import binascii

	header, _sep, encoded = data_url.partition(",")
	extension = "png" if "png" in header else "jpg"
	try:
		content = base64.b64decode(encoded, validate=True)
	except (binascii.Error, ValueError):
		frappe.throw(_("Could not read the thumbnail image"), frappe.ValidationError)
	# A thumbnail is a small downscaled PNG/JPEG; cap the decoded size so a malformed
	# or hostile data URL can't write an arbitrarily large private file.
	if len(content) > 2 * 1024 * 1024:
		frappe.throw(_("Thumbnail is too large"), frappe.ValidationError)
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


# --- inserted images (#74) ---------------------------------------------------

# Mirrors the frontend picker (useImageInsert.js ACCEPT).
_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024


@frappe.whitelist(methods=["POST"])
def upload_diagram_image(name: str) -> dict:
	"""Store an image inserted onto the canvas as a File ATTACHED to the diagram.

	Reached through Frappe's upload endpoint (frappe-ui FileUploadHandler passes
	`method=...`), so the bytes arrive in `frappe.local.uploaded_file`. We insert
	the File here — server-side, exactly like the thumbnail — instead of letting
	the upload endpoint create a loose File. Suite's Drive adopts every loose File
	the upload endpoint creates into the uploader's Drive Home
	(suite/drive/overrides/file.py:after_file_upload), so inserting N images used
	to leave N stray files there (#74). A File created by a plain `.insert()` is
	never seen by that hook, so no stray entries appear — and being attached to the
	diagram, the image is owned by it and cleaned up when the diagram is deleted.

	Kept PUBLIC (is_private=0): the file_url is embedded in the diagram document and
	must render for anyone the diagram is shared/exported to, exactly as before."""
	diagram = _get_writable_diagram(name)

	content, filename = _uploaded_image()
	if not content:
		frappe.throw(_("No image was uploaded"), frappe.ValidationError)
	if len(content) > _MAX_IMAGE_BYTES:
		frappe.throw(_("Image is too large"), frappe.ValidationError)
	extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
	if extension not in _IMAGE_EXTENSIONS:
		frappe.throw(_("Only image files can be inserted"), frappe.ValidationError)

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": DOCTYPE,
			"attached_to_name": diagram.name,
			"is_private": 0,
			"content": content,
			"decode": False,
		}
	).insert(ignore_permissions=True)
	return {"file_url": file_doc.file_url, "file_name": file_doc.file_name}


def _uploaded_image() -> tuple[bytes | None, str]:
	"""The uploaded image's bytes + filename. Frappe's upload endpoint hands the
	content to a delegated `method` via frappe.local.uploaded_file; fall back to the
	raw request file if a frappe build doesn't populate it."""
	content = getattr(frappe.local, "uploaded_file", None)
	filename = getattr(frappe.local, "uploaded_filename", None)
	if not content:
		request = getattr(frappe, "request", None)
		upload = request.files.get("file") if request and request.files else None
		if upload is not None:
			content = upload.stream.read()
			filename = filename or upload.filename
	return content, filename or "image"


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
