# Permission helpers for Draw Diagram sharing (Writer-style view/edit/comment).
# Diagrams are owner-scoped by default (the Draw User role's if_owner perms); this
# widens list visibility to also include diagrams shared with the user (Frappe
# core DocShare) and public ones. Document-level read/write come from DocShare
# automatically; the custom "comment" permission type is checked via
# frappe.has_permission("Draw Diagram", "comment", doc=name).

import frappe


def has_app_permission(user: str | None = None) -> bool:
	"""Whether to show Frappe Draw on the Desk /apps launcher — any signed-in
	(non-Guest) user."""
	return (user or frappe.session.user) != "Guest"


def query_conditions(user: str | None = None) -> str:
	"""SQL clause limiting Draw Diagram list queries to what `user` may see:
	their own diagrams, ones shared with them, and public ones. System Managers
	(full access) get no restriction."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""

	table = "`tabDraw Diagram`"
	conditions = [
		f"{table}.owner = {frappe.db.escape(user)}",
		f"{table}.is_public = 1",
	]
	shared = frappe.share.get_shared("Draw Diagram", user)
	if shared:
		names = ", ".join(frappe.db.escape(name) for name in shared)
		conditions.append(f"{table}.name in ({names})")
	return "(" + " or ".join(conditions) + ")"
