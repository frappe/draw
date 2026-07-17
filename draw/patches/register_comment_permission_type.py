# Register a custom "comment" permission type for Draw Diagram so diagrams can be
# shared at a view / comment / edit level (Writer-style). Creating a Permission
# Type is gated to developer-mode/migrate/install, so it must run from a patch.
# Adds a `comment` Check to DocShare + the DocType's permission rules. Re-runnable.

import frappe


def execute() -> None:
	# Older Frappe versions have no Permission Type doctype — skip gracefully.
	if not frappe.db.exists("DocType", "Permission Type"):
		return
	if frappe.db.exists("Permission Type", {"doc_type": "Draw Diagram", "perm_type": "comment"}):
		return
	frappe.get_doc(
		{"doctype": "Permission Type", "doc_type": "Draw Diagram", "perm_type": "comment"}
	).insert(ignore_permissions=True)
	frappe.clear_cache()
