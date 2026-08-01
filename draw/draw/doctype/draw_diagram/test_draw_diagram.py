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
