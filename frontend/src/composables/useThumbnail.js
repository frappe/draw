// Throttled SVG->raster thumbnail on save (spec §11.2/§11.4), and a pure
// document->SVG-markup builder reused by home tiles for a live preview.
// Building markup is cheap; rasterizing to PNG is throttled to <= once / 30s.

import { createResource } from 'frappe-ui'
import { themeVarStyle, findThemePreset, primaryTriad } from '@/diagram/theme.js'
import { parseDiagramDocument } from '@/diagram/schema.js'
import { layoutMindMap, branchPath } from '@/diagram/mindmapLayout.js'
import { resolveNodeColor, nodeFill, readableInk } from '@/diagram/mindmapColors.js'
import { isRoot } from '@/diagram/mindmapModel.js'
import { nodeSize as flowchartNodeSize } from '@/diagram/flowchartModel.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'
import {
  routeEdge,
  routeOffsets,
  pointsToPath as flowchartPointsToPath,
  flowchartContentBounds,
} from '@/diagram/flowchartLayout.js'
import { whiteboardContentBounds } from '@/diagram/whiteboardLayout.js'
import { pointsToPath as strokePointsToPath } from '@/diagram/sketch.js'
import { contrastInk, HIGHLIGHTER_OPACITY } from '@/diagram/whiteboardColors.js'

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

// Build a complete inline <svg> string for a parsed diagram document. This is the
// single render-to-SVG path (spec Part G8) reused by export, the saved thumbnail
// and the home/trash/template tile previews. It dispatches on diagramType so
// every type renders the same geometry its on-canvas Layer draws, and frames the
// type's content bounding box (not the bounded canvas rect) so nothing is clipped.
export function documentToSvg(rawDocument, options = {}) {
  const doc = parseDiagramDocument(rawDocument)
  const vars = themeVarStyle(doc.themePreset || 'ocean')
  const styleAttr = Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
  const rendered = renderBody(doc)
  // A caller (e.g. export-selection, spec 12.2) can frame a tighter region than
  // the type's default content bounds by passing an explicit viewBox.
  const viewBox = options.viewBox || rendered.viewBox
  const body = rendered.body
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"` +
    ` preserveAspectRatio="${options.fit || 'xMidYMid meet'}" style="${styleAttr}">` +
    `${body}</svg>`
  )
}

// Per-type body + viewBox. Block (and any unknown type) renders the shared
// shapes/connectors over the canvas rect; the layered types render their own
// geometry over their content bbox.
function renderBody(doc) {
  if (doc.diagramType === 'mindmap' && doc.mindmap) return mindmapBody(doc)
  if (doc.diagramType === 'flowchart' && doc.flowchart) return flowchartBody(doc)
  if (doc.diagramType === 'whiteboard' && doc.whiteboard) return whiteboardBody(doc)
  return blockBody(doc)
}

function blockBody(doc) {
  const { width, height } = doc.canvas
  const connectors = (doc.connectors || []).map((c) => connectorBody(c, doc.shapes || [])).join('')
  const shapes = (doc.shapes || [])
    .filter((s) => !s.hidden)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    .map((s) => shapeBody(s) + shapeText(s))
    .join('')
  return { viewBox: `0 0 ${width} ${height}`, body: connectors + shapes }
}

// ----- mind map (mirrors MindMapNodeLayer) -----------------------------------

function mindmapBody(doc) {
  const model = doc.mindmap
  const { positions, bbox } = layoutMindMap(model)
  const preset = doc.themePreset || 'ocean'
  const visible = model.nodes.filter((node) => positions[node.id])
  const links = visible
    .filter((node) => node.parentId && positions[node.parentId])
    .map((node) => mindmapLink(model, node, positions, preset))
    .join('')
  const nodes = visible.map((node) => mindmapNode(model, node, positions[node.id], preset)).join('')
  return { viewBox: `0 0 ${bbox.w} ${bbox.h}`, body: links + nodes }
}

function mindmapLink(model, node, positions, preset) {
  const color = resolveNodeColor(model, node, preset)
  return `<path d="${branchPath(positions[node.parentId], positions[node.id])}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
}

function mindmapNode(model, node, box, preset) {
  const color = resolveNodeColor(model, node, preset)
  const fill = node.color ? nodeFill(node.color) : isRoot(model, node.id) ? '#ECE7FE' : nodeFill(color)
  const ink = readableInk(fill)
  const strokeWidth = isRoot(model, node.id) ? 2.5 : 1.8
  const fontSize = node.fontSize || (isRoot(model, node.id) ? 17 : 14)
  const fontWeight = isRoot(model, node.id) ? 700 : 500
  const rect = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.h / 2}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>`
  const text = node.text
    ? `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="Inter, sans-serif">${escapeText(node.text)}</text>`
    : ''
  return rect + text
}

// ----- flowchart (mirrors FlowchartLayer) ------------------------------------

function flowchartBody(doc) {
  const model = doc.flowchart
  const bounds = flowchartContentBounds(model)
  const triad = primaryTriad(doc.themePreset || 'ocean')
  const offsets = routeOffsets(model)
  const edges = model.edges
    .map((edge) => flowchartEdge(model, edge, offsets[edge.id] || 0))
    .filter(Boolean)
    .join('')
  const nodes = model.nodes.map((node) => flowchartNode(node, triad)).join('')
  const defs =
    '<defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#7C7C7C"/></marker></defs>'
  return {
    viewBox: `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,
    body: defs + edges + nodes,
  }
}

function flowchartEdge(model, edge, offsetIndex) {
  const route = routeEdge(model, edge, offsetIndex)
  if (!route) return ''
  const markerEnd = edge.arrowheads?.end ? ' marker-end="url(#fc-arrow)"' : ''
  const path = `<path d="${flowchartPointsToPath(route.points)}" fill="none" stroke="#7C7C7C" stroke-width="2"${markerEnd}/>`
  if (!edge.label) return path
  const half = edge.label.length * 4 + 8
  const pill = `<rect x="${route.midpoint.x - half}" y="${route.midpoint.y - 10}" width="${edge.label.length * 8 + 16}" height="20" rx="6" fill="#FFFFFF" stroke="#E2E2E2"/>`
  const label = `<text x="${route.midpoint.x}" y="${route.midpoint.y}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="#525252" font-family="Inter, sans-serif">${escapeText(edge.label)}</text>`
  return path + pill + label
}

function flowchartNode(node, triad) {
  const size = flowchartNodeSize(node)
  const shape = nodeShape(node.nodeType, size.w, size.h)
  const fill = node.fill || triad.fill
  const stroke = node.border || triad.stroke
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`
  let body
  if (shape.kind === 'ellipse') {
    body = `<ellipse cx="${node.x + size.w / 2}" cy="${node.y + size.h / 2}" rx="${size.w / 2}" ry="${size.h / 2}" ${attrs}/>`
  } else if (shape.kind === 'polygon') {
    body = `<polygon points="${shiftPolygon(shape.points, node.x, node.y)}" ${attrs}/>`
  } else {
    body = `<rect x="${node.x}" y="${node.y}" width="${size.w}" height="${size.h}" rx="${shape.rx}" ${attrs}/>`
  }
  const text =
    node.nodeType !== 'connector' && node.text
      ? `<text x="${node.x + size.w / 2}" y="${node.y + size.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="${triad.ink}" font-family="Inter, sans-serif">${escapeText(node.text)}</text>`
      : ''
  return body + text
}

// Translate a node-local polygon points string (origin at the node's top-left)
// into absolute canvas coordinates.
function shiftPolygon(points, dx, dy) {
  return points
    .split(' ')
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return `${x + dx},${y + dy}`
    })
    .join(' ')
}

// ----- whiteboard (mirrors WhiteboardLayer; never the laser trail) -----------

function whiteboardBody(doc) {
  const model = doc.whiteboard
  const bounds = whiteboardContentBounds(model, doc.shapes || [])
  const connectors = (doc.connectors || []).map((c) => connectorBody(c, doc.shapes || [])).join('')
  const shapes = (doc.shapes || [])
    .filter((s) => !s.hidden)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    .map((s) => shapeBody(s) + shapeText(s))
    .join('')
  const strokes = (model.strokes || []).map(whiteboardStroke).join('')
  const stickies = (model.stickyNotes || []).map(whiteboardSticky).join('')
  return {
    viewBox: `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,
    body: connectors + shapes + strokes + stickies,
  }
}

function whiteboardStroke(stroke) {
  if (!stroke.points || stroke.points.length < 2) return ''
  const opacity = stroke.kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
  const linecap = stroke.kind === 'highlighter' ? 'butt' : 'round'
  return `<path d="${strokePointsToPath(stroke.points)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-opacity="${opacity}" stroke-linecap="${linecap}" stroke-linejoin="round"/>`
}

function whiteboardSticky(note) {
  const ink = contrastInk(note.color)
  const rect = `<rect x="${note.x}" y="${note.y}" width="${note.w}" height="${note.h}" rx="4" fill="${note.color}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`
  const text = note.text
    ? `<text x="${note.x + 12}" y="${note.y + 24}" fill="${ink}" font-size="15" font-family="Inter, sans-serif">${escapeText(note.text)}</text>`
    : ''
  return rect + text
}

// True when a parsed document has nothing to preview, accounting for every type's
// content (not just the shared shapes/connectors arrays).
export function isDocumentEmpty(rawDocument) {
  const doc = parseDiagramDocument(rawDocument)
  if ((doc.shapes || []).length || (doc.connectors || []).length) return false
  if (doc.diagramType === 'mindmap' && doc.mindmap) {
    return (doc.mindmap.nodes || []).length <= 1
  }
  if (doc.diagramType === 'flowchart' && doc.flowchart) {
    return !(doc.flowchart.nodes || []).length && !(doc.flowchart.edges || []).length
  }
  if (doc.diagramType === 'whiteboard' && doc.whiteboard) {
    return !(doc.whiteboard.strokes || []).length && !(doc.whiteboard.stickyNotes || []).length
  }
  return true
}

// Rasterize a store's current document to a PNG data URL, throttled per store,
// and persist it via the backend save_thumbnail method (which decodes the data
// URL into a private File and links it — spec §11.2/§11.4).
export function useThumbnail(store, diagramResource) {
  let lastRunAt = 0
  const saver = createResource({ url: 'frappe_draw.api.diagram.save_thumbnail' })

  async function generate() {
    const now = Date.now()
    if (now - lastRunAt < THROTTLE_MS) return null
    const name = diagramResource?.doc?.name
    if (!name) return null
    lastRunAt = now
    const dataUrl = await rasterize(documentToSvg(store.getDocument()))
    if (dataUrl) saver.submit({ name, thumbnail: dataUrl })
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
