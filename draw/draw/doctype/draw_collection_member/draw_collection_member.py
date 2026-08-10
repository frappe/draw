# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DrawCollectionMember(Document):
	# One row per (collection, diagram). The composite unique constraint is added by
	# draw.setup.ensure_setup, NOT here: DocType.on_update only runs a controller's
	# on_doctype_update when developer_mode is on and flags.in_import is off, which
	# is the opposite of how `bench migrate` syncs a DocType JSON.
	pass
