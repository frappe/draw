# Back-fill for GitHub #73: grant the Draw User role to every existing real user
# so nobody has to rely on System Manager to use Draw. A System Manager's
# `query_conditions` returns "" (no restriction), which is what leaks every
# diagram into the home list.
#
# New users are handled by the User `after_insert` doc event; this patch covers
# the users who already existed when the fix shipped. Idempotent: a user who
# already has the role is skipped by the grant guard (and again by `add_roles`),
# so a repeated migrate is a no-op.

import frappe

from draw.setup import ensure_setup, grant_draw_user_role


def execute():
	# The role and its owner-scoped perms must exist before the role can be
	# granted. ensure_setup also runs from after_migrate, but call it here too so
	# the patch is self-contained and independent of hook ordering.
	ensure_setup()

	users = frappe.get_all(
		"User",
		filters={"enabled": 1, "name": ("not in", ("Administrator", "Guest"))},
		pluck="name",
	)
	for name in users:
		grant_draw_user_role(frappe._dict(name=name))
