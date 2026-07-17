# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import json

from frappe.tests import IntegrationTestCase

import frappe


class TestDrawDiagram(IntegrationTestCase):
	def _make(self, diagram_type, doc_json):
		doc = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": f"Test {diagram_type}",
				"diagram_type": diagram_type,
				"document": json.dumps(doc_json),
			}
		).insert()
		self.addCleanup(lambda: frappe.delete_doc("Draw Diagram", doc.name, force=True))
		return doc

	def test_unified_document_persists(self):
		# Canvas unification: a `unified` document must be a valid, savable type
		# (the diagram_type Select was extended to allow it).
		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		self.assertEqual(doc.diagram_type, "unified")
		self.assertTrue(frappe.db.exists("Draw Diagram", doc.name))

	def test_diagram_type_synced_from_document_json(self):
		# The controller mirrors diagram_type from the document JSON's diagramType,
		# even when the passed field disagrees (Part G3).
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "unified"})
		self.assertEqual(doc.diagram_type, "unified")

	def test_legacy_single_type_still_valid(self):
		for t in ("block", "mindmap", "flowchart", "whiteboard"):
			doc = self._make(t, {"schemaVersion": 1, "diagramType": t})
			self.assertEqual(doc.diagram_type, t)

	# ----- Writer-style sharing (view / comment / edit) -----

	def _user(self, email):
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": email.split("@")[0],
					"send_welcome_email": 0,
					"roles": [{"role": "Draw User"}],
				}
			).insert(ignore_permissions=True)
			self.addCleanup(lambda: frappe.delete_doc("User", email, force=True, ignore_permissions=True))
		return email

	def test_share_edit_grants_read_write_comment(self):
		from draw.api.share import get_diagram_shares, share_diagram

		user = self._user("draw-editor@example.com")
		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		share_diagram(doc.name, user, "edit")

		shares = {s["user"]: s for s in get_diagram_shares(doc.name)}
		self.assertIn(user, shares)
		self.assertTrue(shares[user]["read"] and shares[user]["write"] and shares[user].get("comment"))

		frappe.set_user(user)
		try:
			self.assertTrue(frappe.has_permission("Draw Diagram", "read", doc=doc.name))
			self.assertTrue(frappe.has_permission("Draw Diagram", "write", doc=doc.name))
			self.assertTrue(frappe.has_permission("Draw Diagram", "comment", doc=doc.name))
		finally:
			frappe.set_user("Administrator")

	def test_share_view_is_read_only(self):
		from draw.api.share import share_diagram

		user = self._user("draw-viewer@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		share_diagram(doc.name, user, "view")

		frappe.set_user(user)
		try:
			self.assertTrue(frappe.has_permission("Draw Diagram", "read", doc=doc.name))
			self.assertFalse(frappe.has_permission("Draw Diagram", "write", doc=doc.name))
		finally:
			frappe.set_user("Administrator")

	def test_unshare_revokes_access(self):
		from draw.api.share import get_diagram_shares, share_diagram, unshare_diagram

		user = self._user("draw-revoke@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		share_diagram(doc.name, user, "edit")
		unshare_diagram(doc.name, user)

		self.assertEqual(get_diagram_shares(doc.name), [])
		frappe.set_user(user)
		try:
			self.assertFalse(frappe.has_permission("Draw Diagram", "read", doc=doc.name))
		finally:
			frappe.set_user("Administrator")
