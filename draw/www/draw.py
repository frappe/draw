import frappe
from frappe.sessions import get_csrf_token

from draw.setup import grant_draw_user_role


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
		path = (frappe.local.request.path if frappe.local.request else "") or "/draw"
		if "/view/" not in path:
			frappe.local.flags.redirect_location = f"/login?redirect-to={path}"
			raise frappe.Redirect
		context.boot = {}
		return context

	# A logged-in user who opens Draw is a real Draw user: lazily give them the
	# owner-scoped Draw User role if they lack it, so their diagrams work without
	# anyone needing System Manager (#73). Scoping the grant to people who actually
	# open Draw leaves other apps' Website / portal users on this bench untouched.
	# grant_draw_user_role is self-guarded (skips Guest / Administrator / System
	# Manager / existing holders and never raises), so this is a cheap no-op on
	# repeat visits and can never break the boot.
	grant_draw_user_role(frappe.session.user)

	context.boot = {
		"csrf_token": get_csrf_token(),
		"user_id": frappe.session.user,
		"full_name": frappe.utils.get_fullname(frappe.session.user),
		"socketio_port": frappe.conf.socketio_port,
	}
	context.no_cache = 1
	return context
