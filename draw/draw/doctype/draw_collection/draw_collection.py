# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DrawCollection(Document):
	def on_trash(self):
		# Drop the membership rows before the collection goes, so the delete is not
		# blocked by link integrity. Only the grouping disappears — every diagram
		# that was in it is untouched, which is the whole point of collections being
		# labels rather than folders (#217).
		frappe.db.delete("Draw Collection Member", {"collection": self.name})
