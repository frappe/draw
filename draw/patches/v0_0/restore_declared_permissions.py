# Repair for GitHub #174: sites set up before `_keep_declared_permissions` got
# Draw's Custom DocPerm rows WITHOUT a copy of the rows the doctypes declare in
# their JSON. Custom DocPerm replaces those declared rows rather than merging with
# them, so the System Manager row went inert and even a System Manager could not
# create a diagram ("New diagram" failed with a 403).
#
# Copy back every declared row that has no Custom DocPerm counterpart. Sites set
# up after the fix already have them, so this is a no-op there; it runs once, so a
# row an operator deliberately removed later is not handed back on every migrate.

import frappe

from draw.setup import OWNED_DOCTYPES


def execute():
	for doctype in OWNED_DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		# Nothing to restore where Draw never added a custom row: the declared rows
		# are still the ones in force.
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
			continue
		_restore_declared_rows(doctype)
	frappe.clear_cache()


def _restore_declared_rows(doctype: str) -> None:
	for perm in frappe.get_all("DocPerm", fields="*", filters={"parent": doctype}):
		if frappe.db.exists(
			"Custom DocPerm",
			{
				"parent": doctype,
				"role": perm.role,
				"permlevel": perm.permlevel,
				"if_owner": perm.if_owner,
			},
		):
			continue
		row = frappe.new_doc("Custom DocPerm")
		row.update(perm)
		# Let Custom DocPerm autoname; `perm` carries the DocPerm row's own name.
		row.name = None
		row.insert(ignore_permissions=True)
