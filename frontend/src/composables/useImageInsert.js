// Import an image (PNG/JPEG/GIF/WebP/SVG) onto the canvas as an image shape.
// The file is uploaded to a public Frappe File via frappe-ui's FileUploadHandler
// and the returned file_url is stored on the shape — so the document stays light
// (no base64 blobs in the autosaved JSON) and the image is shareable/exportable.
// Images are ordinary shapes (type 'image'): selectable, movable, resizable.

import { FileUploadHandler } from 'frappe-ui'

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml'
const MAX_W = 420 // cap the placed width so a big photo doesn't fill the canvas

export function useImageInsert(store) {
  const handler = new FileUploadHandler()

  // Open the OS file picker and insert the chosen image.
  function pick() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]
      if (file) insert(file)
    })
    input.click()
  }

  // Upload `file` and place it; `at` (canvas-unit point) centers it, else canvas center.
  async function insert(file, at) {
    if (!file.type.startsWith('image/')) return null
    const fileDoc = await handler.upload(file, { private: false })
    const url = fileDoc?.file_url || fileDoc?.message?.file_url
    if (!url) return null
    const size = await naturalSize(url)
    return place(url, size, at)
  }

  function place(src, size, at) {
    const scale = Math.min(1, MAX_W / size.w)
    const w = Math.round(size.w * scale)
    const h = Math.round(size.h * scale)
    const canvas = store.state.canvas
    const cx = at?.x ?? (canvas.width || 1280) / 2
    const cy = at?.y ?? (canvas.height || 720) / 2
    const id = store.addShape({ type: 'image', src, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h })
    store.select(id)
    return id
  }

  return { pick, insert }
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
