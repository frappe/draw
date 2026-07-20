# OPTIONAL Frappe Drive integration: register a Draw diagram as a Drive file so it
# shows up in the user's Drive, like a Sheets/Slides/Writer doc. Deliberately
# soft-coupled — Draw does NOT list Drive in required_apps, so it stays installable
# standalone (e.g. on Frappe Cloud without Drive). Every entry point no-ops cleanly
# when Drive is absent or not yet set up (no team).
#
# A diagram is registered as a Drive "native document" File: a File row with
# content_doctype="Draw Diagram" + content_docname=<name> (Drive's own pattern for
# app-owned docs). Rendering the diagram INSIDE Drive needs a Drive-side viewer for
# this content type (a Drive change), which is out of scope here.

import frappe


def drive_installed() -> bool:
	return "drive" in frappe.get_installed_apps()


def _default_team() -> str | None:
	"""A Drive team to place the file in: the first the user belongs to, else the
	first team on the site. None when Drive has no team yet (not set up)."""
	if frappe.db.has_column("Drive Team Member", "user"):
		mine = frappe.get_all(
			"Drive Team Member", filters={"user": frappe.session.user}, pluck="parent", limit=1
		)
		if mine:
			return mine[0]
	teams = frappe.get_all("Drive Team", pluck="name", limit=1)
	return teams[0] if teams else None


def diagram_link(diagram_name: str) -> str:
	"""The Draw editor route for a diagram — the Drive link target."""
	return f"/draw/d/{diagram_name}"


def register_in_drive(diagram_name: str, team: str | None = None) -> str | None:
	"""Register the diagram in Drive as a LINK file that opens the Draw editor
	(/draw/d/<name>) — so it appears in Drive and clicking it opens the diagram in
	Draw, with NO Drive-side renderer needed. Returns the File name, or None when
	Drive is unavailable / not set up (no team). Idempotent — reuses an existing
	link for this diagram."""
	if not drive_installed() or not frappe.db.exists("Draw Diagram", diagram_name):
		return None
	team = team or _default_team()
	if not team:
		return None  # Drive present but not set up (no team) — nothing to do yet.

	link = diagram_link(diagram_name)
	existing = frappe.db.exists("File", {"file_url": link, "team": team})
	if existing:
		return existing

	from drive.api.files import create_link

	diagram = frappe.get_doc("Draw Diagram", diagram_name)
	drive_file = create_link(team, diagram.title or diagram_name, link)
	return drive_file.name


@frappe.whitelist()
def add_to_drive(name: str) -> dict:
	"""Whitelisted entry point for an "Add to Drive" action. Returns whether Drive
	is available and the linked File name if created."""
	file_name = register_in_drive(name)
	return {"drive_installed": drive_installed(), "file": file_name}
