# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

# Commenting (GitHub #108). These pin the contract the "Can comment" share tier now
# consumes: a comment-level user may create / reply / resolve, a plain viewer may not,
# owner/editors moderate, threads stay flat, and a new comment notifies the diagram's
# audience. Every call goes through the whitelisted draw.api.comment surface, gated on
# the parent diagram's permission — the same shape draw.api.share enforces.

import json

from frappe.tests import IntegrationTestCase

import frappe


class TestDrawComment(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Register the "comment" permission type + the Draw User owner perms (the
		# after_install/after_migrate work), so an owner granted the role below holds
		# read/write/comment on their own diagram — the production state, where every
		# owner is a Draw User (the role is granted lazily on opening Draw).
		from draw.setup import ensure_setup

		ensure_setup()

	def _user(self, email):
		# A real, enabled user with NO Draw role — proving access flows from the
		# diagram's share/permission alone, exactly like the sharing tests.
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

	def _diagram(self, owner=None, title="Comment test"):
		doc = frappe.get_doc(
			{
				"doctype": "Draw Diagram",
				"title": title,
				"diagram_type": "unified",
				"document": json.dumps({"schemaVersion": 1, "diagramType": "unified"}),
			}
		).insert(ignore_permissions=True)
		self.addCleanup(lambda: frappe.delete_doc("Draw Diagram", doc.name, force=True, ignore_permissions=True))
		# Clear any comments left by a test before the diagram itself is removed.
		self.addCleanup(
			lambda: frappe.db.delete("Draw Comment", {"diagram": doc.name})
		)
		if owner:
			frappe.db.set_value("Draw Diagram", doc.name, "owner", owner)
			# A real owner is a Draw User (granted on opening Draw); without the role the
			# owner-scoped if_owner perms — including comment/write — don't apply to them.
			from draw.setup import ROLE

			frappe.get_doc("User", owner).add_roles(ROLE)
			doc.reload()
		return doc

	def _as(self, user):
		frappe.set_user(user)
		self.addCleanup(lambda: frappe.set_user("Administrator"))

	# ----- create + gating -----

	def test_comment_tier_user_can_add_a_comment(self):
		from draw.api.comment import add_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner@example.com")
		commenter = self._user("cmt-commenter@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, commenter, "comment")

		self._as(commenter)
		row = add_comment(doc.name, "Looks good to me", anchor_type="general")
		self.assertEqual(row["content"], "Looks good to me")
		self.assertEqual(row["owner"], commenter)
		self.assertTrue(frappe.db.exists("Draw Comment", row["name"]))

	def test_viewer_cannot_add_a_comment(self):
		from draw.api.comment import add_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner2@example.com")
		viewer = self._user("cmt-viewer@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, viewer, "view")

		self._as(viewer)
		self.assertRaises(
			frappe.PermissionError, add_comment, doc.name, "I shouldn't be able to", anchor_type="general"
		)

	def test_outsider_cannot_even_read_comments(self):
		from draw.api.comment import list_comments

		self._diagram_with_a_comment()  # owned by admin, unshared
		outsider = self._user("cmt-outsider@example.com")
		self._as(outsider)
		self.assertRaises(frappe.PermissionError, list_comments, self._doc_name)

	def test_owner_and_editor_can_comment(self):
		from draw.api.comment import add_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner3@example.com")
		editor = self._user("cmt-editor@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, editor, "edit")

		self._as(owner)
		self.assertTrue(add_comment(doc.name, "owner note", anchor_type="general")["name"])
		frappe.set_user(editor)
		self.assertTrue(add_comment(doc.name, "editor note", anchor_type="general")["name"])

	# ----- anchoring -----

	def test_shape_anchor_requires_a_shape_id(self):
		from draw.api.comment import add_comment

		doc = self._diagram()
		self.assertRaises(frappe.ValidationError, add_comment, doc.name, "x", anchor_type="shape")
		row = add_comment(doc.name, "on the box", anchor_type="shape", shape_id="s123")
		self.assertEqual(row["anchor_type"], "shape")
		self.assertEqual(row["shape_id"], "s123")

	def test_board_anchor_requires_a_position(self):
		from draw.api.comment import add_comment

		doc = self._diagram()
		self.assertRaises(frappe.ValidationError, add_comment, doc.name, "x", anchor_type="board")
		row = add_comment(doc.name, "over here", anchor_type="board", board_x=120.5, board_y=-40.0)
		self.assertEqual(row["anchor_type"], "board")
		self.assertEqual((row["board_x"], row["board_y"]), (120.5, -40.0))

	def test_unknown_anchor_type_is_rejected(self):
		from draw.api.comment import add_comment

		doc = self._diagram()
		self.assertRaises(frappe.ValidationError, add_comment, doc.name, "x", anchor_type="satellite")

	# ----- threads / replies -----

	def test_reply_attaches_to_the_root(self):
		from draw.api.comment import add_comment, reply_comment

		doc = self._diagram()
		root = add_comment(doc.name, "root", anchor_type="general")
		reply = reply_comment(doc.name, root["name"], "a reply")
		self.assertEqual(reply["parent_comment"], root["name"])
		# A reply carries no anchor of its own.
		self.assertFalse(reply["anchor_type"])

	def test_cannot_reply_to_a_reply(self):
		from draw.api.comment import add_comment, reply_comment

		doc = self._diagram()
		root = add_comment(doc.name, "root", anchor_type="general")
		reply = reply_comment(doc.name, root["name"], "a reply")
		self.assertRaises(frappe.ValidationError, reply_comment, doc.name, reply["name"], "nested?")

	def test_a_comment_from_another_diagram_is_not_reachable(self):
		# The name of a comment on diagram B cannot be used to reply/resolve/delete via
		# diagram A, even for a user who can reach both.
		from draw.api.comment import add_comment, resolve_comment

		a = self._diagram(title="A")
		b = self._diagram(title="B")
		on_b = add_comment(b.name, "on B", anchor_type="general")
		self.assertRaises(
			frappe.DoesNotExistError, resolve_comment, a.name, on_b["name"], 1
		)

	# ----- resolve (any comment-level user; Vibhav's call) -----

	def test_any_commenter_can_resolve_and_reopen(self):
		from draw.api.comment import add_comment, resolve_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner4@example.com")
		commenter = self._user("cmt-resolver@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, commenter, "comment")

		self._as(owner)
		root = add_comment(doc.name, "please resolve", anchor_type="general")

		# A different comment-level user resolves it.
		frappe.set_user(commenter)
		resolved = resolve_comment(doc.name, root["name"], 1)
		self.assertTrue(resolved["resolved"])
		self.assertEqual(resolved["resolved_by"], commenter)
		self.assertTrue(resolved["resolved_on"])

		reopened = resolve_comment(doc.name, root["name"], 0)
		self.assertFalse(reopened["resolved"])
		self.assertIsNone(reopened["resolved_by"])
		self.assertIsNone(reopened["resolved_on"])

	def test_viewer_cannot_resolve(self):
		from draw.api.comment import add_comment, resolve_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner5@example.com")
		viewer = self._user("cmt-viewer2@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, viewer, "view")
		self._as(owner)
		root = add_comment(doc.name, "root", anchor_type="general")

		frappe.set_user(viewer)
		self.assertRaises(frappe.PermissionError, resolve_comment, doc.name, root["name"], 1)

	# ----- delete / edit -----

	def test_author_can_delete_own_comment(self):
		from draw.api.comment import add_comment, delete_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner6@example.com")
		commenter = self._user("cmt-author@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, commenter, "comment")

		self._as(commenter)
		row = add_comment(doc.name, "mine to delete", anchor_type="general")
		delete_comment(doc.name, row["name"])
		self.assertFalse(frappe.db.exists("Draw Comment", row["name"]))

	def test_commenter_cannot_delete_another_users_comment(self):
		from draw.api.comment import add_comment, delete_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner7@example.com")
		author = self._user("cmt-a@example.com")
		other = self._user("cmt-b@example.com")
		doc = self._diagram(owner=owner)
		for u in (author, other):
			share_diagram(doc.name, u, "comment")

		self._as(author)
		row = add_comment(doc.name, "author's comment", anchor_type="general")

		frappe.set_user(other)
		self.assertRaises(frappe.PermissionError, delete_comment, doc.name, row["name"])

	def test_editor_can_moderate_others_comments(self):
		from draw.api.comment import add_comment, delete_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner8@example.com")
		author = self._user("cmt-mod-author@example.com")
		editor = self._user("cmt-mod-editor@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, author, "comment")
		share_diagram(doc.name, editor, "edit")

		self._as(author)
		row = add_comment(doc.name, "flag me", anchor_type="general")

		frappe.set_user(editor)
		delete_comment(doc.name, row["name"])  # editor moderates
		self.assertFalse(frappe.db.exists("Draw Comment", row["name"]))

	def test_deleting_a_root_cascades_to_replies(self):
		from draw.api.comment import add_comment, delete_comment, reply_comment

		doc = self._diagram()
		root = add_comment(doc.name, "root", anchor_type="general")
		reply = reply_comment(doc.name, root["name"], "reply")
		delete_comment(doc.name, root["name"])
		self.assertFalse(frappe.db.exists("Draw Comment", root["name"]))
		self.assertFalse(frappe.db.exists("Draw Comment", reply["name"]), "reply was orphaned")

	def test_only_the_author_can_edit(self):
		from draw.api.comment import add_comment, edit_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner9@example.com")
		author = self._user("cmt-edit-author@example.com")
		editor = self._user("cmt-edit-editor@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, author, "comment")
		share_diagram(doc.name, editor, "edit")

		self._as(author)
		row = add_comment(doc.name, "first draft", anchor_type="general")
		edited = edit_comment(doc.name, row["name"], "second draft")
		self.assertEqual(edited["content"], "second draft")

		# Even an editor cannot rewrite someone else's words.
		frappe.set_user(editor)
		self.assertRaises(frappe.PermissionError, edit_comment, doc.name, row["name"], "tampered")

	# ----- content validation -----

	def test_empty_and_oversized_content_are_rejected(self):
		from draw.api.comment import MAX_CONTENT_LEN, add_comment

		doc = self._diagram()
		self.assertRaises(frappe.ValidationError, add_comment, doc.name, "   ", anchor_type="general")
		self.assertRaises(
			frappe.ValidationError, add_comment, doc.name, "x" * (MAX_CONTENT_LEN + 1), anchor_type="general"
		)

	# ----- list_comments shape -----

	def test_list_reports_can_comment_and_author_info(self):
		from draw.api.comment import add_comment, list_comments
		from draw.api.share import share_diagram

		owner = self._user("cmt-owner10@example.com")
		commenter = self._user("cmt-lister@example.com")
		frappe.db.set_value("User", commenter, "full_name", "Cmt Lister")
		viewer = self._user("cmt-list-viewer@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, commenter, "comment")
		share_diagram(doc.name, viewer, "view")

		self._as(commenter)
		add_comment(doc.name, "hello", anchor_type="general")

		listed = list_comments(doc.name)
		self.assertTrue(listed["can_comment"])
		self.assertFalse(listed["can_moderate"], "a commenter is not a moderator")
		self.assertEqual(len(listed["comments"]), 1)
		self.assertEqual(listed["comments"][0]["author"], "Cmt Lister")

		# A viewer sees the thread but gets no compose affordance.
		frappe.set_user(viewer)
		as_viewer = list_comments(doc.name)
		self.assertFalse(as_viewer["can_comment"])
		self.assertFalse(as_viewer["can_moderate"])
		self.assertEqual(len(as_viewer["comments"]), 1)

		# The owner moderates.
		frappe.set_user(owner)
		self.assertTrue(list_comments(doc.name)["can_moderate"])

	# ----- notifications -----

	def test_new_comment_notifies_the_audience_but_not_the_author(self):
		from draw.api.comment import add_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-notify-owner@example.com")
		commenter = self._user("cmt-notify-actor@example.com")
		bystander = self._user("cmt-notify-bystander@example.com")
		doc = self._diagram(owner=owner)
		share_diagram(doc.name, commenter, "comment")
		share_diagram(doc.name, bystander, "view")

		self._as(commenter)
		add_comment(doc.name, "ping the team", anchor_type="general")
		frappe.set_user("Administrator")

		def notified(user):
			return frappe.db.exists(
				"Notification Log", {"for_user": user, "document_type": "Draw Diagram", "document_name": doc.name}
			)

		self.assertTrue(notified(owner), "the owner should be notified")
		self.assertTrue(notified(bystander), "a shared viewer should be notified")
		self.assertFalse(notified(commenter), "the author should not notify themselves")

	def test_mention_notifies_the_mentioned_user(self):
		from draw.api.comment import add_comment
		from draw.api.share import share_diagram

		owner = self._user("cmt-mention-owner@example.com")
		commenter = self._user("cmt-mention-actor@example.com")
		mentioned = self._user("cmt-mentioned@example.com")
		doc = self._diagram(owner=owner)
		for u in (commenter, mentioned):
			share_diagram(doc.name, u, "comment")

		self._as(commenter)
		add_comment(
			doc.name, f"hey @[Mentioned One]({mentioned}) take a look", anchor_type="general"
		)
		frappe.set_user("Administrator")

		row = frappe.db.get_value(
			"Notification Log",
			{"for_user": mentioned, "document_name": doc.name},
			["type"],
			as_dict=True,
		)
		self.assertTrue(row, "the mentioned user should be notified")
		self.assertEqual(row.type, "Mention")

	# ----- helpers -----

	_doc_name = None

	def _diagram_with_a_comment(self):
		from draw.api.comment import add_comment

		doc = self._diagram()
		self._doc_name = doc.name
		add_comment(doc.name, "seed", anchor_type="general")
		return doc
