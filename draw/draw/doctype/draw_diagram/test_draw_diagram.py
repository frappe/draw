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
		# Deliberately NO Draw-specific role — this proves DocShare alone grants
		# access to a shared diagram, independent of any role permission.
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}
			).insert(ignore_permissions=True)
			self.addCleanup(lambda: frappe.delete_doc("User", email, force=True, ignore_permissions=True))
		return email

	def test_share_edit_grants_read_write_comment(self):
		from draw.api.share import get_diagram_shares, share_diagram

		user = self._user("draw-editor@example.com")
		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		share_diagram(doc.name, user, "edit")

		# Core flags on the share row are reliable everywhere.
		shares = {s["user"]: s for s in get_diagram_shares(doc.name)}
		self.assertIn(user, shares)
		self.assertTrue(shares[user]["read"] and shares[user]["write"])

		# The contract that matters is enforcement — check it functionally, incl.
		# the custom "comment" permission type.
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

	def test_get_shares_reports_level_for_dialog(self):
		from draw.api.share import get_diagram_shares, share_diagram

		user = self._user("draw-level@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})

		share_diagram(doc.name, user, "comment")
		row = next(s for s in get_diagram_shares(doc.name) if s["user"] == user)
		self.assertEqual(row["level"], "comment")
		self.assertFalse(row["can_edit"])

		share_diagram(doc.name, user, "edit")  # idempotent update
		row = next(s for s in get_diagram_shares(doc.name) if s["user"] == user)
		self.assertEqual(row["level"], "edit")
		self.assertTrue(row["can_edit"])

	def test_register_in_drive_when_available(self):
		# Optional Drive integration — only exercised when Drive is installed
		# (CI's fresh site has no Drive, so this skips there).
		from draw.api.drive_integration import drive_installed, register_in_drive

		if not drive_installed():
			self.skipTest("Frappe Drive not installed")

		teams = frappe.get_all("Drive Team", pluck="name")
		team = (
			teams[0]
			if teams
			else frappe.get_doc({"doctype": "Drive Team", "title": "Draw CI Team"}).insert(
				ignore_permissions=True
			).name
		)
		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})

		file_name = register_in_drive(doc.name, team=team)
		self.addCleanup(lambda: frappe.delete_doc("File", file_name, force=True, ignore_permissions=True))
		self.assertTrue(file_name)
		# Registered as a Drive link that opens the Draw editor.
		self.assertEqual(
			frappe.db.get_value("File", file_name, "file_url"), f"/draw/d/{doc.name}"
		)
		# Idempotent — a second call reuses the same File.
		self.assertEqual(register_in_drive(doc.name, team=team), file_name)

	def test_drive_is_available_reports_status(self):
		# The editor calls is_available() to decide whether to show "Add to Drive".
		# It must always return the two booleans without raising, Drive or not.
		from draw.api.drive_integration import drive_installed, is_available

		status = is_available()
		self.assertEqual(status["installed"], drive_installed())
		self.assertIn("ready", status)
		if not drive_installed():
			self.assertFalse(status["ready"])

	def test_drive_registration_noops_without_team(self):
		# Registration is a safe no-op when Drive isn't set up / not installed.
		from draw.api import drive_integration

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		if not drive_integration.drive_installed():
			self.assertIsNone(drive_integration.register_in_drive(doc.name))

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
