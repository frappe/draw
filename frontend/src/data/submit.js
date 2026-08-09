// Bridges the error contract of frappe-ui's `useCall` / `useList` writes.
//
// The legacy createResource family rejected when a request failed. The new
// data-fetching composables sit on vueuse's useFetch, which resolves either way
// and parks the failure on `.error` instead. Callers here depend on a failed
// write aborting what follows — a success toast must not fire after a delete
// that did not happen, and dialog.confirm/prompt only render an inline error
// (keeping the dialog open to retry) when onConfirm rejects.
export async function submitOrThrow(call, params) {
  await call.submit(params)
  if (call.error) throw call.error
}
