import frappe
from frappe.sessions import get_csrf_token


def get_context(context):
	"""Inject the session CSRF token into the SPA page boot.

	The built index.html (frappe_draw.html) renders `window[key] = boot[key]`
	for each boot key. Without this, `window.csrf_token` is undefined and every
	write API call (autosave, create) fails with CSRFTokenError. Guests skip it
	(read-only viewer needs no token).
	"""
	if frappe.session.user and frappe.session.user != "Guest":
		context.boot = {"csrf_token": get_csrf_token()}
	else:
		context.boot = {}
	context.no_cache = 1
	return context
