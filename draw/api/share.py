# Writer-style sharing for Draw Diagram — view / comment / edit access levels,
# built on Frappe core DocShare (frappe.share) plus a custom "comment" permission
# type (registered by draw.patches.register_comment_permission_type). No Frappe
# Drive dependency. Public access reuses the diagram's own `is_public` flag, which
# draw.api.permission.query_conditions already honours.

import frappe
from frappe import _
from frappe.utils import cint

# Access level -> DocShare flags. "edit" also grants share so collaborators can
# re-share, matching the Drive/Writer "editor" tier.
LEVEL_FLAGS = {
	"view": {"read": 1, "comment": 0, "write": 0, "share": 0},
	"comment": {"read": 1, "comment": 1, "write": 0, "share": 0},
	"edit": {"read": 1, "comment": 1, "write": 1, "share": 1},
}


def _check_can_share(name: str) -> None:
	if not frappe.has_permission("Draw Diagram", "share", doc=name):
		frappe.throw(_("You are not permitted to share this diagram."), frappe.PermissionError)


@frappe.whitelist()
def share_diagram(name: str, user: str, level: str = "view") -> list:
	"""Share a diagram with a user at view / comment / edit level (idempotent —
	re-sharing updates the level). Returns the current share list."""
	_check_can_share(name)
	flags = LEVEL_FLAGS.get(level)
	if not flags:
		frappe.throw(_("Unknown access level: {0}").format(level))
	# Clear any prior grant first so lowering a level actually removes flags.
	frappe.share.remove("Draw Diagram", name, user)
	frappe.share.add("Draw Diagram", name, user=user, notify=0, **flags)
	return get_diagram_shares(name)


@frappe.whitelist()
def unshare_diagram(name: str, user: str) -> list:
	"""Revoke a user's access. Returns the current share list."""
	_check_can_share(name)
	frappe.share.remove("Draw Diagram", name, user)
	return get_diagram_shares(name)


def _level_of(row) -> str:
	if row.get("write"):
		return "edit"
	if row.get("comment"):
		return "comment"
	return "view"


@frappe.whitelist()
def get_diagram_shares(name: str) -> list:
	"""The users this diagram is shared with, enriched for the Share dialog:
	{user, full_name, user_image, level, can_edit} + the raw read/write/comment
	flags. Excludes the public ("everyone") row."""
	if not frappe.has_permission("Draw Diagram", "read", doc=name):
		frappe.throw(_("Not permitted."), frappe.PermissionError)
	shares = []
	for row in frappe.share.get_users("Draw Diagram", name):
		if row.get("everyone") or not row.get("user"):
			continue
		info = frappe.db.get_value("User", row.user, ["full_name", "user_image"], as_dict=True) or {}
		shares.append(
			{
				"user": row.user,
				"full_name": info.get("full_name"),
				"user_image": info.get("user_image"),
				"read": row.read,
				"write": row.write,
				"comment": row.get("comment"),
				"level": _level_of(row),
				"can_edit": bool(row.write),
			}
		)
	return shares


@frappe.whitelist()
def search_users(txt: str = "") -> list:
	"""Enabled users matching `txt` (name or full name), for the invite box.
	Excludes Guest/Administrator."""
	like = f"%{txt or ''}%"
	return frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ["not in", ("Administrator", "Guest")]},
		or_filters={"name": ["like", like], "full_name": ["like", like]},
		fields=["name", "full_name", "user_image"],
		limit=10,
		order_by="full_name asc",
	)


@frappe.whitelist()
def set_public(name: str, enabled) -> None:
	"""Toggle "anyone in this site can view" via the diagram's is_public flag
	(honoured by draw.api.permission.query_conditions)."""
	_check_can_share(name)
	frappe.db.set_value("Draw Diagram", name, "is_public", 1 if cint(enabled) else 0)
