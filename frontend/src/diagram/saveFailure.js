// What a failed save means for the user, and what they can do about it (#504).
//
// "Save failed" said neither. The failure that prompted the issue was a rebuild
// replacing the frontend bundle under an open tab, and the editor had no way to say
// that reloading was the fix — or that the work on screen was at risk. Meanwhile a
// transient 500, which needs nothing from the user because the next edit retries,
// read exactly the same.
//
// So a failure is one of two kinds:
//
//   'retry'  — the save did not land and the next edit will try again. Nothing for
//              the user to do; saying so is enough.
//   'reload' — this tab cannot save from the state it is in. Every further edit is
//              being kept nowhere, so it has to say that, name the reason, and
//              offer a way out that is not "lose it".
//
// Pure, so the whole decision is testable without a server: useAutosave hands it an
// error and gets back what to show.

// A save the user can do nothing about, and nothing needs doing.
const RETRY = { kind: 'retry', recoverable: true, message: 'Save failed — retrying.' }

// The blocking failures, in the order they are checked. Each names the cause rather
// than the HTTP status, because the status is not what the user has to act on.
//
// `recoverable` says whether RELOADING can get this session working again. It is
// not about the work on screen: that is always still in memory, so a blocking
// failure always offers to download a copy. Reload is the action that is sometimes
// pointless — there is no coming back to a diagram that has been deleted.
const BLOCKING = [
  {
    kind: 'reload',
    recoverable: true,
    matches: (error) => error?.exc_type === 'StaleRevisionError',
    // Named separately from the rest: this one is not the tab's fault, and the
    // other side's edits are the ones that would be lost by saving over them.
    message: 'This diagram was changed elsewhere — reload to see the latest version.',
  },
  {
    kind: 'reload',
    recoverable: true,
    matches: (error) =>
      error?.exc_type === 'CSRFTokenError' || error?.response?.status === 401,
    message: 'Your session has expired — reload to sign in again.',
  },
  {
    kind: 'reload',
    recoverable: true,
    matches: (error) =>
      error?.exc_type === 'PermissionError' || error?.response?.status === 403,
    // Reload rather than "ask an administrator": permission is usually lost by a
    // session going stale, and a reload is what proves which of the two it is.
    message: 'You can no longer edit this diagram — reload to check your access.',
  },
  {
    kind: 'reload',
    recoverable: false,
    // Frappe's own "the record is gone" only. A BARE 404 is deliberately not here:
    // it is at least as likely to be a route that moved under a tab running an old
    // bundle — the very failure that prompted this issue — and telling someone
    // their diagram no longer exists would be both wrong and alarming. That case
    // falls through to the stale-client entry below, where reload is the fix.
    matches: (error) => error?.exc_type === 'DoesNotExistError',
    // Nothing to save into and nothing to come back to, so reload is not offered.
    // Downloading is the only thing left that keeps the work, which is exactly why
    // this case must not stay silent.
    message: 'This diagram no longer exists — download a copy to keep your work.',
  },
  {
    kind: 'reload',
    recoverable: true,
    // The server answered, but not with anything this client knows how to save
    // against: the route is missing or the request was rejected as malformed. Both
    // are what a tab running a bundle older than the server looks like from here,
    // which is the failure this issue was filed over — a rebuild replacing the
    // assets under an open tab. Reload is the fix, and it is worth saying so.
    matches: (error) => [400, 404, 405].includes(error?.response?.status),
    message: 'Draw has been updated — reload to keep saving.',
  },
]

// How a save failure should be reported. `peered` is true when a co-editor is
// connected to the same Yjs room: a lost revision race against a peer of our own
// room is recoverable — the next edit sends again — so it is a retry rather than
// the conflict it looks like.
export function saveFailure(error, { peered = false } = {}) {
  if (peered && error?.exc_type === 'StaleRevisionError') return RETRY
  return BLOCKING.find((entry) => entry.matches(error)) || RETRY
}

// Whether a failure stops this tab saving at all. The editor freezes on these: it
// keeps accepting edits either way, and pretending otherwise is what let people keep
// working into a document that had stopped being kept (GitHub #171).
export function blocksSaving(failure) {
  return failure.kind === 'reload'
}
