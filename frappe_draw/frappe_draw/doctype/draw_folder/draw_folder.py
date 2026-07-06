# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DrawFolder(Document):
	def on_trash(self):
		# Detach the folder's contents before it's removed so the delete isn't
		# blocked by link integrity and nothing cascades: diagrams inside keep
		# their data (their folder link just clears), and any sub-folders become
		# top-level. Runs before Frappe's link check, so the folder deletes cleanly.
		frappe.db.set_value("Draw Diagram", {"folder": self.name}, "folder", None, update_modified=False)
		frappe.db.set_value("Draw Folder", {"parent_folder": self.name}, "parent_folder", None, update_modified=False)
