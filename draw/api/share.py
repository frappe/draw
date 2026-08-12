# Writer-style sharing for Draw Diagram — view / comment / edit access levels,
# built on Frappe core DocShare (frappe.share) plus a custom "comment" permission
# type (registered by draw.patches.register_comment_permission_type). No Frappe
# Drive dependency.
#
# Two independent surfaces (GitHub #106):
#   - per-user access (view / comment / edit), below, via DocShare; and
#   - general access — a single VIEW-ONLY tier for everyone else: restricted /
#     site_users_view / public_view (see set_general_access). The tiers map to the
#     `is_public` and `all_site_users_can_view` flags and are enforced by
#     draw.api.permission (list) + draw.api.diagram (document read).
#
# Every endpoint that CHANGES access is POST-only. A whitelisted method with no
# `methods` is reachable by GET, which makes it a cross-site request away from
# being triggered by any page the victim visits — and a share is exactly the write
# an attacker would want, since it grants themselves standing access rather than
# damaging one document. The framework rolls a GET back, so nothing persisted
# today, but that is a property of the transaction handler rather than of this
# module: diagram.py already had a manual commit turn the same shape into a live
# CSRF write vector. The rest of Draw's write endpoints are POST-only; these were
# the exception (#422).

import frappe
from frappe import _
from frappe.utils import cint

from draw.api.permission import (
	GENERAL_ACCESS_LEVELS,
	PUBLIC_VIEW,
	SITE_USERS_VIEW,
	general_access_level,
)

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


def _validate_share_target(user: str) -> None:
	"""The share target must be a real, enabled user — the same set the invite box
	(`search_users`) offers. Guest/Administrator and disabled/unknown users are
	rejected so a share row can't be created for a login that can never use it."""
	if user in ("Administrator", "Guest"):
		frappe.throw(_("Cannot share with this user."))
	if not frappe.db.get_value("User", user, "enabled"):
		frappe.throw(_("Unknown or disabled user: {0}").format(user))


@frappe.whitelist(methods=["POST"])
def share_diagram(name: str, user: str, level: str = "view") -> list:
	"""Share a diagram with a user at view / comment / edit level (idempotent —
	re-sharing updates the level). Returns the current share list."""
	_check_can_share(name)
	_validate_share_target(user)
	flags = LEVEL_FLAGS.get(level)
	if not flags:
		frappe.throw(_("Unknown access level: {0}").format(level))
	# No delete-then-recreate. frappe.share.add_docshare() writes EVERY flag it is
	# given onto an existing row (`doc.update(share_perms)`), and LEVEL_FLAGS always
	# passes all four including the zeros — so lowering a level already clears the
	# rights it drops. The remove() that used to run first needed `delete` on the
	# DocShare doctype, which ordinary users do not hold, so re-sharing with someone
	# already on the list threw a bare 403 for everyone but Administrator (#194).
	# Dropping it also stops the row's owner and creation timestamp being churned on
	# every level change.
	frappe.share.add("Draw Diagram", name, user=user, notify=0, **flags)
	return get_diagram_shares(name)


@frappe.whitelist(methods=["POST"])
def unshare_diagram(name: str, user: str) -> list:
	"""Revoke a user's access. Returns the current share list."""
	_check_can_share(name)
	_delete_share_row(name, user)
	return get_diagram_shares(name)


def _delete_share_row(name: str, user: str) -> None:
	"""Drop a user's DocShare row for this diagram.

	Not frappe.share.remove(): that deletes through frappe.delete_doc() with
	permissions enforced, which demands `delete` on the DocShare DOCTYPE — a
	permission ordinary users do not hold, so revoking access failed for everyone
	but Administrator (#194). The check that actually matters, _check_can_share(),
	has already run above. Frappe's own set_docshare_permission() does the same
	thing: it sets ignore_permissions on the row before deleting it.
	"""
	share_name = frappe.db.get_value(
		"DocShare", {"user": user, "share_name": name, "share_doctype": "Draw Diagram"}
	)
	if share_name:
		frappe.delete_doc("DocShare", share_name, ignore_permissions=True)


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


_MIN_SEARCH_LEN = 2


def _escape_like(txt: str) -> str:
	"""Escape LIKE wildcards so a query of "%" or "_" can't match every user.
	Backslash first, then the two metacharacters (MariaDB's default escape char)."""
	return txt.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@frappe.whitelist()
def search_users(txt: str = "") -> list:
	"""Enabled users matching `txt` (name or full name), for the invite box.
	Excludes Guest/Administrator. A short query returns nothing so the endpoint
	can't be used to enumerate the whole user table one letter at a time."""
	txt = (txt or "").strip()
	if len(txt) < _MIN_SEARCH_LEN:
		return []
	like = f"%{_escape_like(txt)}%"
	return frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ["not in", ("Administrator", "Guest")]},
		or_filters={"name": ["like", like], "full_name": ["like", like]},
		fields=["name", "full_name", "user_image"],
		limit=10,
		order_by="full_name asc",
	)


@frappe.whitelist(methods=["POST"])
def set_general_access(name: str, level: str) -> str:
	"""Set a diagram's general-access tier (GitHub #106). VIEW-ONLY, one of:
	'restricted' (invited members only), 'site_users_view' (every signed-in site
	user may view) or 'public_view' (anyone with the link may view). Persisted as
	the `is_public` / `all_site_users_can_view` flags; returns the level set.

	General access never grants edit — that is what per-user shares are for."""
	_check_can_share(name)
	if level not in GENERAL_ACCESS_LEVELS:
		frappe.throw(_("Unknown general access level: {0}").format(level))
	frappe.db.set_value(
		"Draw Diagram",
		name,
		{
			"is_public": 1 if level == PUBLIC_VIEW else 0,
			"all_site_users_can_view": 1 if level == SITE_USERS_VIEW else 0,
		},
	)
	return level


@frappe.whitelist()
def get_general_access(name: str) -> str:
	"""The diagram's current general-access tier, for the Share dialog."""
	if not frappe.has_permission("Draw Diagram", "read", doc=name):
		frappe.throw(_("Not permitted."), frappe.PermissionError)
	flags = (
		frappe.db.get_value(
			"Draw Diagram", name, ["is_public", "all_site_users_can_view"], as_dict=True
		)
		or {}
	)
	return general_access_level(flags)


@frappe.whitelist(methods=["POST"])
def set_public(name: str, enabled: int) -> None:
	"""Backward-compatible shim for the old two-state public toggle: flip the
	public_view tier on/off via the diagram's is_public flag. New clients call
	set_general_access; this only ever touches is_public, so it is safe for any
	older caller still on the record.

	`enabled` MUST carry a type annotation. Frappe enforces that every argument of a
	whitelisted function is annotated and answers 417 FrappeTypeError otherwise — so
	without one this endpoint failed on every HTTP call while working perfectly when
	called in-process, which is exactly how the Python tests missed it. cint() still
	does the coercion, so a JSON number, a numeric string and a bool all work.
	"""
	_check_can_share(name)
	frappe.db.set_value("Draw Diagram", name, "is_public", 1 if cint(enabled) else 0)
