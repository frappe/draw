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
	# The permission type first: it adds the `comment` field to Custom DocPerm, and
	# the perm row below is written with that flag set.
	_ensure_comment_permission_type()
	for doctype in OWNED_DOCTYPES:
		_ensure_owner_permission(doctype)
	frappe.clear_cache()


def grant_draw_user_role(user: str) -> None:
	"""Give `user` the owner-scoped Draw User role so they can use Draw without an
	operator having to fall back to System Manager — for whom `query_conditions`
	returns "" (full access), which is the leak behind GitHub #73.

	Called lazily from the Draw SPA boot (draw/www/draw.py) for whoever opens
	Draw, and by the back-fill patch for existing System Users. It is deliberately
	NOT wired to User `after_insert`: that fires for every app's signups and would
	promote unrelated Website / portal users on a multi-app bench to desk (System)
	users.

	Guarded end to end: skips Guest / Administrator / disabled / existing holders /
	System Managers, and never raises (so it can't break a page load). Saves with
	`ignore_permissions` because the caller is usually the unprivileged user
	themselves, who may not edit their own roles. The role is created by
	`ensure_setup` (after_install / after_migrate), so it always exists by the time
	this runs; granting an existing role is a no-op.
	"""
	try:
		if user in ("Guest", "Administrator"):
			return
		if not frappe.db.get_value("User", user, "enabled"):
			return
		roles = set(frappe.get_roles(user))
		# System Managers already see everything, so the owner-scoped role is
		# pointless for them; and re-granting an existing role is wasted work.
		if ROLE in roles or "System Manager" in roles:
			return
		user_doc = frappe.get_doc("User", user)
		user_doc.append_roles(ROLE)
		user_doc.save(ignore_permissions=True)
	except Exception:
		frappe.log_error(title=f"Draw: could not grant {ROLE} role")


def _ensure_role() -> None:
	"""Create the Draw User role idempotently (desk-enabled, normal users get it)."""
	if frappe.db.exists("Role", ROLE):
		return
	frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(
		ignore_permissions=True
	)


def _has_comment_permission_type(doctype: str) -> bool:
	"""Whether the custom "comment" permission type is registered for `doctype`.
	False on Frappe versions that have no Permission Type doctype at all."""
	if not frappe.db.exists("DocType", "Permission Type"):
		return False
	return bool(frappe.db.exists("Permission Type", {"doc_type": doctype, "perm_type": "comment"}))


def _owner_permission_flags(doctype: str) -> dict:
	"""The rights the Draw User if_owner row grants on `doctype`.

	`comment` comes with the custom permission type (GitHub #172): sharing at the
	comment / edit level sets the DocShare `comment` flag, and Frappe only lets you
	grant a right you hold yourself (`frappe.share.check_share_permission`). Without
	it, only Administrator could invite anyone to comment on or co-edit a diagram."""
	flags = {"read": 1, "write": 1, "create": 1, "delete": 1, "share": 1}
	if _has_comment_permission_type(doctype):
		flags["comment"] = 1
	return flags


def _keep_declared_permissions(doctype: str) -> None:
	"""Copy the doctype's own permission rows into Custom DocPerm before we add ours.

	Custom DocPerm rows do not merge with the rows a doctype declares in its JSON —
	they REPLACE them wholesale (`frappe.model.meta.Meta.set_custom_permissions`).
	So the Draw User row below silently switched off the System Manager row in
	draw_diagram.json, and a fresh install ended up with nobody who could create a
	diagram (GitHub #174). Core's `setup_custom_perms` copies the declared rows over
	and no-ops once any Custom DocPerm exists for the doctype, so this runs once and
	never overwrites what an operator has edited since."""
	from frappe.permissions import setup_custom_perms

	setup_custom_perms(doctype)


def _ensure_owner_permission(doctype: str) -> None:
	"""Add an if_owner perm row for Draw User on the given doctype, or grant
	`comment` on a row that predates it."""
	_keep_declared_permissions(doctype)
	flags = _owner_permission_flags(doctype)
	fields = ["name", "comment"] if flags.get("comment") else ["name"]
	row = frappe.db.get_value(
		"Custom DocPerm", {"parent": doctype, "role": ROLE, "if_owner": 1}, fields, as_dict=True
	)
	if row:
		# A site set up before `comment` was granted keeps its old row, so top up
		# that one flag instead of returning. Only that flag: the standard rights
		# are left as the site has them, so an operator who deliberately cleared one
		# does not get it handed back on the next migrate.
		if flags.get("comment") and not row.comment:
			frappe.db.set_value("Custom DocPerm", row.name, "comment", 1)
		return
	frappe.get_doc(
		{
			"doctype": "Custom DocPerm",
			"parent": doctype,
			"parenttype": "DocType",
			"parentfield": "permissions",
			"role": ROLE,
			"if_owner": 1,
			**flags,
		}
	).insert(ignore_permissions=True)


def _ensure_comment_permission_type() -> None:
	"""Register a "comment" permission type for Draw Diagram so diagrams can be
	shared at a view / comment / edit level. Adds a `comment` Check to DocShare +
	the doctype's perm rules. No-ops on Frappe versions without Permission Type."""
	if not frappe.db.exists("DocType", "Permission Type"):
		return
	if _has_comment_permission_type("Draw Diagram"):
		return
	frappe.get_doc(
		{"doctype": "Permission Type", "doc_type": "Draw Diagram", "perm_type": "comment"}
	).insert(ignore_permissions=True)
