// Session actions for the signed-in user.
//
// Frappe whitelists `logout` as POST-only (frappe/handler.py), so pointing the
// browser at /api/method/logout sends a GET and the site answers "403 Not
// Permitted" with the session still alive. Post to it through frappe-ui's `call`
// (which carries the CSRF token and site header) and then hand the browser to
// the login page.

import { call } from 'frappe-ui'

const LOGIN_PATH = '/login'

export async function logout() {
  await call('logout')
  // replace(), not href: the app pages behind us need no back-button entry once
  // the session is gone.
  window.location.replace(LOGIN_PATH)
}
