# Copyright (c) 2026, Frappe and contributors
# For license information, please see license.txt

from frappe.tests import IntegrationTestCase

import frappe


class TestDrawBoot(IntegrationTestCase):
	def test_boot_carries_the_sites_actual_socketio_port(self):
		# Without this, frappe-ui's socket client falls back to its hardcoded
		# default of 9000 and polls it forever on any bench configured otherwise
		# (GitHub #177).
		from draw.www.draw import get_context

		context = get_context(frappe._dict())
		self.assertEqual(context.boot["socketio_port"], frappe.conf.socketio_port)
