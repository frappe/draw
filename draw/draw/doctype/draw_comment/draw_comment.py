# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

# A single comment on a Draw Diagram. Two roles in one doctype:
#   - a thread ROOT (parent_comment empty) carries the anchor (shape / board /
#     general) and the resolved state; and
#   - a REPLY (parent_comment -> the root) is flat text under that root.
#
# All create / read / resolve / delete goes through draw/api/comment.py, which gates
# every call on the parent diagram's permission (the custom "comment" DocShare right).
# The doctype itself is System-Manager-only; the API writes with ignore_permissions
# after its own check, exactly as draw/api/share.py mediates DocShare. So the
# controller here only guards the doctype's own integrity, never access.

import frappe
from frappe import _
from frappe.model.document import Document


class DrawComment(Document):
	def validate(self):
		self._normalise_thread()

	def _normalise_thread(self):
		"""Keep the root/reply shape consistent: a reply hangs off a root on the same
		diagram and carries no anchor of its own; a root carries no parent."""
		if not self.parent_comment:
			# A root: anchor stays as given. A "general" root needs no coordinates.
			return

		parent = frappe.db.get_value(
			"Draw Comment",
			self.parent_comment,
			["diagram", "parent_comment"],
			as_dict=True,
		)
		if not parent:
			frappe.throw(_("The comment being replied to no longer exists."))
		if parent.parent_comment:
			# Threads are flat (Google-Docs style): a reply always attaches to the
			# root, never to another reply, so the panel never has to render nesting.
			frappe.throw(_("Replies must attach to the top comment of a thread."))
		if parent.diagram != self.diagram:
			frappe.throw(_("A reply must belong to the same diagram as its thread."))

		# A reply inherits its place from the root; it has no pin of its own.
		self.anchor_type = None
		self.shape_id = None
		self.board_x = None
		self.board_y = None
		self.resolved = 0
		self.resolved_by = None
		self.resolved_on = None

	def on_trash(self):
		# Deleting a thread root removes its replies too, so a resolved-and-deleted
		# thread never leaves orphaned replies behind. Runs before Frappe's link
		# check, so the parent_comment links clear and the root deletes cleanly.
		if not self.parent_comment:
			for reply in frappe.get_all(
				"Draw Comment", filters={"parent_comment": self.name}, pluck="name"
			):
				frappe.delete_doc("Draw Comment", reply, ignore_permissions=True, force=True)
