// Throttled SVG->raster thumbnail on save (spec §11.2/§11.4), and a pure
// document->SVG-markup builder reused by home tiles for a live preview.
// Building markup is cheap; rasterizing to PNG is throttled to <= once / 30s.

import { themeVarStyle, findThemePreset } from '@/diagram/theme.js'
import { parseDiagramDocument } from '@/diagram/schema.js'

const THROTTLE_MS = 30000

// Geometry helpers mirror ShapeView/ConnectorView so previews match the canvas.
function trianglePoints(s) {
  return `${s.x + s.w / 2},${s.y} ${s.x + s.w},${s.y + s.h} ${s.x},${s.y + s.h}`
}

function diamondPoints(s) {
  const cx = s.x + s.w / 2
  const cy = s.y + s.h / 2
  return `${cx},${s.y} ${s.x + s.w},${cy} ${cx},${s.y + s.h} ${s.x},${cy}`
}

function shapeBody(s) {
  const stroke = `stroke="${s.border?.color || 'none'}" stroke-width="${s.border?.width || 0}"`
  const fill = `fill="${s.fill || 'none'}" fill-opacity="${s.opacity ?? 1}"`
  if (s.type === 'ellipse') {
    return `<ellipse cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" ${fill} ${stroke}/>`
  }
  if (s.type === 'triangle') return `<polygon points="${trianglePoints(s)}" ${fill} ${stroke}/>`
  if (s.type === 'diamond') return `<polygon points="${diamondPoints(s)}" ${fill} ${stroke}/>`
  return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="8" ${fill} ${stroke}/>`
}

function shapeText(s) {
  if (!s.text?.content) return ''
  const st = s.text.style || {}
  const cx = s.x + s.w / 2
  const cy = s.y + s.h / 2
  return (
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"` +
    ` fill="${st.color || '#171717'}" font-size="${st.size || 16}"` +
    ` font-weight="${st.bold ? 700 : 500}" font-family="Inter, sans-serif">` +
    `${escapeText(s.text.content)}</text>`
  )
}

function connectorBody(c, shapes) {
  const a = endpointPoint(c.from, shapes)
  const b = endpointPoint(c.to, shapes)
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${c.style?.color || '#7C7C7C'}" stroke-width="${c.style?.width || 2.2}" stroke-linecap="round"/>`
}

// Resolve an endpoint to a point. Attached ends use the shape centre as a cheap
// approximation (full anchor math is overkill for a 200x100 preview).
function endpointPoint(endpoint, shapes) {
  if (endpoint?.shapeId) {
    const shape = shapes.find((s) => s.id === endpoint.shapeId)
    if (shape) return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Build a complete inline <svg> string for a parsed diagram document. The
// viewBox is the canvas so shapes sit in their true logical positions, and
// preserveAspectRatio fits the preview inside the tile.
export function documentToSvg(rawDocument, options = {}) {
  const doc = parseDiagramDocument(rawDocument)
  const { width, height } = doc.canvas
  const vars = themeVarStyle(doc.themePreset || 'ocean')
  const styleAttr = Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
  const connectors = (doc.connectors || []).map((c) => connectorBody(c, doc.shapes || [])).join('')
  const shapes = (doc.shapes || [])
    .slice()
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    .map((s) => shapeBody(s) + shapeText(s))
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"` +
    ` preserveAspectRatio="${options.fit || 'xMidYMid meet'}" style="${styleAttr}">` +
    `${connectors}${shapes}</svg>`
  )
}

// True when a parsed document has nothing to preview.
export function isDocumentEmpty(rawDocument) {
  const doc = parseDiagramDocument(rawDocument)
  return (doc.shapes || []).length === 0 && (doc.connectors || []).length === 0
}

// Rasterize a store's current document to a PNG data URL, throttled per store.
export function useThumbnail(store, diagramResource) {
  let lastRunAt = 0

  async function generate() {
    const now = Date.now()
    if (now - lastRunAt < THROTTLE_MS) return null
    lastRunAt = now
    const dataUrl = await rasterize(documentToSvg(store.getDocument()))
    if (dataUrl && diagramResource?.setValue) {
      diagramResource.setValue.submit({ thumbnail: dataUrl })
    }
    return dataUrl
  }

  return { generate }
}

// SVG string -> PNG data URL via an offscreen canvas. Returns null on failure so
// callers fall back to a neutral placeholder (never a broken image, spec §2).
function rasterize(svgMarkup, scale = 1) {
  return new Promise((resolve) => {
    const image = new Image()
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width * scale || 400
      canvas.height = image.height * scale || 200
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

export { findThemePreset }
