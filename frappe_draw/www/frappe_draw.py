import frappe
from frappe.sessions import get_csrf_token


def get_context(context):
	"""Inject the session CSRF token + current user into the SPA page boot.

	The built index.html (frappe_draw.html) renders `window[key] = boot[key]` for
	each boot key. Without csrf_token, every write API call (autosave, create)
	fails with CSRFTokenError. The user fields let the sidebar show the real
	logged-in user (name + initials), like Frappe Drive. Guests get neither (the
	read-only viewer needs no token).
	"""
	if frappe.session.user and frappe.session.user != "Guest":
		context.boot = {
			"csrf_token": get_csrf_token(),
			"user_id": frappe.session.user,
			"full_name": frappe.utils.get_fullname(frappe.session.user),
		}
	else:
		context.boot = {}
	context.no_cache = 1
	return context
