// Import an image (PNG/JPEG/GIF/WebP/SVG) onto the canvas as an image shape.
// The file is uploaded to a public Frappe File via frappe-ui's FileUploadHandler
// and the returned file_url is stored on the shape — so the document stays light
// (no base64 blobs in the autosaved JSON) and the image is shareable/exportable.
// Images are ordinary shapes (type 'image'): selectable, movable, resizable.
//
// The upload is ATTACHED to the current diagram and routed through Draw's own
// server endpoint (draw.api.diagram.upload_diagram_image) rather than the generic
// upload flow. Under Frappe Suite, the generic flow adopts every loose uploaded
// File into the user's Drive Home, so inserting N images left N stray Drive files
// (#74); the endpoint inserts the File server-side, which the Drive adoption hook
// never sees. Falls back to a plain upload if the diagram name isn't known yet.
//
// Every way an insert can fail says so (#502). This flow used to `return null` on
// a refused file and on an upload that came back without a url, and the picker's
// change listener neither awaited nor caught the promise — so a throw surfaced
// only as an unhandled rejection in the console. From the canvas all of that looked
// identical: nothing happened.

import { FileUploadHandler, toast } from 'frappe-ui'

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml'
const MAX_W = 420 // cap the placed width so a big photo doesn't fill the canvas
// No byte-size gate here (or on the server, upload_diagram_image) — dropped on
// request. What still limits an upload is whatever sits below this app: the
// site's own max_file_size (site_config.json) and the web server's request-body
// limit, neither of which this file can see or mirror.
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']

export function useImageInsert(store) {
  const handler = new FileUploadHandler()

  // Open the OS file picker and hand the uploaded image to `onReady`, which arms it
  // for click-to-place (#503). The upload starts the moment the file is chosen, so
  // it is usually finished by the time the user has picked a spot — and a pan made
  // while the OS dialog was open needs no special handling any more, because the
  // click decides the position.
  function pick(onReady) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]
      if (file) upload(file).then((image) => image && onReady?.(image))
    })
    input.click()
  }

  // Upload `file` and return `{ src, w, h }` ready to place, or null having told the
  // user why not. The box is measured here rather than at placement so an armed
  // image knows its own size before the click that drops it.
  async function upload(file) {
    const refusal = refusalFor(file)
    if (refusal) return report(refusal)
    let fileDoc = null
    try {
      fileDoc = await handler.upload(file, uploadOptions())
    } catch (error) {
      return report(uploadFailure(error, file))
    }
    const src = fileDoc?.file_url || fileDoc?.message?.file_url
    if (!src) return report(`Could not insert ${nameOf(file)} — the upload returned no file.`)
    return boxFor(src, await naturalSize(src))
  }

  // Upload `file` and place it; `at` (canvas-unit point) centers it, else canvas center.
  // Used by drop and paste, which already know where the image goes.
  async function insert(file, at) {
    const image = await upload(file)
    return image ? store.insertImage(image, at) : null
  }

  // Attach to the diagram + route through Draw's endpoint when we know the diagram
  // name; otherwise a plain public upload (unchanged legacy behaviour).
  function uploadOptions() {
    const name = store.state.name
    if (!name) return { private: false }
    return {
      private: false,
      doctype: 'Draw Diagram',
      docname: name,
      method: 'draw.api.diagram.upload_diagram_image',
    }
  }

  return { pick, insert }
}

function boxFor(src, size) {
  const scale = Math.min(1, MAX_W / size.w)
  return { src, w: Math.round(size.w * scale), h: Math.round(size.h * scale) }
}

// Why this file cannot be inserted, or null. The same gates the server
// applies, so the refusal arrives before the bytes go anywhere.
function refusalFor(file) {
  const name = nameOf(file)
  if (!file.type?.startsWith('image/')) return `${name} is not an image.`
  const extension = extensionOf(file)
  if (extension && !EXTENSIONS.includes(extension)) {
    return `Draw cannot insert .${extension} files. Use PNG, JPG, GIF, WebP or SVG.`
  }
  return null
}

// The server's own message when it sent one — it knows which gate was hit, and a
// generic "upload failed" would throw that away.
function uploadFailure(error, file) {
  const message = error?.messages?.[0] || error?.message || error?.exc_type
  return message ? `Could not insert ${nameOf(file)} — ${message}` : `Could not insert ${nameOf(file)}.`
}

function report(message) {
  toast.error(message)
  return null
}

function nameOf(file) {
  return file?.name || 'That file'
}

function extensionOf(file) {
  const name = file?.name || ''
  return name.includes('.') ? name.split('.').pop().toLowerCase() : ''
}

// Resolve an image's natural size; fall back to a sensible default (SVGs and
// failures often report 0) so placement never produces a zero-size shape.
function naturalSize(url) {
  return new Promise((resolve) => {
    const fallback = { w: MAX_W, h: Math.round(MAX_W * 0.66) }
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || fallback.w
      const h = img.naturalHeight || fallback.h
      resolve({ w, h })
    }
    img.onerror = () => resolve(fallback)
    img.src = url
  })
}
