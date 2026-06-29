// Client-side export to PNG/JPEG/SVG/PDF (spec §10). Captures the CANVAS BOUNDS
// (not the viewport) by serializing the diagram document to a standalone <svg>
// via documentToSvg() — which renders shapes + connectors only, excluding the
// grid, selection handles, and viewport transform. PNG/JPEG rasterize that SVG
// through an offscreen canvas; SVG/PDF preserve transparency. PDF prefers the
// jspdf dependency when present, else falls back to a print window.

import { toast } from 'frappe-ui'
import { documentToSvg } from '@/composables/useThumbnail.js'
import { axisAlignedBBox } from '@/diagram/geometry.js'
import { outlineMarkdown } from '@/diagram/convert.js'

// "No color" canvas (background === null) exports transparent for PNG/SVG/PDF;
// JPEG has no alpha so it gets a white backdrop instead (spec §10).
const JPEG_FALLBACK_BACKGROUND = '#FFFFFF'

// `getTitle` is an optional accessor (e.g. () => diagram.doc?.title) so exports
// use the diagram's title for the file name; defaults to "diagram" when absent.
export function useExport(store, getTitle) {
  const fileName = () => sanitizeFileName((getTitle && getTitle()) || 'diagram')

  return {
    exportPng: (scale = 2) => guard(() => exportRaster(store, 'png', scale, fileName(), '#FFFFFF')),
    exportPngTransparent: () => guard(() => exportRaster(store, 'png', 2, fileName(), 'transparent')),
    exportPngWhite: () => guard(() => exportRaster(store, 'png', 2, fileName(), '#FFFFFF')),
    exportJpeg: () => guard(() => exportRaster(store, 'jpeg', 1, fileName())),
    exportSvg: () => guard(() => exportSvgFile(store, fileName())),
    exportPdf: () => guard(() => exportPdfFile(store, fileName())),
    // Selection-only exports at a chosen pixel scale (spec 12.2).
    exportSelectionPng: (scale = 2) => guard(() => exportSelection(store, 'png', scale, fileName(), '#FFFFFF')),
    exportSelectionSvg: () => guard(() => exportSelection(store, 'svg', 1, fileName())),
    exportOutline: () => guard(() => exportOutlineFile(store, fileName())),
    hasSelection: () => selectedShapes(store).length > 0,
    copyImage: () => guard(() => copyImage(store)),
    printDiagram: () => guard(() => printDiagram(store)),
    store,
  }
}

// ----- export selection (spec 12.2) ------------------------------------------

function selectedShapes(store) {
  const sel = new Set(store.state.selection)
  return (store.state.shapes || []).filter((s) => sel.has(s.id) && !s.hidden)
}

// Build a block document holding only the selected shapes + connectors, plus the
// tight bounding box that frames them (so the export is cropped to the selection,
// not the whole canvas). Connectors are included when explicitly selected.
function selectionDocAndBounds(store) {
  const sel = new Set(store.state.selection)
  const doc = store.getDocument()
  const shapes = (doc.shapes || []).filter((s) => sel.has(s.id) && !s.hidden)
  const connectors = (doc.connectors || []).filter((c) => sel.has(c.id))
  const filtered = {
    ...doc,
    diagramType: 'block',
    shapes,
    connectors,
    mindmap: null,
    flowchart: null,
    whiteboard: null,
  }
  return { filtered, bounds: selectionBounds(shapes, connectors, doc.shapes || []) }
}

function selectionBounds(shapes, connectors, allShapes) {
  const xs = []
  const ys = []
  for (const shape of shapes) {
    const box = axisAlignedBBox(shape)
    xs.push(box.x, box.x + box.w)
    ys.push(box.y, box.y + box.h)
  }
  for (const connector of connectors) {
    for (const point of [endpointXY(connector.from, allShapes), endpointXY(connector.to, allShapes)]) {
      xs.push(point.x)
      ys.push(point.y)
    }
  }
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 }
  const pad = 16
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX - pad, y: minY - pad, w: Math.max(...xs) - minX + pad * 2, h: Math.max(...ys) - minY + pad * 2 }
}

function endpointXY(endpoint, allShapes) {
  if (endpoint?.shapeId) {
    const shape = allShapes.find((s) => s.id === endpoint.shapeId)
    if (shape) return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

// Export just the selection (PNG at `scale`, or SVG). No-op with a hint when the
// selection has no shapes, so the menu item never produces an empty file.
async function exportSelection(store, format, scale, name, bg) {
  const { filtered, bounds } = selectionDocAndBounds(store)
  if (!bounds.w || !bounds.h) {
    toast.info('Select one or more objects to export')
    return
  }
  const viewBox = `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`
  let markup = withExplicitSize(documentToSvg(filtered, { viewBox }), bounds.w, bounds.h)
  if (format === 'svg') {
    downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), `${name}-selection.svg`)
    return
  }
  if (bg) markup = insertBackgroundRect(markup, bg, { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h })
  const dataUrl = await rasterizeSvg(markup, bounds.w * scale, bounds.h * scale, 'image/png')
  downloadDataUrl(dataUrl, `${name}-selection.png`)
}

// Print = canvas content only (spec §4.4): open the export SVG in a clean print
// window so chrome (toolbar + palettes) is never included.
function printDiagram(store) {
  const { width, height } = canvasSize(store)
  exportPdfWithPrintWindow(buildSvg(store), width, height)
}

// Run an export, surfacing failures as a retry-able toast (spec §11.5).
async function guard(run) {
  try {
    await run()
  } catch (error) {
    console.error('Export failed', error)
    toast.error('Export failed. Please try again.')
  }
}

function canvasSize(store) {
  return { width: store.state.canvas.width, height: store.state.canvas.height }
}

// Build the export SVG markup from the current document. documentToSvg() emits a
// viewBox over the canvas bounds (grid excluded); we add explicit width/height so
// the SVG has deterministic intrinsic dimensions when rasterized. Optionally
// paints a background rect (for JPEG, or a user-chosen canvas background).
function buildSvg(store, background) {
  const document = store.getDocument()
  const { width, height } = canvasSize(store)
  let markup = withExplicitSize(documentToSvg(document), width, height)
  // background: undefined → use the canvas background; 'transparent' → force no
  // backdrop; a hex string → force that fill (e.g. white for JPEG/clipboard).
  const fill = background === 'transparent' ? null : background || document.canvas.background
  if (fill) markup = insertBackgroundRect(markup, fill, { width, height })
  return markup
}

// Add width/height to the opening <svg> tag (documentToSvg omits them).
function withExplicitSize(markup, width, height) {
  return markup.replace(/<svg /, `<svg width="${width}" height="${height}" `)
}

// Splice an opaque background rect just after the opening <svg> tag so it sits
// beneath every shape and connector. x/y default to 0 (full-canvas export); a
// cropped selection export passes its bbox origin so the rect covers the crop.
function insertBackgroundRect(markup, fill, { x = 0, y = 0, width, height }) {
  const rect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`
  return markup.replace(/(<svg[^>]*>)/, `$1${rect}`)
}

async function exportSvgFile(store, name) {
  const markup = buildSvg(store)
  downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), `${name}.svg`)
}

// Markdown outline of the diagram's content (spec 13.5).
async function exportOutlineFile(store, name) {
  const md = outlineMarkdown(store.getDocument())
  downloadBlob(new Blob([md], { type: 'text/markdown' }), `${name}.md`)
}

// PNG/JPEG: rasterize the SVG via an offscreen canvas at the requested scale.
// `bg` overrides the backdrop (undefined → canvas bg; 'transparent'; or a hex).
async function exportRaster(store, format, scale, name, bg) {
  const background = bg ?? (format === 'jpeg' ? JPEG_FALLBACK_BACKGROUND : undefined)
  const markup = buildSvg(store, background)
  const { width, height } = canvasSize(store)
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const dataUrl = await rasterizeSvg(markup, width * scale, height * scale, mime)
  downloadDataUrl(dataUrl, `${name}.${format === 'jpeg' ? 'jpg' : 'png'}`)
}

// Copy the diagram to the OS clipboard as a PNG (spec 12.3). Uses a white
// backdrop (clipboard images shouldn't be transparent) and the async Clipboard
// API, which needs the click gesture this runs inside.
async function copyImage(store) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser')
  }
  const { width, height } = canvasSize(store)
  const markup = buildSvg(store, '#FFFFFF')
  const blob = await rasterizeSvgToBlob(markup, width * 2, height * 2, 'image/png')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  toast.success('Copied image to clipboard')
}

// Like rasterizeSvg but resolves a Blob (for the clipboard / programmatic use).
function rasterizeSvgToBlob(markup, pixelWidth, pixelHeight, mime) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(pixelWidth))
      canvas.height = Math.max(1, Math.round(pixelHeight))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not rasterize'))), mime)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not rasterize the diagram'))
    }
    image.src = url
  })
}

// Draw the SVG into a sized canvas and read it back as a data URL.
function rasterizeSvg(markup, pixelWidth, pixelHeight, mime) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(pixelWidth))
      canvas.height = Math.max(1, Math.round(pixelHeight))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL(mime, 0.95))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not rasterize the diagram'))
    }
    image.src = url
  })
}

// PDF: prefer jspdf (listed in newDeps, loaded defensively) for a real vector
// page sized to the canvas; otherwise fall back to a print window the user can
// "Save as PDF" from. Transparency is preserved either way.
async function exportPdfFile(store, name) {
  const { width, height } = canvasSize(store)
  const jsPdf = await loadJsPdf()
  if (jsPdf) {
    await exportPdfWithJsPdf(store, jsPdf, width, height, name)
    return
  }
  exportPdfWithPrintWindow(buildSvg(store), width, height)
}

async function exportPdfWithJsPdf(store, jsPdf, width, height, name) {
  const markup = buildSvg(store)
  const dataUrl = await rasterizeSvg(markup, width * 2, height * 2, 'image/png')
  const orientation = width >= height ? 'landscape' : 'portrait'
  const pdf = new jsPdf({ orientation, unit: 'px', format: [width, height] })
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)
  pdf.save(`${name}.pdf`)
}

// Dynamically import jspdf without failing the build when it isn't installed.
async function loadJsPdf() {
  try {
    const module = await import('jspdf')
    return module.jsPDF || module.default
  } catch (error) {
    return null
  }
}

// Print-window fallback: open the SVG full-bleed and trigger the browser print
// dialog, where the user can choose "Save as PDF".
function exportPdfWithPrintWindow(markup, width, height) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Pop-up blocked; allow pop-ups to export PDF')
  printWindow.document.write(printDocument(markup, width, height))
  printWindow.document.close()
  printWindow.focus()
  // The SVG is inline, so the document is ready once written; give the browser a
  // tick to lay it out, then print. (Listening for 'load' can miss when it has
  // already fired on a written document.)
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 250)
}

function printDocument(markup, width, height) {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>Diagram</title>' +
    `<style>@page{size:${width}px ${height}px;margin:0}` +
    'html,body{margin:0;padding:0}svg{display:block;width:100%;height:auto}</style>' +
    `</head><body>${markup}</body></html>`
  )
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, fileName)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sanitizeFileName(value) {
  return String(value).trim().replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram'
}
