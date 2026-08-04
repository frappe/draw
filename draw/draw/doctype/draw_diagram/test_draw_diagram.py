# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import json

from frappe.tests import IntegrationTestCase

import frappe


class TestDrawDiagram(IntegrationTestCase):
	def _make(self, diagram_type, doc_json, title=None):
		doc = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": title or f"Test {diagram_type}",
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
		# A real, enabled user with NO Draw-specific role (the role is granted only
		# when a user actually opens Draw). The sharing tests below thus prove that
		# DocShare alone grants access to a shared diagram, independent of any role.
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

	def _private_diagram_owned_by(self, user, title="Private diagram"):
		# A private (not public, not shared) diagram owned by `user`. The insert runs
		# in the Administrator test session, and Document.set_user_and_timestamp
		# stamps owner = session.user (overriding any owner passed in), so pin the
		# intended owner in the db afterwards — the list query keys off owner.
		doc = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": title,
				"diagram_type": "block",
				"document": json.dumps({"schemaVersion": 1, "diagramType": "block"}),
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Draw Diagram", doc.name, "owner", user)
		self.addCleanup(lambda: frappe.delete_doc("Draw Diagram", doc.name, force=True, ignore_permissions=True))
		return doc

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

	def test_owner_can_share_at_comment_and_edit_level(self):
		# GitHub #172: the comment and edit tiers set the DocShare `comment` flag, and
		# Frappe refuses to grant a right the sharer does not hold themselves. Every
		# sharing test above runs as Administrator, who holds everything — a plain
		# diagram owner has to be able to do it too, or the app's own co-editing
		# invite is unusable for everyone but the site's admin.
		from draw.api.share import get_diagram_shares, share_diagram
		from draw.setup import ROLE, ensure_setup

		# Also covers the back-fill: a site set up before this fix already has the
		# perm row, so a repeat run has to add the missing flag rather than no-op.
		ensure_setup()
		owner = self._user("draw-sharer@example.com")
		frappe.get_doc("User", owner).add_roles(ROLE)
		collaborator = self._user("draw-invitee@example.com")
		# One diagram per level, as in the bug report.
		docs = {level: self._private_diagram_owned_by(owner, level) for level in ("comment", "edit")}

		frappe.set_user(owner)
		try:
			for level, doc in docs.items():
				self.assertTrue(frappe.has_permission("Draw Diagram", "comment", doc=doc.name))
				share_diagram(doc.name, collaborator, level)
				row = next(s for s in get_diagram_shares(doc.name) if s["user"] == collaborator)
				self.assertEqual(row["level"], level)
				self.assertTrue(row["comment"])
		finally:
			frappe.set_user("Administrator")

	# ----- general access tiers (GitHub #106) -----

	def _read_as(self, user, name):
		"""Read a diagram through the real document gate (draw.api.diagram) as `user`.
		Returns the payload, or raises frappe.PermissionError just as an HTTP caller
		would. General access is enforced here, NOT through frappe.has_permission."""
		from draw.api.diagram import get_diagram

		frappe.set_user(user)
		try:
			return get_diagram(name)
		finally:
			frappe.set_user("Administrator")

	def test_set_general_access_toggles_the_two_flags_exclusively(self):
		from draw.api.share import set_general_access

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})

		self.assertEqual(set_general_access(doc.name, "site_users_view"), "site_users_view")
		flags = frappe.db.get_value(
			"Draw Diagram", doc.name, ["is_public", "all_site_users_can_view"], as_dict=True
		)
		self.assertEqual((flags.is_public, flags.all_site_users_can_view), (0, 1))

		set_general_access(doc.name, "public_view")
		flags = frappe.db.get_value(
			"Draw Diagram", doc.name, ["is_public", "all_site_users_can_view"], as_dict=True
		)
		self.assertEqual((flags.is_public, flags.all_site_users_can_view), (1, 0))

		set_general_access(doc.name, "restricted")
		flags = frappe.db.get_value(
			"Draw Diagram", doc.name, ["is_public", "all_site_users_can_view"], as_dict=True
		)
		self.assertEqual((flags.is_public, flags.all_site_users_can_view), (0, 0))

	def test_set_general_access_rejects_an_unknown_tier(self):
		from draw.api.share import set_general_access

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		self.assertRaises(frappe.ValidationError, set_general_access, doc.name, "editable-by-anyone")

	def test_site_users_view_grants_view_to_an_arbitrary_site_user(self):
		# The middle tier: any signed-in user — with NO share and NO Draw role — may
		# VIEW the diagram through the document gate.
		from draw.api.permission import can_view_via_general_access
		from draw.api.share import get_general_access, set_general_access

		outsider = self._user("draw-anyuser@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		set_general_access(doc.name, "site_users_view")

		self.assertEqual(get_general_access(doc.name), "site_users_view")
		self.assertEqual(self._read_as(outsider, doc.name)["name"], doc.name)

		doc.reload()
		self.assertTrue(can_view_via_general_access(doc, outsider))
		# ...but it is VIEW ONLY — no write, no re-share.
		frappe.set_user(outsider)
		try:
			self.assertFalse(frappe.has_permission("Draw Diagram", "write", doc=doc.name))
		finally:
			frappe.set_user("Administrator")

	def test_site_users_view_is_denied_to_a_guest(self):
		# "All logged-in site users" excludes the guest/website user.
		from draw.api.permission import can_view_via_general_access
		from draw.api.share import set_general_access

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		set_general_access(doc.name, "site_users_view")

		doc.reload()
		self.assertFalse(can_view_via_general_access(doc, "Guest"))
		self.assertRaises(frappe.PermissionError, self._read_as, "Guest", doc.name)

	def test_restricted_diagram_denies_another_signed_in_user(self):
		# The default tier: an unrelated signed-in user, with no share, cannot read it.
		outsider = self._user("draw-restricted-out@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})  # restricted by default
		self.assertRaises(frappe.PermissionError, self._read_as, outsider, doc.name)

	def test_public_view_grants_view_including_a_guest(self):
		from draw.api.share import get_general_access, set_general_access

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		set_general_access(doc.name, "public_view")

		self.assertEqual(get_general_access(doc.name), "public_view")
		self.assertTrue(frappe.db.get_value("Draw Diagram", doc.name, "is_public"))
		self.assertEqual(self._read_as("Guest", doc.name)["name"], doc.name)

	def test_legacy_is_public_document_maps_to_public_view(self):
		# Backward compatibility: a diagram made public before the tier field existed
		# has is_public=1 and no all_site_users_can_view — it must still read as
		# public_view, viewable by anyone including guests, with no migration.
		from draw.api.permission import can_view_via_general_access, general_access_level
		from draw.api.share import get_general_access

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		frappe.db.set_value("Draw Diagram", doc.name, "is_public", 1)  # simulate an old doc
		doc.reload()

		self.assertEqual(general_access_level(doc), "public_view")
		self.assertEqual(get_general_access(doc.name), "public_view")
		self.assertTrue(can_view_via_general_access(doc, "Guest"))
		self.assertEqual(self._read_as("Guest", doc.name)["name"], doc.name)

	def test_general_access_is_not_injected_into_a_non_owners_list(self):
		# List visibility (permission_query_conditions): a site_users_view diagram
		# owned by one user does NOT auto-appear in another user's list (if_owner gate — general access still grants open/read, tested above); a restricted one
		# owned by the same user does not.
		from draw.api.share import set_general_access

		owner = self._user("draw-ga-owner@example.com")
		other = self._user("draw-ga-other@example.com")
		for u in (owner, other):
			frappe.get_doc("User", u).add_roles("Draw User")

		def make(title):
			d = frappe.get_doc(
				{
					"doctype": "Draw Diagram",
					"title": title,
					"diagram_type": "block",
					"owner": owner,
					"document": json.dumps({"schemaVersion": 1, "diagramType": "block"}),
				}
			).insert(ignore_permissions=True)
			self.addCleanup(lambda n=d.name: frappe.delete_doc("Draw Diagram", n, force=True, ignore_permissions=True))
			return d

		shared = make("GA Shared To Site")
		set_general_access(shared.name, "site_users_view")
		private = make("GA Private")  # restricted

		frappe.set_user(other)
		try:
			visible = {d.name for d in frappe.get_list("Draw Diagram", filters={"is_trashed": 0})}
		finally:
			frappe.set_user("Administrator")

		# General access is open/read access for a non-owner (proven above), NOT
		# list-injection: the if_owner gate keeps it out of the list. A non-owner's
		# list is owned + explicitly-shared only. Discoverability is a follow-up.
		self.assertNotIn(shared.name, visible, "general access does not inject into a non-owner's list (if_owner gate)")
		self.assertNotIn(private.name, visible, "a restricted diagram must stay private")

	# ----- "Shared with you" listing (GitHub #116) -----

	def test_shared_with_me_lists_shares_from_others(self):
		# A diagram shared with B appears in B's shared_with_me; one shared only with an
		# unrelated user C does not. This is the core contract of the sidebar view.
		from draw.api.diagram import shared_with_me
		from draw.api.share import share_diagram

		b = self._user("draw-swm-b@example.com")
		c = self._user("draw-swm-c@example.com")

		to_b = self._make("block", {"schemaVersion": 1, "diagramType": "block"}, title="Shared To B")
		share_diagram(to_b.name, b, "view")
		to_c = self._make("block", {"schemaVersion": 1, "diagramType": "block"}, title="Shared To C")
		share_diagram(to_c.name, c, "view")

		frappe.set_user(b)
		try:
			names = {d["name"] for d in shared_with_me()}
		finally:
			frappe.set_user("Administrator")

		self.assertIn(to_b.name, names, "a diagram shared with B must appear in B's shared_with_me")
		self.assertNotIn(to_c.name, names, "a diagram shared only with C must not appear for B")

	def test_shared_with_me_excludes_diagrams_the_user_owns(self):
		# "Shared WITH me" means someone else's diagram — never my own, even when a
		# DocShare row for me exists on it (e.g. a self-share). The owner filter drops it.
		from draw.api.diagram import shared_with_me
		from draw.api.share import share_diagram

		owner = self._user("draw-swm-owner@example.com")
		own = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": "Owned By Me",
				"diagram_type": "block",
				"owner": owner,
				"document": json.dumps({"schemaVersion": 1, "diagramType": "block"}),
			}
		).insert(ignore_permissions=True)
		self.addCleanup(lambda: frappe.delete_doc("Draw Diagram", own.name, force=True, ignore_permissions=True))
		frappe.db.set_value("Draw Diagram", own.name, "owner", owner)  # insert stamps the session user; pin the real owner
		share_diagram(own.name, owner, "view")  # a DocShare on my own diagram

		frappe.set_user(owner)
		try:
			names = {d["name"] for d in shared_with_me()}
		finally:
			frappe.set_user("Administrator")

		self.assertNotIn(own.name, names, "my own diagram must not be listed as shared with me")

	def test_shared_with_me_excludes_trashed(self):
		# A trashed diagram is off the shelf, shared or not.
		from draw.api.diagram import shared_with_me
		from draw.api.share import share_diagram

		b = self._user("draw-swm-trash@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"}, title="Shared Then Trashed")
		share_diagram(doc.name, b, "view")
		frappe.db.set_value("Draw Diagram", doc.name, "is_trashed", 1)

		frappe.set_user(b)
		try:
			names = {d["name"] for d in shared_with_me()}
		finally:
			frappe.set_user("Administrator")

		self.assertNotIn(doc.name, names, "a trashed diagram must not appear in shared_with_me")

	# ----- optional Frappe Drive / Suite integration (soft-coupled) -----
	# This dev/CI site has NO Drive, so these pin the "Drive absent" contract: every
	# entry point must no-op cleanly and never block a diagram's own lifecycle. The
	# "Drive present" paths are guarded with skipTest and run post-merge on Suite.

	def test_drive_is_available_reports_status(self):
		# The editor toolbar and the Home "install Drive" banner call is_available().
		# It must always return the two booleans without raising, Drive or not.
		from draw.api.drive_integration import drive_available, is_available

		status = is_available()
		self.assertEqual(status["installed"], drive_available())
		self.assertEqual(status["ready"], drive_available())
		if not drive_available():
			self.assertFalse(status["installed"])
			self.assertFalse(status["ready"])

	def test_drive_registration_noops_when_absent(self):
		# Registration is a safe no-op (returns None) when Drive is not installed,
		# so creating a diagram never fails for the lack of Drive.
		from draw.api import drive_integration

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		if not drive_integration.drive_available():
			self.assertIsNone(drive_integration.register_diagram_in_drive(doc.name))
		# A missing diagram is always a no-op, Drive or not.
		self.assertIsNone(drive_integration.register_diagram_in_drive("does-not-exist"))

	def test_drive_doc_event_wrappers_are_import_safe(self):
		# after_insert/on_update/on_trash route through these wrappers. With Drive
		# absent they must be pure no-ops — importing Suite lazily and swallowing
		# ImportError — so the diagram lifecycle is untouched.
		from draw.api import drive_integration

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		# None of these may raise, and (Drive absent) none may create a backing File.
		drive_integration.auto_register_diagram(doc)
		drive_integration.sync_diagram_drive_file(doc, "on_update")
		drive_integration.trash_diagram_drive_file(doc, "on_trash")
		if not drive_integration.drive_available():
			self.assertFalse(
				frappe.db.exists("File", {"content_doctype": "Draw Diagram", "content_docname": doc.name})
			)

	def test_register_creates_one_content_file_when_drive_present(self):
		# On a Suite site: registration creates exactly ONE Drive content File
		# (content_doctype/content_docname), no team, and is idempotent.
		from draw.api.drive_integration import drive_available, register_diagram_in_drive

		if not drive_available():
			self.skipTest("Frappe Drive not installed")

		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		file_name = register_diagram_in_drive(doc.name)
		self.addCleanup(lambda: frappe.delete_doc("File", file_name, force=True, ignore_permissions=True))
		self.assertTrue(file_name)
		self.assertEqual(
			frappe.db.get_value("File", file_name, "content_docname"), doc.name
		)
		# Idempotent — a second call reuses the same content File.
		self.assertEqual(register_diagram_in_drive(doc.name), file_name)

	def test_soft_trash_is_a_safe_noop_when_absent(self):
		# Soft-trashing a diagram routes on_update -> sync_diagram_drive_file ->
		# _mirror_trash_status. With Drive absent it must be a pure no-op: the save
		# succeeds and no backing File appears.
		from draw.api import drive_integration

		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		doc.is_trashed = 1
		doc.save()  # must not raise even though Drive is absent
		if not drive_integration.drive_available():
			self.assertFalse(
				frappe.db.exists("File", {"content_doctype": "Draw Diagram", "content_docname": doc.name})
			)

	def test_soft_trash_mirrors_to_drive_file_status_when_present(self):
		# On a Suite site: soft-trashing a diagram flips its backing Drive File to
		# Trashed (so it leaves Drive Home), and untrashing restores it to Active.
		# Suite's own sync skips this because Draw Diagram has is_trashed, not `trashed`.
		from draw.api.drive_integration import drive_available, register_diagram_in_drive

		if not drive_available():
			self.skipTest("Frappe Drive not installed")

		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		file_name = register_diagram_in_drive(doc.name)
		self.addCleanup(lambda: frappe.delete_doc("File", file_name, force=True, ignore_permissions=True))
		self.assertEqual(frappe.db.get_value("File", file_name, "status"), "Active")

		doc.is_trashed = 1
		doc.save()
		self.assertEqual(frappe.db.get_value("File", file_name, "status"), "Trashed")

		doc.is_trashed = 0
		doc.save()
		self.assertEqual(frappe.db.get_value("File", file_name, "status"), "Active")

	def test_move_to_drive_folder_is_a_safe_noop_when_absent(self):
		# The "Move to folder" endpoint is soft-coupled: with Drive absent it returns
		# the not-installed shape and never raises, so the toolbar action degrades.
		from draw.api.drive_integration import drive_available, move_to_drive_folder

		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		if not drive_available():
			result = move_to_drive_folder(doc.name, "some-folder")
			self.assertFalse(result["drive_installed"])
			self.assertFalse(result["moved"])
			self.assertIsNone(result["file"])

	def test_list_drive_folders_is_a_safe_noop_when_absent(self):
		# The folder browser returns the empty drive-absent shape without raising, so
		# the Move dialog degrades cleanly when Drive is not installed.
		from draw.api.drive_integration import drive_available, list_drive_folders

		if not drive_available():
			result = list_drive_folders()
			self.assertFalse(result["drive_installed"])
			self.assertEqual(result["folders"], [])
			self.assertEqual(result["path"], [])

	def test_diagram_drive_path_is_a_safe_noop_when_absent(self):
		# The toolbar's Drive-path breadcrumb is soft-coupled: with Drive absent,
		# diagram_drive_path returns the not-installed / unregistered shape and never
		# raises, so the toolbar falls back to the static "Frappe Draw / <title>" crumb.
		from draw.api.drive_integration import diagram_drive_path, drive_available

		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		if not drive_available():
			result = diagram_drive_path(doc.name)
			self.assertFalse(result["drive_installed"])
			self.assertFalse(result["registered"])
			self.assertEqual(result["path"], [])

	def test_list_drive_folders_degrades_without_raising_on_a_broken_drive(self):
		# Even if drive_available() reports True while the Suite Drive API is unavailable
		# or a query fails (a partial/broken install), the folder browser must degrade to
		# the not-installed shape rather than raise — so the Move dialog can never 500.
		# (With Drive absent, forcing drive_available True makes the Suite import fail,
		# exercising the same graceful-degradation path.)
		from unittest.mock import patch

		from draw.api import drive_integration as di

		if di.drive_available():
			self.skipTest("Frappe Drive installed — this exercises the degrade path")
		with patch.object(di, "drive_available", return_value=True):
			result = di.list_drive_folders()
			self.assertFalse(result["drive_installed"])
			self.assertEqual(result["folders"], [])
			self.assertEqual(result["path"], [])

	def test_diagram_drive_path_degrades_without_raising_on_a_broken_drive(self):
		# Same robustness contract for the breadcrumb endpoint: a broken/unavailable
		# Drive degrades to the not-installed shape instead of 500-ing the editor.
		from unittest.mock import patch

		from draw.api import drive_integration as di

		if di.drive_available():
			self.skipTest("Frappe Drive installed — this exercises the degrade path")
		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		with patch.object(di, "drive_available", return_value=True):
			result = di.diagram_drive_path(doc.name)
			self.assertFalse(result["drive_installed"])
			self.assertEqual(result["path"], [])

	def test_inserted_image_is_attached_to_the_diagram(self):
		# #74: inserted images upload through draw.api.diagram.upload_diagram_image,
		# which inserts the File server-side ATTACHED to the diagram (so Suite's Drive
		# never adopts it as a stray Home entry). The bytes arrive via the upload
		# endpoint in frappe.local; simulate that here.
		from draw.api.diagram import upload_diagram_image

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		frappe.local.uploaded_file = b"\x89PNG\r\n\x1a\n fake image bytes"
		frappe.local.uploaded_filename = "inserted.png"
		try:
			result = upload_diagram_image(doc.name)
		finally:
			frappe.local.uploaded_file = None
			frappe.local.uploaded_filename = None

		file_name = frappe.db.get_value(
			"File",
			{"attached_to_doctype": "Draw Diagram", "attached_to_name": doc.name},
			["name", "is_private", "file_url"],
			as_dict=True,
		)
		self.addCleanup(
			lambda: frappe.delete_doc("File", file_name.name, force=True, ignore_permissions=True)
		)
		self.assertTrue(file_name, "the inserted image was not attached to the diagram")
		# Public, so it still renders in shared/exported diagrams.
		self.assertEqual(file_name.is_private, 0)
		self.assertEqual(result["file_url"], file_name.file_url)

	def test_inserted_image_rejects_a_non_image(self):
		# The endpoint only accepts image extensions (defence in depth beyond the
		# browser picker); a non-image upload is a 400, not a stored File.
		from draw.api.diagram import upload_diagram_image

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		frappe.local.uploaded_file = b"PK\x03\x04 not an image"
		frappe.local.uploaded_filename = "payload.zip"
		try:
			self.assertRaises(frappe.ValidationError, upload_diagram_image, doc.name)
		finally:
			frappe.local.uploaded_file = None
			frappe.local.uploaded_filename = None

	# ----- collaboration room (real-time session scoping) -----

	def test_collab_room_is_not_the_diagram_name(self):
		# Names are title slugs ("drawing-1"), so a name-derived room would put
		# unrelated sites into one session on the public signaling server.
		from draw.api.diagram import get_collab_room

		doc = self._make("unified", {"schemaVersion": 1, "diagramType": "unified"})
		session = get_collab_room(doc.name)

		self.assertNotIn(doc.name, session["room"])
		self.assertNotEqual(session["room"], session["password"])
		self.assertEqual(session["room"], get_collab_room(doc.name)["room"])  # stable

	def test_collab_room_differs_per_diagram(self):
		from draw.api.diagram import get_collab_room

		first = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		second = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		self.assertNotEqual(get_collab_room(first.name)["room"], get_collab_room(second.name)["room"])

	def test_collab_room_is_only_issued_to_editors(self):
		# Peer-to-peer sync has no server in the data path, so anyone inside the
		# room can write to the shared document. Only editors are let in.
		from draw.api.diagram import get_collab_room
		from draw.api.share import share_diagram

		user = self._user("draw-collab@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})

		frappe.set_user(user)
		try:
			# No share yet: not even the existence of a room is disclosed.
			self.assertRaises(frappe.PermissionError, get_collab_room, doc.name)
		finally:
			frappe.set_user("Administrator")

		share_diagram(doc.name, user, "view")
		frappe.set_user(user)
		try:
			self.assertIsNone(get_collab_room(doc.name)["room"])
		finally:
			frappe.set_user("Administrator")

		share_diagram(doc.name, user, "edit")
		frappe.set_user(user)
		try:
			self.assertTrue(get_collab_room(doc.name)["room"])
		finally:
			frappe.set_user("Administrator")

	def test_collab_room_rotates_when_access_is_revoked(self):
		# The room is mixed with the access list, so a revoked editor keeps a room
		# the remaining peers have already left.
		from draw.api.diagram import get_collab_room
		from draw.api.share import share_diagram, unshare_diagram

		user = self._user("draw-revoked-peer@example.com")
		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})

		share_diagram(doc.name, user, "edit")
		frappe.set_user(user)
		try:
			joined = get_collab_room(doc.name)
		finally:
			frappe.set_user("Administrator")

		unshare_diagram(doc.name, user)
		after = get_collab_room(doc.name)
		self.assertNotEqual(joined["room"], after["room"])
		self.assertNotEqual(joined["password"], after["password"])

		# And the revoked user can no longer ask for the new one.
		frappe.set_user(user)
		try:
			self.assertRaises(frappe.PermissionError, get_collab_room, doc.name)
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

	# ----- cross-user isolation (GitHub #73) -----

	def test_a_private_diagram_stays_invisible_to_another_user(self):
		# The reported symptom: "someone creates a diagram and other users see it."
		# A private diagram must NOT appear in another Draw user's list, and no collab
		# room may be issued to someone who cannot even read it. This pins the isolation
		# so a real leak (vs. shared-account testing) would fail here.
		owner = self._user("draw-owner-iso@example.com")
		other = self._user("draw-other-iso@example.com")
		for u in (owner, other):
			frappe.get_doc("User", u).add_roles("Draw User")

		doc = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": "Owner Private",
				"diagram_type": "block",
				"owner": owner,
				"document": json.dumps({"schemaVersion": 1, "diagramType": "block"}),
			}
		).insert(ignore_permissions=True)
		self.addCleanup(lambda: frappe.delete_doc("Draw Diagram", doc.name, force=True, ignore_permissions=True))

		frappe.set_user(other)
		try:
			visible = [d.name for d in frappe.get_list("Draw Diagram", filters={"is_trashed": 0})]
			self.assertNotIn(doc.name, visible, "another user's private diagram leaked into the list")

			from draw.api.diagram import get_collab_room

			# Not readable → not even the existence of a collab room is disclosed.
			self.assertRaises(frappe.PermissionError, get_collab_room, doc.name)
		finally:
			frappe.set_user("Administrator")

	# ----- lazy grant of the Draw User role on Draw access (GitHub #73) -----

	def test_opening_draw_grants_the_role_to_a_user_who_lacks_it(self):
		# The root-cause fix: a real user who opens the Draw SPA is lazily given the
		# Draw User role, so an operator is never forced to use System Manager (whose
		# unrestricted list query is the #73 leak).
		from draw.www.draw import get_context

		user = self._user("draw-boot-73@example.com")
		self.assertNotIn("Draw User", frappe.get_roles(user))

		frappe.set_user(user)
		try:
			get_context(frappe._dict())  # simulate the user opening /draw
		finally:
			frappe.set_user("Administrator")

		self.assertIn("Draw User", frappe.get_roles(user))

	def test_merely_creating_a_user_does_not_grant_the_role(self):
		# The broad User after_insert grant was removed: creating a user (e.g. a
		# Website / portal user of another app on this bench) must NOT get Draw User.
		# Only opening Draw grants it, so unrelated users are never promoted to desk.
		user = self._user("draw-never-opened-73@example.com")
		self.assertNotIn("Draw User", frappe.get_roles(user))

	def test_system_accounts_are_never_granted_the_role(self):
		# Administrator (already all-powerful) and Guest must never get an explicit
		# Draw User grant. Checked at the Has Role row level, because get_roles()
		# reports every role for Administrator regardless.
		from draw.setup import grant_draw_user_role

		for account in ("Administrator", "Guest"):
			grant_draw_user_role(account)
			self.assertFalse(
				frappe.db.exists("Has Role", {"parent": account, "role": "Draw User"}),
				f"{account} must never be granted the Draw User role",
			)

	def test_disabled_user_is_not_granted_the_role(self):
		# A disabled login cannot use Draw, so the grant guard skips it.
		from draw.setup import grant_draw_user_role

		email = "draw-disabled-grant@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": "disabled",
					"enabled": 0,
					"send_welcome_email": 0,
				}
			).insert(ignore_permissions=True)
			self.addCleanup(lambda: frappe.delete_doc("User", email, force=True, ignore_permissions=True))

		grant_draw_user_role(email)
		self.assertNotIn("Draw User", frappe.get_roles(email))

	def test_backfill_grants_system_users_only_and_is_idempotent(self):
		# The back-fill covers users that pre-date the lazy grant, but ONLY existing
		# System users — never Website / portal users — and must be safe on every
		# migrate.
		from draw.patches.v0_0.grant_draw_user_role import execute

		system_user = self._user("draw-backfill-sys-73@example.com")
		frappe.db.set_value("User", system_user, "user_type", "System User")
		website_user = self._user("draw-backfill-web-73@example.com")  # stays Website User
		self.assertNotIn("Draw User", frappe.get_roles(system_user))
		self.assertNotIn("Draw User", frappe.get_roles(website_user))

		execute()
		self.assertIn("Draw User", frappe.get_roles(system_user))
		self.assertNotIn(
			"Draw User",
			frappe.get_roles(website_user),
			"the back-fill must never touch Website / portal users",
		)
		self.assertEqual(frappe.db.count("Has Role", {"parent": system_user, "role": "Draw User"}), 1)

		execute()  # a second run must not duplicate the grant
		self.assertEqual(frappe.db.count("Has Role", {"parent": system_user, "role": "Draw User"}), 1)

	def test_two_draw_users_cannot_see_each_others_private_diagrams(self):
		# #73 reinforced from the role angle: two users who hold ONLY the Draw User
		# role (granted on Draw access, no System Manager) each own a private diagram,
		# and neither appears in the other's list — in both directions.
		from draw.setup import grant_draw_user_role

		alice = self._user("draw-alice-73@example.com")
		bob = self._user("draw-bob-73@example.com")
		for u in (alice, bob):
			# A real Draw user is a desk user; make them one BEFORE granting so the
			# role-add is clean and does not flip user_type (which via set_system_user
			# would call clear_sessions). The Website->desk first-visit rotation stays
			# covered by test_opening_draw_grants_the_role_to_a_user_who_lacks_it.
			frappe.db.set_value("User", u, "user_type", "System User")
			grant_draw_user_role(u)
			self.assertIn("Draw User", frappe.get_roles(u))
			self.assertNotIn("System Manager", frappe.get_roles(u))

		alice_doc = self._private_diagram_owned_by(alice, "Alice private")
		bob_doc = self._private_diagram_owned_by(bob, "Bob private")

		frappe.set_user(alice)
		try:
			visible = {d.name for d in frappe.get_list("Draw Diagram", filters={"is_trashed": 0})}
			self.assertIn(alice_doc.name, visible)
			self.assertNotIn(bob_doc.name, visible, "another user's private diagram leaked into the list")
		finally:
			frappe.set_user("Administrator")

		frappe.set_user(bob)
		try:
			visible = {d.name for d in frappe.get_list("Draw Diagram", filters={"is_trashed": 0})}
			self.assertIn(bob_doc.name, visible)
			self.assertNotIn(alice_doc.name, visible, "another user's private diagram leaked into the list")
		finally:
			frappe.set_user("Administrator")

	# ----- unique slug naming (A4) -----

	def test_duplicate_titles_get_sequential_slugs(self):
		# The URL slug is derived from the title; same-titled diagrams de-dup with a
		# -2/-3 suffix. (A4 collapsed the per-candidate probe into one query but must
		# keep this exact user-visible sequence.)
		body = {"schemaVersion": 1, "diagramType": "block"}
		names = [self._make("block", body, title="Shared Title").name for _ in range(3)]
		self.assertEqual(names, ["shared-title", "shared-title-2", "shared-title-3"])

	def test_unique_slug_reuses_the_lowest_free_suffix(self):
		# A freed-up suffix in the middle is reused, not skipped — the long-standing
		# behaviour of the sequential probe, preserved by the single-query rewrite.
		from draw.draw.doctype.draw_diagram.draw_diagram import unique_diagram_name

		body = {"schemaVersion": 1, "diagramType": "block"}
		self._make("block", body, title="Gap Title")  # -> gap-title
		self._make("block", body, title="Gap Title 3")  # -> gap-title-3 (sibling at 3)
		# 2 is free between them; the next same-title diagram must fill it, not jump to 4.
		self.assertEqual(unique_diagram_name("gap-title"), "gap-title-2")

	# ----- share target validation (A6) -----

	def test_share_rejects_an_unknown_user(self):
		# `user` is a free-form string from the client; a share row for a login that
		# does not exist is dead weight (and hides typos). It must be rejected.
		from draw.api.share import share_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		self.assertRaises(
			frappe.ValidationError, share_diagram, doc.name, "draw-nobody@example.com", "view"
		)

	def test_share_rejects_a_disabled_user(self):
		# A disabled user can never open the diagram, so a share grant is meaningless
		# — reject it the same as an unknown user.
		from draw.api.share import share_diagram

		user = self._user("draw-disabled@example.com")
		frappe.db.set_value("User", user, "enabled", 0)
		self.addCleanup(lambda: frappe.db.set_value("User", user, "enabled", 1))

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		self.assertRaises(frappe.ValidationError, share_diagram, doc.name, user, "view")

	def test_share_rejects_administrator_and_guest(self):
		from draw.api.share import share_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		self.assertRaises(frappe.ValidationError, share_diagram, doc.name, "Administrator", "view")
		self.assertRaises(frappe.ValidationError, share_diagram, doc.name, "Guest", "view")

	# ----- user search hardening (A7) -----

	def test_search_users_ignores_a_too_short_query(self):
		# Empty / single-char queries must not enumerate the whole user table.
		from draw.api.share import search_users

		self.assertEqual(search_users(""), [])
		self.assertEqual(search_users("a"), [])
		self.assertEqual(search_users("  "), [])  # whitespace only

	def test_search_users_escapes_like_wildcards(self):
		# A query of pure wildcards must be treated literally, not as "match everyone".
		from draw.api.share import search_users

		user = self._user("draw-searchable@example.com")
		frappe.db.set_value("User", user, "full_name", "Draw Searchable")
		self.addCleanup(lambda: frappe.db.set_value("User", user, "full_name", None))

		# A real 2-char substring finds the user (search still works).
		self.assertIn(user, [u["name"] for u in search_users("searchable")])
		# "%%" escaped matches only names literally containing "%%" — so our user
		# (and normal users) are excluded; unescaped it would match every enabled user.
		self.assertNotIn(user, [u["name"] for u in search_users("%%")])

	# ----- save_diagram stale-revision conflict (D6) -----

	def test_save_diagram_rejects_a_stale_revision(self):
		# A concurrent/other-tab save advances the stored revision; a save that still
		# carries the older one must be rejected as a conflict. It is raised as a
		# dedicated StaleRevisionError so the client can detect it by exc_type rather
		# than by matching the translated "changed elsewhere" string (finding D6).
		from draw.api.diagram import StaleRevisionError, save_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		stale_rev = frappe.db.get_value("Draw Diagram", doc.name, "revision")  # 1 after insert
		body = json.dumps({"schemaVersion": 1, "diagramType": "block", "shapes": [{"id": "s1"}]})

		# Saving at the current revision is accepted and advances it past `stale_rev`.
		result = save_diagram(doc.name, body, stale_rev)
		self.assertGreater(result["revision"], stale_rev)

		# Re-using the now-stale revision is the conflict case.
		self.assertRaises(StaleRevisionError, save_diagram, doc.name, body, stale_rev)

	def test_get_revision_lets_a_rejected_save_retry(self):
		# Two peers of one collaborative session each autosave, so one of them loses the
		# revision race every time. It recovers by re-reading the revision and sending
		# the SAME document again — freezing instead killed that peer's autosave for the
		# rest of the session (GitHub #171). get_revision is the read that unblocks it;
		# it deliberately returns only the number, never the stored document, which
		# would clobber the peer's already-merged state.
		from draw.api.diagram import StaleRevisionError, get_revision, save_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		stale_rev = frappe.db.get_value("Draw Diagram", doc.name, "revision")
		body = json.dumps({"schemaVersion": 1, "diagramType": "block", "shapes": [{"id": "s1"}]})

		save_diagram(doc.name, body, stale_rev)  # the peer's save moves the revision on
		self.assertRaises(StaleRevisionError, save_diagram, doc.name, body, stale_rev)

		fresh_rev = get_revision(doc.name)
		self.assertGreater(fresh_rev, stale_rev)
		# The retry at the refreshed revision is accepted, and our document is stored.
		save_diagram(doc.name, body, fresh_rev)
		stored = frappe.db.get_value("Draw Diagram", doc.name, "document")
		self.assertEqual(json.loads(stored), json.loads(body))

	# ----- collaborative CRDT state (Writer-style shared lineage) -----

	def test_save_diagram_persists_crdt_state(self):
		# The client sends the Yjs update binary (base64) beside the JSON so the offline
		# cache and the server share one CRDT lineage; it is stored on the row.
		import base64

		from draw.api.diagram import save_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		rev = frappe.db.get_value("Draw Diagram", doc.name, "revision")
		crdt = base64.b64encode(b"yjs-update-binary").decode()

		save_diagram(doc.name, json.dumps({"schemaVersion": 1, "diagramType": "block"}), rev, crdt_state=crdt)

		self.assertEqual(frappe.db.get_value("Draw Diagram", doc.name, "crdt_state"), crdt)

	def test_save_diagram_leaves_crdt_state_untouched_when_omitted(self):
		# A save before collaboration has synced omits crdt_state; that must NOT wipe a
		# previously stored binary (the client sends null, the endpoint leaves it).
		import base64

		from draw.api.diagram import save_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		crdt = base64.b64encode(b"already-stored").decode()
		frappe.db.set_value("Draw Diagram", doc.name, "crdt_state", crdt)
		rev = frappe.db.get_value("Draw Diagram", doc.name, "revision")

		save_diagram(doc.name, json.dumps({"schemaVersion": 1, "diagramType": "block"}), rev)  # no crdt_state

		self.assertEqual(frappe.db.get_value("Draw Diagram", doc.name, "crdt_state"), crdt)

	def test_save_diagram_rejects_an_oversized_crdt_state(self):
		from draw.api.diagram import _MAX_CRDT_STATE_CHARS, save_diagram

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		rev = frappe.db.get_value("Draw Diagram", doc.name, "revision")

		self.assertRaises(
			frappe.ValidationError,
			save_diagram,
			doc.name,
			json.dumps({"schemaVersion": 1}),
			rev,
			"x" * (_MAX_CRDT_STATE_CHARS + 1),
		)

	# ----- save_thumbnail file lifecycle (A3) -----

	def test_save_thumbnail_replaces_the_previous_file(self):
		# The client re-renders the thumbnail up to once every 30s, each a NEW private
		# File. Without cleanup those File rows and blobs grow unbounded over a diagram's
		# life (finding A3); a save must delete the File it replaces, leaving exactly one.
		import base64

		from draw.api.diagram import save_thumbnail

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})

		def data_url(payload):
			# Distinct payloads so the two Files get distinct urls (Frappe dedups by
			# content hash). The endpoint only requires valid base64, not a real image.
			return "data:image/png;base64," + base64.b64encode(payload).decode()

		first = save_thumbnail(doc.name, data_url(b"thumb-one"))["thumbnail"]
		second = save_thumbnail(doc.name, data_url(b"thumb-two"))["thumbnail"]
		self.assertNotEqual(first, second)

		attached = frappe.get_all(
			"File",
			filters={"attached_to_doctype": "Draw Diagram", "attached_to_name": doc.name},
			pluck="file_url",
		)
		self.assertEqual(attached, [second], "the replaced thumbnail File must be deleted, not orphaned")
		self.assertEqual(frappe.db.get_value("Draw Diagram", doc.name, "thumbnail"), second)

	def test_save_thumbnail_rejects_an_undecodable_payload(self):
		# base64 decode uses validate=True; a malformed data URL is a 400, not a 500.
		from draw.api.diagram import save_thumbnail

		doc = self._make("block", {"schemaVersion": 1, "diagramType": "block"})
		self.assertRaises(
			frappe.ValidationError, save_thumbnail, doc.name, "data:image/png;base64,!!!not-base64!!!"
		)

	# ----- whitelisted API contract -----

	def test_every_whitelisted_endpoint_annotates_all_arguments(self):
		"""Frappe answers 417 FrappeTypeError for a whitelisted function with an
		unannotated argument — but only over HTTP. Called in-process the same function
		works, so a test that imports and calls it (like every other test in this file)
		cannot see the failure.

		That gap shipped a dead endpoint: `set_public(name: str, enabled)` was missing
		one annotation, so "anyone with the link can view" failed on every click while
		the sharing tests here passed. This checks the SIGNATURES instead, which catches
		the whole class rather than the one instance.
		"""
		import ast
		import pathlib

		app_root = pathlib.Path(frappe.get_app_path("draw"))
		offenders = []
		checked = 0

		for path in app_root.rglob("*.py"):
			for node in ast.walk(ast.parse(path.read_text())):
				if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
					continue
				whitelisted = any(
					(isinstance(d, ast.Call) and getattr(d.func, "attr", "") == "whitelist")
					or getattr(d, "attr", "") == "whitelist"
					for d in node.decorator_list
				)
				if not whitelisted:
					continue
				checked += 1
				missing = [
					arg.arg
					for arg in node.args.args + node.args.kwonlyargs
					if arg.annotation is None and arg.arg not in ("self", "cls")
				]
				if missing:
					rel = path.relative_to(app_root.parent)
					offenders.append(f"{rel}:{node.lineno} {node.name}() -> {missing}")

		self.assertGreater(checked, 0, "found no whitelisted endpoints to check — is the walk broken?")
		self.assertEqual(
			offenders,
			[],
			"whitelisted endpoints with unannotated arguments fail over HTTP with 417:\n"
			+ "\n".join(offenders),
		)
