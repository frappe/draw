# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class DrawDiagram(Document):
	def before_save(self):
		self.increment_revision()
		self.stamp_trashed_on()

	def increment_revision(self):
		self.revision = (self.revision or 0) + 1

	def stamp_trashed_on(self):
		if self.is_trashed and not self.trashed_on:
			self.trashed_on = now_datetime()
		elif not self.is_trashed:
			self.trashed_on = None
