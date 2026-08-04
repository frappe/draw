// One place to turn a failed Frappe request into a line worth showing a user.
// Which field carries the useful part depends on the failure: a server exception
// arrives in `messages` (already user-facing text), a transport failure only has
// `message` (the request URL plus a Python exception name), and a permission
// failure says "No permission for Draw Diagram" — true, but no hint of what to do
// about it. Creating a diagram used to fail into the console alone (#174), so the
// text these produce is what the user now actually reads.

const PERMISSION_TEXT =
  'You do not have permission to do this. Ask an administrator for access to Frappe Draw.'

const FALLBACK_TEXT = 'Something went wrong. Please try again.'

// Whether `error` is a Frappe permission failure (403 / PermissionError).
export function isPermissionError(error) {
  return error?.exc_type === 'PermissionError' || error?.response?.status === 403
}

// Text to show for a failed request: an actionable line when permission is the
// cause, else the server's own message(s), else a generic fallback.
export function errorMessage(error, fallback = FALLBACK_TEXT) {
  if (isPermissionError(error)) return PERMISSION_TEXT
  const messages = (error?.messages || []).filter(Boolean)
  if (messages.length) return messages.join('\n')
  return error?.message || fallback
}
