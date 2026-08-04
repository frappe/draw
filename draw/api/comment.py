# Commenting on a Draw Diagram (GitHub #108) — the backend the "Can comment" share
# tier finally consumes.
#
# Comments are stored server-side as Draw Comment rows, NOT in the diagram's Yjs
# document: the real-time document rides a peer-to-peer WebRTC room that only editors
# are issued (draw.api.diagram.get_collab_room returns no room to a viewer/commenter),
# so a comment-level user is never in that session and could never see or write a
# comment that lived there. A whitelisted, permission-gated API plus a Frappe realtime
# nudge reaches everyone who may read the diagram.
#
# Access mirrors draw/api/share.py: every call checks the PARENT diagram's permission
# (the custom "comment" DocShare right registered in draw.setup) and then reads/writes
# Draw Comment with ignore_permissions. The Draw Comment doctype itself is
# System-Manager-only; it is never the access boundary — the diagram is.
#
#   read     -> anyone who may view the diagram (owner / share / general access)
#   comment  -> owner, editors, and users shared at "comment" (create / reply / resolve)
#   moderate -> owner + editors (delete anyone's comment)
#
# Product decisions (Vibhav, 4 Aug 2026): threads with replies + resolve; ANY
# comment-level user may resolve any thread; in-app notification (Frappe bell) to the
# owner and everyone the diagram is shared with, plus anyone @mentioned; no email.

import re

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from draw.api.permission import can_view_via_general_access

DOCTYPE = "Draw Diagram"
COMMENT = "Draw Comment"

# A comment body is plain text (the editor renders it as text, never HTML). Cap the
# length so a single comment can't be used to store an unbounded blob.
MAX_CONTENT_LEN = 10000

# @mention token the composer inserts: @[Full Name](user@example.com). Only the id in
# the parentheses is trusted; the label is display sugar.
_MENTION_RE = re.compile(r"@\[[^\]]+\]\(([^)]+)\)")

REALTIME_EVENT = "draw_comment_update"


# --- permission gates --------------------------------------------------------


def _readable_diagram(diagram: str) -> "frappe.model.document.Document":
	"""Load a diagram the caller may VIEW, or raise. Same gate as
	draw.api.diagram.get_diagram: owner / per-user share / general access."""
	if not frappe.db.exists(DOCTYPE, diagram):
		frappe.throw(_("Diagram not found"), frappe.DoesNotExistError)
	doc = frappe.get_doc(DOCTYPE, diagram)
	if can_view_via_general_access(doc):
		return doc
	if doc.owner == frappe.session.user or doc.has_permission("read"):
		return doc
	raise frappe.PermissionError(_("You need access to view this diagram"))


def _can_comment(diagram: str) -> bool:
	"""Whether the caller may create / reply / resolve on this diagram: the custom
	"comment" right (owner, editors, and "comment"-shared users all hold it) or, as a
	fallback, plain write (covers a System Manager moderating with no explicit share)."""
	return bool(
		frappe.has_permission(DOCTYPE, "comment", doc=diagram)
		or frappe.has_permission(DOCTYPE, "write", doc=diagram)
	)


def _assert_can_comment(diagram: str) -> None:
	if not _can_comment(diagram):
		frappe.throw(_("You do not have permission to comment on this diagram."), frappe.PermissionError)


def _can_moderate(diagram: str) -> bool:
	"""Owner / editor / System Manager — may delete anyone's comment."""
	return bool(frappe.has_permission(DOCTYPE, "write", doc=diagram))


# --- reads -------------------------------------------------------------------


@frappe.whitelist()
def list_comments(diagram: str) -> dict:
	"""Every comment on a diagram the caller may read, enriched for the editor:
	{ can_comment, can_moderate, comments: [ {name, parent_comment, content,
	anchor_type, shape_id, board_x, board_y, resolved, resolved_by, resolved_on, owner,
	author, author_image, creation} ] }.

	`can_comment` drives the editor UI: a plain viewer gets the read-only thread list
	but no compose box. `can_moderate` (owner / editor) lets the UI offer deletion of
	someone else's comment; the author can always remove their own. Rows come back
	oldest-first so a thread reads top to bottom.
	"""
	_readable_diagram(diagram)
	rows = frappe.get_all(
		COMMENT,
		filters={"diagram": diagram},
		fields=[
			"name",
			"parent_comment",
			"content",
			"anchor_type",
			"shape_id",
			"board_x",
			"board_y",
			"resolved",
			"resolved_by",
			"resolved_on",
			"owner",
			"creation",
		],
		order_by="creation asc",
	)
	_attach_authors(rows)
	return {
		"can_comment": _can_comment(diagram),
		"can_moderate": _can_moderate(diagram),
		"comments": rows,
	}


def _attach_authors(rows: list) -> None:
	"""Add author full_name / image to each row in one query (no N+1)."""
	user_ids = {row.owner for row in rows}
	if not user_ids:
		return
	info = {
		u.name: u
		for u in frappe.get_all(
			"User",
			filters={"name": ["in", list(user_ids)]},
			fields=["name", "full_name", "user_image"],
		)
	}
	for row in rows:
		user = info.get(row.owner)
		row["author"] = (user and user.full_name) or row.owner
		row["author_image"] = user and user.user_image


# --- writes ------------------------------------------------------------------


@frappe.whitelist()
def add_comment(
	diagram: str,
	content: str,
	anchor_type: str = "board",
	shape_id: str | None = None,
	board_x: float | None = None,
	board_y: float | None = None,
) -> dict:
	"""Start a new comment thread on a diagram. Anchored to a shape (anchor_type =
	'shape' + shape_id), a board point (anchor_type = 'board' + board_x/board_y), or
	nothing (anchor_type = 'general', panel only). Gated on the comment permission."""
	_assert_can_comment(diagram)
	content = _clean_content(content)

	if anchor_type not in ("shape", "board", "general"):
		frappe.throw(_("Unknown anchor type: {0}").format(anchor_type))
	if anchor_type == "shape" and not shape_id:
		frappe.throw(_("A shape comment needs a shape to anchor to."))
	if anchor_type == "board" and (board_x is None or board_y is None):
		frappe.throw(_("A board comment needs a position."))

	doc = frappe.get_doc(
		{
			"doctype": COMMENT,
			"diagram": diagram,
			"content": content,
			"anchor_type": anchor_type,
			"shape_id": shape_id if anchor_type == "shape" else None,
			"board_x": board_x if anchor_type == "board" else None,
			"board_y": board_y if anchor_type == "board" else None,
		}
	).insert(ignore_permissions=True)

	_notify(diagram, doc, content, is_reply=False)
	_broadcast(diagram, "add", doc.name)
	return _enriched(doc)


@frappe.whitelist()
def reply_comment(diagram: str, parent_comment: str, content: str) -> dict:
	"""Reply to a thread's root comment. Gated on the comment permission."""
	_assert_can_comment(diagram)
	content = _clean_content(content)
	root = _get_comment(diagram, parent_comment)
	if root.parent_comment:
		frappe.throw(_("You can only reply to the top comment of a thread."))

	doc = frappe.get_doc(
		{
			"doctype": COMMENT,
			"diagram": diagram,
			"parent_comment": parent_comment,
			"content": content,
		}
	).insert(ignore_permissions=True)

	_notify(diagram, doc, content, is_reply=True)
	_broadcast(diagram, "reply", doc.name)
	return _enriched(doc)


@frappe.whitelist()
def resolve_comment(diagram: str, comment: str, resolved: int = 1) -> dict:
	"""Resolve or reopen a thread. Any comment-level user may do this (Vibhav's call);
	only a root carries resolved state."""
	_assert_can_comment(diagram)
	root = _get_comment(diagram, comment)
	if root.parent_comment:
		frappe.throw(_("Only a whole thread can be resolved, not a single reply."))

	resolved = 1 if cint(resolved) else 0
	root.resolved = resolved
	root.resolved_by = frappe.session.user if resolved else None
	root.resolved_on = now_datetime() if resolved else None
	root.save(ignore_permissions=True)

	_broadcast(diagram, "resolve", root.name)
	return _enriched(root)


@frappe.whitelist()
def edit_comment(diagram: str, comment: str, content: str) -> dict:
	"""Edit a comment's text. Author only — moderating someone else's words is not a
	delete-and-replace we want to hide."""
	_readable_diagram(diagram)
	doc = _get_comment(diagram, comment)
	if doc.owner != frappe.session.user:
		frappe.throw(_("You can only edit your own comments."), frappe.PermissionError)
	doc.content = _clean_content(content)
	doc.save(ignore_permissions=True)

	_broadcast(diagram, "edit", doc.name)
	return _enriched(doc)


@frappe.whitelist()
def delete_comment(diagram: str, comment: str) -> dict:
	"""Delete a comment. The author may delete their own; the owner / editors may
	delete anyone's. Deleting a root takes its replies with it (controller on_trash)."""
	_readable_diagram(diagram)
	doc = _get_comment(diagram, comment)
	if doc.owner != frappe.session.user and not _can_moderate(diagram):
		frappe.throw(_("You do not have permission to delete this comment."), frappe.PermissionError)
	frappe.delete_doc(COMMENT, comment, ignore_permissions=True, force=True)

	_broadcast(diagram, "delete", comment)
	return {"name": comment, "deleted": True}


# --- helpers -----------------------------------------------------------------


def _clean_content(content: str) -> str:
	content = (content or "").strip()
	if not content:
		frappe.throw(_("A comment cannot be empty."))
	if len(content) > MAX_CONTENT_LEN:
		frappe.throw(_("Comment is too long (max {0} characters).").format(MAX_CONTENT_LEN))
	return content


def _get_comment(diagram: str, comment: str) -> "frappe.model.document.Document":
	"""Load a comment, insisting it belongs to `diagram` — so a name from one diagram
	can't be used to touch a comment on another the caller may also reach."""
	if not frappe.db.exists(COMMENT, comment):
		frappe.throw(_("Comment not found."), frappe.DoesNotExistError)
	doc = frappe.get_doc(COMMENT, comment)
	if doc.diagram != diagram:
		frappe.throw(_("Comment not found."), frappe.DoesNotExistError)
	return doc


def _enriched(doc: "frappe.model.document.Document") -> dict:
	"""One comment as the API row shape (matches list_comments entries)."""
	row = frappe._dict(
		{
			"name": doc.name,
			"parent_comment": doc.parent_comment,
			"content": doc.content,
			"anchor_type": doc.anchor_type,
			"shape_id": doc.shape_id,
			"board_x": doc.board_x,
			"board_y": doc.board_y,
			"resolved": cint(doc.resolved),
			"resolved_by": doc.resolved_by,
			"resolved_on": str(doc.resolved_on) if doc.resolved_on else None,
			"owner": doc.owner,
			"creation": str(doc.creation),
		}
	)
	_attach_authors([row])
	return row


def _broadcast(diagram: str, action: str, comment: str) -> None:
	"""Nudge every open editor of this diagram to refetch. The payload carries no
	comment text — just enough for a client to know its diagram changed and re-read
	through the permission-gated list_comments. after_commit so the refetch sees the
	committed row."""
	frappe.publish_realtime(
		event=REALTIME_EVENT,
		message={"diagram": diagram, "action": action, "comment": comment},
		after_commit=True,
	)


# --- notifications -----------------------------------------------------------


def _notify(diagram: str, doc, content: str, is_reply: bool) -> None:
	"""In-app (Frappe bell) notification for a new comment / reply: everyone on the
	diagram (owner + shared users) plus anyone @mentioned, minus the author. No email
	(Vibhav's call)."""
	actor = frappe.session.user
	diagram_doc = frappe.get_doc(DOCTYPE, diagram)
	title = diagram_doc.get("title") or _("a diagram")

	mentioned = _mentioned_users(content)
	audience = _diagram_audience(diagram_doc) | mentioned
	audience.discard(actor)
	audience.discard("Guest")
	if not audience:
		return

	actor_name = frappe.db.get_value("User", actor, "full_name") or actor
	verb = _("replied to a comment on") if is_reply else _("commented on")
	for user in audience:
		mine = user in mentioned
		subject = (
			_("{0} mentioned you on {1}").format(actor_name, title)
			if mine
			else _("{0} {1} {2}").format(actor_name, verb, title)
		)
		_notification_log(user, actor, diagram, subject, is_mention=mine)


def _diagram_audience(diagram_doc) -> set:
	"""Owner + every user the diagram is shared with (any level)."""
	users = {diagram_doc.owner}
	for row in frappe.get_all(
		"DocShare",
		filters={"share_doctype": DOCTYPE, "share_name": diagram_doc.name},
		fields=["user"],
	):
		if row.user:
			users.add(row.user)
	return users


def _mentioned_users(content: str) -> set:
	"""User ids @mentioned in the body that actually exist and are enabled — so a
	fabricated mention token can't spray notifications at arbitrary strings."""
	ids = {m.strip() for m in _MENTION_RE.findall(content or "") if m.strip()}
	if not ids:
		return set()
	valid = frappe.get_all(
		"User",
		filters={"name": ["in", list(ids)], "enabled": 1},
		pluck="name",
	)
	return set(valid)


def _notification_log(user: str, actor: str, diagram: str, subject: str, is_mention: bool) -> None:
	"""Create a Notification Log row (lights the Desk bell via its own after_insert
	realtime publish). Best-effort — a notification failure never breaks the comment."""
	try:
		frappe.get_doc(
			{
				"doctype": "Notification Log",
				"for_user": user,
				"from_user": actor,
				"type": "Mention" if is_mention else "Alert",
				"document_type": DOCTYPE,
				"document_name": diagram,
				"subject": subject,
			}
		).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="Draw: comment notification failed")
