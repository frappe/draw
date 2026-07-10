# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

# Create the "Draw User" role that SPA users get, and give Draw Diagram / Draw
# Folder owner-scoped permissions (read/write/create/delete own) via if_owner.
# System Manager keeps full access (defined in the DocType JSON). Re-runnable.

import frappe

ROLE = "Draw User"
OWNED_DOCTYPES = ("Draw Diagram", "Draw Folder")


def execute() -> None:
	_ensure_role()
	for doctype in OWNED_DOCTYPES:
		_ensure_owner_permission(doctype)
	frappe.clear_cache()


def _ensure_role() -> None:
	"""Create the Draw User role idempotently (desk-enabled, normal users get it)."""
	if frappe.db.exists("Role", ROLE):
		return
	frappe.get_doc(
		{
			"doctype": "Role",
			"role_name": ROLE,
			"desk_access": 1,
		}
	).insert(ignore_permissions=True)


def _ensure_owner_permission(doctype: str) -> None:
	"""Add an if_owner perm row for Draw User on the given doctype if missing."""
	exists = frappe.db.exists(
		"Custom DocPerm", {"parent": doctype, "role": ROLE, "if_owner": 1}
	)
	if exists:
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
