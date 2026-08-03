# Permission helpers for Draw Diagram sharing (Writer-style view/edit/comment).
# Diagrams are owner-scoped by default (the Draw User role's if_owner perms); this
# widens list visibility to also include diagrams shared with the user (Frappe core
# DocShare) and ones opened via general access (public / all-site-users). Per-user
# read/write come from DocShare automatically; the custom "comment" permission type
# is checked via frappe.has_permission("Draw Diagram", "comment", doc=name).

import frappe

# General-access tiers (GitHub #106). A diagram's "general access" is one of three
# VIEW-ONLY levels — it never grants edit:
#   restricted      — only the owner and explicitly invited members (the default)
#   site_users_view — every logged-in site user may view it (guests may NOT)
#   public_view     — anyone with the link may view it, guests included
# public_view is stored in the long-standing `is_public` flag, so existing public
# diagrams keep working with no migration; site_users_view adds one flag,
# `all_site_users_can_view`. If both are somehow set, is_public (the wider tier)
# wins. These tiers are enforced here (list) and in draw.api.diagram (document
# read) — NOT through core has_permission, whose hooks can only deny, never grant.
RESTRICTED = "restricted"
SITE_USERS_VIEW = "site_users_view"
PUBLIC_VIEW = "public_view"
GENERAL_ACCESS_LEVELS = (RESTRICTED, SITE_USERS_VIEW, PUBLIC_VIEW)


def has_app_permission(user: str | None = None) -> bool:
	"""Whether to show Frappe Draw on the Desk /apps launcher — any signed-in
	(non-Guest) user."""
	return (user or frappe.session.user) != "Guest"


def general_access_level(diagram) -> str:
	"""The diagram's general-access tier, derived from its flags. Accepts a document
	or any mapping exposing `is_public` / `all_site_users_can_view`."""
	if diagram.get("is_public"):
		return PUBLIC_VIEW
	if diagram.get("all_site_users_can_view"):
		return SITE_USERS_VIEW
	return RESTRICTED


def can_view_via_general_access(diagram, user: str | None = None) -> bool:
	"""Whether `user` may VIEW `diagram` through its general-access tier alone —
	independent of ownership or any per-user share. Public diagrams are viewable by
	everyone (guests included); site_users_view by any signed-in user, never a
	guest."""
	if diagram.get("is_public"):
		return True
	user = user or frappe.session.user
	return bool(diagram.get("all_site_users_can_view")) and user != "Guest"


def query_conditions(user: str | None = None) -> str:
	"""SQL clause limiting Draw Diagram list queries to what `user` may see: their
	own diagrams, ones shared with them, public ones, and — for any signed-in user —
	ones opened to all site users. System Managers (full access) get no restriction."""
	user = user or frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return ""

	table = "`tabDraw Diagram`"
	conditions = [
		f"{table}.owner = {frappe.db.escape(user)}",
		f"{table}.is_public = 1",
	]
	# Middle tier: every signed-in site user may see these (guests may not).
	if user != "Guest":
		conditions.append(f"{table}.all_site_users_can_view = 1")
	shared = frappe.share.get_shared("Draw Diagram", user)
	if shared:
		names = ", ".join(frappe.db.escape(name) for name in shared)
		conditions.append(f"{table}.name in ({names})")
	return "(" + " or ".join(conditions) + ")"
