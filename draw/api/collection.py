# Collections — a way to group diagrams on Home (GitHub #217).
#
# Deliberately LABELS, not folders. A diagram belongs to as many collections as
# you like and still lives in exactly one place, so nothing here competes with
# Frappe Drive's own foldering. That clash is why the old folder concept was
# removed in #115, and the dormant `Draw Folder` doctype is left alone.
#
# Collections are private to their owner. Membership rows are the join table, one
# per (collection, diagram), unique at the database level.

import frappe
from frappe import _

COLLECTION = "Draw Collection"
MEMBER = "Draw Collection Member"
DIAGRAM = "Draw Diagram"
MAX_NAME_LENGTH = 60


def _own_collection(name: str) -> str:
	"""The collection, if the caller owns it. Collections are personal, so this is
	ownership rather than a permission check — there is nothing to share them with."""
	owner = frappe.db.get_value(COLLECTION, name, "owner")
	if not owner:
		frappe.throw(_("Collection not found"), frappe.DoesNotExistError)
	if owner != frappe.session.user:
		frappe.throw(_("You are not permitted to change this collection."), frappe.PermissionError)
	return name


def _readable_diagram(name: str) -> str:
	"""A diagram the caller may read. Filing something into a personal collection
	is a read-side act — you may collect a diagram shared with you — so `read` is
	the right gate, not `write`."""
	if not frappe.has_permission(DIAGRAM, "read", doc=name):
		frappe.throw(_("Not permitted."), frappe.PermissionError)
	return name


def _clean_name(title: str) -> str:
	title = (title or "").strip()
	if not title:
		frappe.throw(_("A collection needs a name."))
	return title[:MAX_NAME_LENGTH]


@frappe.whitelist(methods=["POST"])
def create_collection(title: str) -> dict:
	"""Create a collection owned by the caller. Returns it in list_collections' shape."""
	doc = frappe.get_doc({"doctype": COLLECTION, "collection_name": _clean_name(title)}).insert(
		ignore_permissions=True
	)
	return {"name": doc.name, "title": doc.collection_name, "count": 0}


@frappe.whitelist(methods=["POST"])
def rename_collection(name: str, title: str) -> dict:
	"""Rename a collection. Only its owner may."""
	_own_collection(name)
	clean = _clean_name(title)
	frappe.db.set_value(COLLECTION, name, "collection_name", clean)
	return {"name": name, "title": clean}


@frappe.whitelist(methods=["POST"])
def delete_collection(name: str) -> None:
	"""Delete a collection. The diagrams in it are untouched — only the grouping goes."""
	_own_collection(name)
	frappe.delete_doc(COLLECTION, name, ignore_permissions=True)


@frappe.whitelist(methods=["GET"])
def list_collections() -> list:
	"""The caller's collections with the number of diagrams in each, for Home's chip
	row. Counted in ONE grouped query rather than one per collection."""
	collections = frappe.get_all(
		COLLECTION,
		filters={"owner": frappe.session.user},
		fields=["name", "collection_name"],
		order_by="sort_order asc, collection_name asc",
	)
	if not collections:
		return []
	counts = _member_counts([c.name for c in collections])
	return [
		{"name": c.name, "title": c.collection_name, "count": counts.get(c.name, 0)}
		for c in collections
	]


def _member_counts(collection_names: list) -> dict:
	"""{collection: number of diagrams in it}, in two queries whatever the count.

	A TRASHED diagram keeps its membership rows, so restoring it puts it back in
	the collections it was in. It must not be counted though, or a chip promises
	rows the list cannot show.
	"""
	rows = frappe.get_all(
		MEMBER, filters={"collection": ["in", collection_names]}, fields=["collection", "diagram"]
	)
	if not rows:
		return {}
	trashed = _trashed_among([row.diagram for row in rows])
	counts = {}
	for row in rows:
		if row.diagram not in trashed:
			counts[row.collection] = counts.get(row.collection, 0) + 1
	return counts


def _trashed_among(diagram_names: list) -> set:
	return {
		row.name
		for row in frappe.get_all(
			DIAGRAM, filters={"name": ["in", diagram_names], "is_trashed": 1}, fields=["name"]
		)
	}


@frappe.whitelist(methods=["GET"])
def diagrams_in_collection(name: str) -> list:
	"""The diagram names in a collection, for Home to filter its list by."""
	_own_collection(name)
	return [
		row.diagram
		for row in frappe.get_all(MEMBER, filters={"collection": name}, fields=["diagram"])
	]


@frappe.whitelist(methods=["GET"])
def collections_of(diagram: str) -> list:
	"""The caller's collections a diagram is in, for the "Add to collection" menu."""
	_readable_diagram(diagram)
	mine = {
		row.name
		for row in frappe.get_all(COLLECTION, filters={"owner": frappe.session.user}, fields=["name"])
	}
	return [
		row.collection
		for row in frappe.get_all(MEMBER, filters={"diagram": diagram}, fields=["collection"])
		if row.collection in mine
	]


@frappe.whitelist(methods=["POST"])
def add_to_collection(name: str, diagram: str) -> None:
	"""Put a diagram in a collection. Idempotent — adding twice is not an error."""
	_own_collection(name)
	_readable_diagram(diagram)
	try:
		frappe.get_doc({"doctype": MEMBER, "collection": name, "diagram": diagram}).insert(
			ignore_permissions=True
		)
	except frappe.UniqueValidationError:
		# The unique index did its job: it is already in there, which is the state
		# the caller asked for. Nothing to report.
		pass


@frappe.whitelist(methods=["POST"])
def remove_from_collection(name: str, diagram: str) -> None:
	"""Take a diagram out of a collection. The diagram itself is untouched."""
	_own_collection(name)
	frappe.db.delete(MEMBER, {"collection": name, "diagram": diagram})
