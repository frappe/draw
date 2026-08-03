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
	"""on_update: mirror the diagram's title onto its backing Drive File (via
	Suite's own content-file sync). No-op without Drive."""
	_sync_content_file(doc, "on_update")


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
