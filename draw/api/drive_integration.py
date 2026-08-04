# OPTIONAL Frappe Drive integration, targeting SUITE's built-in Drive (and still
# tolerating the standalone Drive app). Deliberately SOFT-COUPLED: Draw does NOT
# list Drive/Suite in required_apps, and every entry point here no-ops cleanly when
# neither is installed — so Draw stays installable standalone (e.g. on Frappe Cloud
# without Drive).
#
# Suite's Drive is the core File doctype with custom fields and per-user folders
# (NO team). A diagram is registered as ONE Drive "content" File — a File row with
# content_doctype="Draw Diagram" + content_docname=<name> — exactly the pattern
# Writer/Slides use (see suite/slides/doctype/presentation/presentation.py). That
# makes a new diagram auto-save into the owner's Drive Home like a Writer/Slides doc.
#
# All Drive calls go through defensive imports so a broken/absent Drive can never
# block creating, editing, or deleting a diagram.

import frappe


def drive_available() -> bool:
	"""True when a usable Drive backend is present: Suite's built-in Drive
	(preferred) or the standalone Drive app. Replaces the old
	`"drive" in installed_apps` check, which is False under Suite (Suite ships
	Drive as a module, not a separate app)."""
	installed = frappe.get_installed_apps()
	if "suite" in installed:
		try:
			import suite.drive  # noqa: F401

			return True
		except ImportError:
			return False
	return "drive" in installed


def _drive_file_cls():
	"""Suite's Drive-backed File class (the content-doc SDK), or None when Suite's
	Drive is not importable — e.g. under the standalone Drive app, which has no
	equivalent content-doc API, so registration simply no-ops there."""
	try:
		from suite.drive.overrides.file import File as DriveFile

		return DriveFile
	except ImportError:
		return None


def register_diagram_in_drive(diagram_name: str) -> str | None:
	"""Register a diagram as ONE Drive File so it shows in the owner's Drive Home,
	like a Writer/Slides document. Idempotent (reuses the existing File), and a
	safe no-op when Drive is absent or unusable. Returns the File name, or None."""
	if frappe.session.user == "Guest":
		return None
	if not drive_available() or not frappe.db.exists("Draw Diagram", diagram_name):
		return None
	# Never register (and thereby disclose the title of, via create_for_doc) a diagram
	# the caller cannot read. The whitelisted add_to_drive() path reaches here by name,
	# and this function reads the doc directly, bypassing permission checks. after_insert
	# still passes — the session user is the owner, who can read it.
	if not frappe.has_permission("Draw Diagram", "read", doc=diagram_name):
		return None

	drive_file_cls = _drive_file_cls()
	if drive_file_cls is None:
		return None

	existing = drive_file_cls.get_for_doc("Draw Diagram", diagram_name)
	if existing:
		return existing

	diagram = frappe.get_doc("Draw Diagram", diagram_name)
	# One File per diagram, placed in the session user's private Drive folder.
	# content_doctype/content_docname are derived from the doc by create_for_doc.
	drive_file = drive_file_cls.create_for_doc(diagram, file_type="Diagram", mime_type="frappe/draw")
	return getattr(drive_file, "name", None)


# --- doc_events (wired in hooks.py) ------------------------------------------
# These are Draw's OWN defensive wrappers, so the coupling to Drive stays here and
# a Drive failure never propagates into the Draw Diagram lifecycle.


def auto_register_diagram(doc: "frappe.model.document.Document", method: str | None = None) -> None:
	"""after_insert: auto-save a newly created diagram to the owner's Drive."""
	_guard(lambda: register_diagram_in_drive(doc.name), "Draw: Drive auto-register failed")


def sync_diagram_drive_file(doc: "frappe.model.document.Document", method: str | None = None) -> None:
	"""on_update: mirror the diagram's title onto its backing Drive File (via Suite's
	own content-file sync), then mirror its soft-trash state. No-op without Drive."""
	_sync_content_file(doc, "on_update")
	_guard(lambda: _mirror_trash_status(doc), "Draw: Drive trash sync failed")


def _mirror_trash_status(doc: "frappe.model.document.Document") -> None:
	"""Mirror a diagram's soft-trash onto its backing Drive File's `status`
	(Active/Trashed), so a diagram trashed in Draw leaves the owner's Drive Home and
	an untrash restores it.

	Suite's own `sync_content_file` only mirrors soft-trash when the content doctype
	has a field literally named `trashed`; Draw Diagram uses `is_trashed` instead, so
	without this a soft-trashed diagram would linger in Drive as Active until it is
	hard-deleted. Runs only on an `is_trashed` transition (so an ordinary title/content
	save never touches the File's status), and is a safe no-op without Drive or a
	backing File."""
	if not drive_available():
		return
	before = doc.get_doc_before_save()
	was_trashed = bool(before.is_trashed) if before else False
	now_trashed = bool(doc.is_trashed)
	if was_trashed == now_trashed:
		return
	drive_file_cls = _drive_file_cls()
	if drive_file_cls is None:
		return
	file_name = drive_file_cls.get_for_doc("Draw Diagram", doc.name)
	if not file_name:
		return
	# Direct column write, the way Suite's sync_content_file flips status — no File
	# doc lifecycle, so it can't recurse back through the content-file sync.
	frappe.db.set_value("File", file_name, "status", "Trashed" if now_trashed else "Active")


def trash_diagram_drive_file(doc: "frappe.model.document.Document", method: str | None = None) -> None:
	"""on_trash: remove the backing Drive File when a diagram is hard-deleted."""
	_sync_content_file(doc, "on_trash")


def _sync_content_file(doc: "frappe.model.document.Document", event: str) -> None:
	if not drive_available():
		return
	try:
		from suite.drive.overrides.file import sync_content_file
	except ImportError:
		return  # Standalone Drive / no Suite content-file sync — nothing to mirror.
	_guard(lambda: sync_content_file(doc, event), "Draw: Drive sync failed")


def _guard(fn, error_title: str) -> None:
	"""Run a Drive side effect, swallowing (but logging) any failure so it can
	never block the diagram's own save/delete."""
	try:
		fn()
	except Exception:
		frappe.log_error(title=error_title)


# --- whitelisted -------------------------------------------------------------


@frappe.whitelist()
def is_available() -> dict:
	"""Whether the Drive integration can be used. The editor toolbar and the Home
	"install Drive" banner call this; it must always return the two booleans
	without raising, Drive present or not. Under Suite a user's Drive folder is
	created on first use, so `ready` tracks availability (there is no team to set
	up)."""
	available = drive_available()
	return {"installed": available, "ready": available}


@frappe.whitelist()
def add_to_drive(name: str) -> dict:
	"""Manual (re-)register entry point, kept as a fallback now that registration
	is automatic on create (e.g. for diagrams made before this shipped, or if the
	auto-register was a no-op because Drive was installed later). Idempotent."""
	return {"drive_installed": drive_available(), "file": register_diagram_in_drive(name)}


@frappe.whitelist()
def move_to_drive_folder(name: str, folder: str | None = None) -> dict:
	"""Move a diagram's backing Drive File into `folder` (a Drive File id), or into
	the owner's Drive Home when `folder` is empty (#105). No-op shape when Drive is
	absent so the toolbar can stay wired everywhere.

	Ensures a backing File first (idempotent), then delegates to Suite's File.move.
	move() runs its OWN upload/write permission checks and folder validation, throwing
	frappe.PermissionError / NotADirectoryError / ValueError — those are deliberately
	left to PROPAGATE (this is a user-initiated action, so the UI should surface the
	real error rather than silently swallow it)."""
	if not drive_available():
		return {"drive_installed": False, "moved": False, "file": None}
	file_name = register_diagram_in_drive(name)
	if not file_name:
		return {"drive_installed": True, "moved": False, "file": None}
	frappe.get_doc("File", file_name).move(folder or None)
	return {"drive_installed": True, "moved": True, "file": file_name}


@frappe.whitelist()
def list_drive_folders(parent: str | None = None) -> dict:
	"""List the sub-folders of a Drive folder (defaulting to the owner's Home), plus
	the Home-down-to-here breadcrumb, so the "Move to folder" dialog can browse the
	tree (#105). Everything is permission-checked and scoped to what the caller can
	read, by Suite's own list/breadcrumb helpers.

	Returns the drive-absent shape when Drive is unusable — including a partial/broken
	Suite whose Drive API can't be imported — so a missing dependency can never 500
	the browser."""
	absent = {"drive_installed": False, "current": None, "path": [], "folders": []}
	if not drive_available():
		return absent
	try:
		from suite.drive.api.list import files as drive_files
		from suite.drive.api.permissions import get_user_access
		from suite.drive.utils import get_user_folder, get_valid_breadcrumbs
		entity = parent or get_user_folder().name
		# file_kinds=["Folder"] filters the listing to folders (Suite maps the "Folder"
		# kind to is_folder == 1). Re-check is_folder when mapping in case that changes.
		rows = drive_files(entity_name=entity, file_kinds=["Folder"])
		folders = [{"name": r["name"], "title": r.get("file_name")} for r in rows if r.get("is_folder")]
		# Ancestry from Home down to `entity`; Suite relabels the user's own folder "Home".
		path = [
			{"name": node["name"], "title": node["file_name"]}
			for node in get_valid_breadcrumbs(entity, get_user_access(entity))
		]
		return {"drive_installed": True, "current": entity, "path": path, "folders": folders}
	except ImportError:
		# Standalone Drive / partial Suite — no folder-browsing API to offer.
		return absent
	except Exception:
		# A broken/partial Drive (e.g. a missing table on an incomplete install) must
		# never 500 the browser — log for triage and degrade to the drive-absent shape.
		frappe.log_error(title="Draw: Drive folder listing failed")
		return absent


@frappe.whitelist()
def diagram_drive_path(name: str) -> dict:
	"""The FOLDER ancestry (Home -> ... -> the folder the diagram sits in) of a diagram's
	backing Drive File, so the editor toolbar can render a Drive-path breadcrumb (#112).
	The diagram's own title is the editable last crumb (rendered by TitleEditor), so the
	diagram's own File node is EXCLUDED here -- `path` is folders only.

	Soft-coupled like the rest of this module: returns the drive-absent shape when Drive
	is unusable -- including a partial/broken Suite whose Drive API can't be imported --
	so a missing dependency can never 500 the editor; the toolbar then falls back to the
	static "Frappe Draw / <title>" crumb. Never discloses a diagram's Drive location to a
	caller who cannot read it."""
	absent = {"drive_installed": False, "registered": False, "path": []}
	if not drive_available():
		return absent
	try:
		from suite.drive.api.permissions import get_user_access
		from suite.drive.overrides.file import File
		from suite.drive.utils import get_valid_breadcrumbs
		# Read-permission first (mirrors register_diagram_in_drive): don't leak the path of a
		# diagram -- or that one even exists -- to a caller who cannot read it.
		not_registered = {"drive_installed": True, "registered": False, "path": []}
		if not frappe.db.exists("Draw Diagram", name):
			return not_registered
		if not frappe.has_permission("Draw Diagram", "read", doc=name):
			return not_registered

		file_name = File.get_for_doc("Draw Diagram", name)
		if not file_name:
			# Diagram not yet backed by a Drive File (e.g. made before the integration, or
			# before Drive was installed); the toolbar shows the static crumb.
			return not_registered

		# get_valid_breadcrumbs returns root -> ... -> the File itself as the LAST node (the
		# same shape list_drive_folders treats as "current"). Drop that last node so `path`
		# is the folder ancestry only -- the diagram's title is the separate last crumb.
		crumbs = get_valid_breadcrumbs(file_name, get_user_access(file_name))
		folders = crumbs[:-1] if crumbs else []
		# Suite relabels the user's own root as "Home".
		path = [{"name": node["name"], "title": node["file_name"]} for node in folders]
		return {"drive_installed": True, "registered": True, "path": path}
	except ImportError:
		# Standalone Drive / partial Suite -- no breadcrumb API to offer.
		return absent
	except Exception:
		# A broken/partial Drive (e.g. a missing table) must never 500 the editor -- log
		# and degrade to the drive-absent shape; the toolbar shows the static crumb.
		frappe.log_error(title="Draw: Drive breadcrumb failed")
		return absent
