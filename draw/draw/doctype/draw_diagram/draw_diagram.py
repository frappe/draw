# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

import json
import re

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

DEFAULT_DIAGRAM_TYPE = "block"


class DrawDiagram(Document):
	# Name diagrams from their title so URLs read nicely (/d/my-architecture)
	# instead of a random hash, de-duplicating with a -2/-3 suffix.
	def autoname(self):
		base = slugify(self.title) or "diagram"
		self.name = unique_diagram_name(base)

	def before_save(self):
		self.increment_revision()
		self.stamp_trashed_on()
		self.sync_diagram_type()

	def increment_revision(self):
		self.revision = (self.revision or 0) + 1

	# Mirror diagram_type from the document JSON's diagramType so the type is
	# queryable server-side (Part G3). Existing v1 docs (no diagramType) stay block.
	def sync_diagram_type(self):
		document = self.document
		if isinstance(document, str):
			try:
				document = json.loads(document)
			except (ValueError, TypeError):
				document = {}
		diagram_type = (document or {}).get("diagramType") if isinstance(document, dict) else None
		self.diagram_type = diagram_type or self.diagram_type or DEFAULT_DIAGRAM_TYPE

	def stamp_trashed_on(self):
		if self.is_trashed and not self.trashed_on:
			self.trashed_on = now_datetime()
		elif not self.is_trashed:
			self.trashed_on = None


def slugify(text):
	slug = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
	return slug[:140]


def unique_diagram_name(base):
	# `base`, else the lowest free `base-2`, `base-3`… (a deleted suffix is reused).
	# One query fetches the numbered siblings instead of probing each candidate in
	# sequence, so creating the Nth same-titled diagram is a single round-trip, not N.
	if not frappe.db.exists("Draw Diagram", base):
		return base
	prefix = f"{base}-"
	taken = set()
	for name in frappe.get_all("Draw Diagram", filters={"name": ["like", f"{prefix}%"]}, pluck="name"):
		suffix = name[len(prefix) :]
		if suffix.isdigit():
			taken.add(int(suffix))
	nxt = 2
	while nxt in taken:
		nxt += 1
	return f"{prefix}{nxt}"
