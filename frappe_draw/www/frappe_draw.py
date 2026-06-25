import frappe
from frappe.sessions import get_csrf_token


def get_context(context):
	"""Serve the SPA boot, gating the app behind login.

	A guest hitting the home/editor is redirected to /login (the app's data is
	per-user and writes need auth — otherwise the SPA loads but every create/save
	fails with "frappe.client.insert is not whitelisted"). The public read-only
	viewer (/view/<name>) stays open to guests for shared diagrams.

	For logged-in users, inject the CSRF token (without it every write 400s) and
	the user's name so the sidebar shows the real account (like Frappe Drive).
	"""
	if frappe.session.user == "Guest":
		path = (frappe.local.request.path if frappe.local.request else "") or "/frappe_draw"
		if "/view/" not in path:
			frappe.local.flags.redirect_location = f"/login?redirect-to={path}"
			raise frappe.Redirect
		context.boot = {}
		return context

	context.boot = {
		"csrf_token": get_csrf_token(),
		"user_id": frappe.session.user,
		"full_name": frappe.utils.get_fullname(frappe.session.user),
	}
	context.no_cache = 1
	return context
