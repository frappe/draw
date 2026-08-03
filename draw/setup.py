# Idempotent app setup, run from BOTH the after_install and after_migrate hooks.
#
# Why hooks and not patches: patches in patches.txt are marked complete WITHOUT
# executing on a fresh install (they exist to migrate existing data), so a fresh
# Frappe Cloud install would otherwise never get the Draw User role or the custom
# permission type. Running an idempotent setup from after_install (fresh) +
# after_migrate (upgrades) covers both.

import frappe

ROLE = "Draw User"
OWNED_DOCTYPES = ("Draw Diagram", "Draw Folder")


def ensure_setup(*args, **kwargs) -> None:
	"""Create the Draw User role + owner-scoped perms and register the diagram
	"comment" permission type. Safe to run repeatedly."""
	_ensure_role()
	for doctype in OWNED_DOCTYPES:
		_ensure_owner_permission(doctype)
	_ensure_comment_permission_type()
	frappe.clear_cache()


def grant_draw_user_role(doc, method: str | None = None) -> None:
	"""Give a newly created real user the Draw User role so they can use Draw
	without an operator having to fall back to System Manager — for whom
	`query_conditions` returns "" (full access), which is the leak behind
	GitHub #73.

	Wired as the User `after_insert` doc event and reused by the back-fill patch.
	Guarded end to end: a failure here must never stop a User from being saved.
	The role itself is created by `ensure_setup` (after_install / after_migrate),
	so by the time a user is inserted it already exists; granting an existing
	role is a no-op.
	"""
	try:
		user = doc.name
		if user in ("Guest", "Administrator"):
			return
		if not frappe.db.get_value("User", user, "enabled"):
			return
		roles = set(frappe.get_roles(user))
		# System Managers already see everything, so the owner-scoped role is
		# pointless for them; and re-granting an existing role is wasted work.
		if ROLE in roles or "System Manager" in roles:
			return
		frappe.get_doc("User", user).add_roles(ROLE)
	except Exception:
		frappe.log_error(title=f"Draw: could not grant {ROLE} role")


def _ensure_role() -> None:
	"""Create the Draw User role idempotently (desk-enabled, normal users get it)."""
	if frappe.db.exists("Role", ROLE):
		return
	frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
		ignore_permissions=True
	)


def _ensure_owner_permission(doctype: str) -> None:
	"""Add an if_owner perm row for Draw User on the given doctype if missing."""
	if frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": ROLE, "if_owner": 1}):
		return
	frappe.get_doc(
		{
			"doctype": "Custom DocPerm",
			"parent": doctype,
			"parenttype": "DocType",
			"parentfield": "permissions",
			"role": ROLE,
			"if_owner": 1,
			"read": 1,
			"write": 1,
			"create": 1,
			"delete": 1,
			"share": 1,
		}
	).insert(ignore_permissions=True)


def _ensure_comment_permission_type() -> None:
	"""Register a "comment" permission type for Draw Diagram so diagrams can be
	shared at a view / comment / edit level. Adds a `comment` Check to DocShare +
	the doctype's perm rules. No-ops on Frappe versions without Permission Type."""
	if not frappe.db.exists("DocType", "Permission Type"):
		return
	if frappe.db.exists("Permission Type", {"doc_type": "Draw Diagram", "perm_type": "comment"}):
		return
	frappe.get_doc(
		{"doctype": "Permission Type", "doc_type": "Draw Diagram", "perm_type": "comment"}
	).insert(ignore_permissions=True)
