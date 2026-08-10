# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import json

from frappe.tests import IntegrationTestCase

import frappe

from draw.api.collection import (
	add_to_collection,
	collections_of,
	create_collection,
	delete_collection,
	diagrams_in_collection,
	list_collections,
	remove_from_collection,
	rename_collection,
)


class TestDrawCollection(IntegrationTestCase):
	"""Collections group diagrams on Home (#217).

	They are LABELS, not folders: a diagram belongs to as many as you like and
	still lives in exactly one place, which is why they do not clash with Drive's
	foldering the way the old folder concept did (#115).
	"""

	def _diagram(self, title="Collected diagram"):
		doc = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": title,
				"diagram_type": "block",
				"document": json.dumps({"schemaVersion": 1, "diagramType": "block"}),
			}
		).insert()
		self.addCleanup(lambda: frappe.delete_doc("Draw Diagram", doc.name, force=True))
		return doc

	def _collection(self, title="Onboarding"):
		created = create_collection(title)
		self.addCleanup(
			lambda: frappe.delete_doc("Draw Collection", created["name"], force=True, ignore_permissions=True)
		)
		return created

	def _user(self, email):
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{"doctype": "User", "email": email, "first_name": "Collector", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
			self.addCleanup(lambda: frappe.delete_doc("User", email, force=True, ignore_permissions=True))
		return email

	def test_a_diagram_can_be_in_several_collections_at_once(self):
		# The whole point of labels over folders: adding to a second collection does
		# not take it out of the first.
		diagram = self._diagram()
		first = self._collection("Onboarding")
		second = self._collection("Q3 planning")

		add_to_collection(first["name"], diagram.name)
		add_to_collection(second["name"], diagram.name)

		self.assertCountEqual(collections_of(diagram.name), [first["name"], second["name"]])
		self.assertEqual(diagrams_in_collection(first["name"]), [diagram.name])
		self.assertEqual(diagrams_in_collection(second["name"]), [diagram.name])

	def test_adding_the_same_diagram_twice_is_not_an_error(self):
		# Two clients can add at once. The database keeps it to one row and the
		# endpoint reports success, because that is the state the caller asked for.
		diagram = self._diagram()
		collection = self._collection()

		add_to_collection(collection["name"], diagram.name)
		add_to_collection(collection["name"], diagram.name)

		self.assertEqual(diagrams_in_collection(collection["name"]), [diagram.name])

	def test_the_database_refuses_a_duplicate_membership_row(self):
		# The guard is a unique index, not a check-then-act in the API — two workers
		# both seeing "not a member yet" is exactly the race it exists to lose.
		diagram = self._diagram()
		collection = self._collection()
		add_to_collection(collection["name"], diagram.name)

		self.assertRaises(
			frappe.UniqueValidationError,
			frappe.get_doc(
				{
					"doctype": "Draw Collection Member",
					"collection": collection["name"],
					"diagram": diagram.name,
				}
			).insert,
		)

	def test_removing_from_a_collection_keeps_the_diagram(self):
		diagram = self._diagram()
		collection = self._collection()
		add_to_collection(collection["name"], diagram.name)

		remove_from_collection(collection["name"], diagram.name)

		self.assertEqual(diagrams_in_collection(collection["name"]), [])
		self.assertTrue(frappe.db.exists("Draw Diagram", diagram.name))

	def test_deleting_a_collection_keeps_every_diagram_in_it(self):
		# Deleting a label must never delete what was labelled.
		diagram = self._diagram()
		collection = create_collection("Temporary")
		add_to_collection(collection["name"], diagram.name)

		delete_collection(collection["name"])

		self.assertFalse(frappe.db.exists("Draw Collection", collection["name"]))
		self.assertTrue(frappe.db.exists("Draw Diagram", diagram.name))
		self.assertEqual(collections_of(diagram.name), [])

	def test_deleting_a_diagram_does_not_block_on_its_memberships(self):
		# The membership row Links to the diagram, so without cleanup the delete
		# fails on link integrity.
		diagram = self._diagram("Doomed")
		collection = self._collection()
		add_to_collection(collection["name"], diagram.name)

		frappe.delete_doc("Draw Diagram", diagram.name, force=True)

		self.assertEqual(diagrams_in_collection(collection["name"]), [])

	def test_the_chip_row_reports_a_count_per_collection(self):
		collection = self._collection("Counted")
		for i in range(3):
			add_to_collection(collection["name"], self._diagram(f"Counted {i}").name)

		row = next(c for c in list_collections() if c["name"] == collection["name"])
		self.assertEqual(row["count"], 3)
		self.assertEqual(row["title"], "Counted")

	def test_a_trashed_diagram_is_not_counted_but_keeps_its_membership(self):
		# Home cannot show a trashed diagram, so a chip promising it would be a lie.
		# The row survives, so restoring puts it back where it was.
		collection = self._collection("Half empty")
		kept = self._diagram("Kept")
		trashed = self._diagram("Trashed")
		add_to_collection(collection["name"], kept.name)
		add_to_collection(collection["name"], trashed.name)
		frappe.db.set_value("Draw Diagram", trashed.name, "is_trashed", 1)

		row = next(c for c in list_collections() if c["name"] == collection["name"])
		self.assertEqual(row["count"], 1)
		self.assertIn(trashed.name, diagrams_in_collection(collection["name"]))

	def test_a_collection_needs_a_name(self):
		self.assertRaises(frappe.ValidationError, create_collection, "   ")

	def test_a_very_long_name_is_trimmed_rather_than_rejected(self):
		created = self._collection("x" * 200)
		self.assertEqual(len(created["title"]), 60)

	def test_renaming_changes_only_the_title(self):
		created = self._collection("Before")
		add_to_collection(created["name"], self._diagram().name)

		renamed = rename_collection(created["name"], "After")

		self.assertEqual(renamed["title"], "After")
		self.assertEqual(len(diagrams_in_collection(created["name"])), 1)

	def test_collections_are_private_to_their_owner(self):
		# They are personal organisation, not a shared structure — there is nothing
		# to share them with, so someone else's collection is simply not theirs.
		created = self._collection("Mine")
		other = self._user("draw-collector@example.com")

		frappe.set_user(other)
		try:
			self.assertRaises(frappe.PermissionError, rename_collection, created["name"], "Yours")
			self.assertRaises(frappe.PermissionError, delete_collection, created["name"])
			self.assertRaises(frappe.PermissionError, diagrams_in_collection, created["name"])
			self.assertEqual(list_collections(), [])
		finally:
			frappe.set_user("Administrator")

	def test_an_unknown_collection_is_not_found_rather_than_a_crash(self):
		self.assertRaises(frappe.DoesNotExistError, diagrams_in_collection, "no-such-collection")
