// Throttled SVG->raster thumbnail on save (spec §11.2/§11.4), and a pure
// document->SVG-markup builder reused by home tiles for a live preview.
// Building markup is cheap; rasterizing to PNG is throttled to <= once / 30s.

import { createResource } from 'frappe-ui'
import { themeVarStyle, findThemePreset, primaryTriad } from '@/diagram/theme.js'
import { parseDiagramDocument, isUnifiedDocument } from '@/diagram/schema.js'
import { layoutMindMap, branchPath } from '@/diagram/mindmapLayout.js'
import { resolveNodeColor, nodeFill, readableInk } from '@/diagram/mindmapColors.js'
import { isRoot } from '@/diagram/mindmapModel.js'
import { nodeSize as flowchartNodeSize } from '@/diagram/flowchartModel.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'
import { routeEdge, routeOffsets, flowchartContentBounds } from '@/diagram/flowchartLayout.js'
import { whiteboardContentBounds } from '@/diagram/whiteboardLayout.js'
import {
  stickyLines,
  STICKY_FONT_SIZE,
  STICKY_LINE_HEIGHT,
  STICKY_PAD_X,
  STICKY_PAD_Y,
} from '@/diagram/stickyText.js'
import { unionBounds } from '@/diagram/geometry.js'
import {
  whiteboardObjectsInZOrder,
  tableRows,
  tableCols,
  cellSpanBox,
  isCoveredCell,
  tableCellRuns,
} from '@/diagram/whiteboardModel.js'
import { resolveMark } from '@/diagram/richText.js'
import { pointsToPath, smoothPath } from '@/diagram/svgPath.js'
import { polygonPointsString } from '@/diagram/polygon.js'
import { shapeCornerRadius, SHARP_CORNER_RADIUS } from '@/diagram/shapeGeometry.js'
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

// Geometry as well as colour: `s.x` is a persisted value, and `s.x + s.w / 2` on a
// string concatenates rather than adds, so an unchecked coordinate reaches the
// attribute intact. box() normalises all four before anything derives from them.
function box(s) {
  return { x: num(s.x), y: num(s.y), w: num(s.w), h: num(s.h) }
}

function shapeBody(s) {
  // Whimsical mind-map text node (#125): no box — the centred label (shapeText)
  // carries it, matching the on-canvas look. Shaped nodes fall through to a rect.
  if (s.role === 'mindmap-node' && s.mindmap?.shaped === false) return ''
  const { x, y, w, h } = box(s)
  const stroke = `stroke="${safeColor(s.border?.color)}" stroke-width="${num(s.border?.width)}"`
  const fill = `fill="${safeColor(s.fill)}" fill-opacity="${num(s.opacity, 1)}"`
  // Migrated flowchart node (free-floating #122): draw its exact glyph via the
  // shared nodeShape geometry, matching ShapeView on the live canvas, so export
  // and thumbnails don't degrade a stadium / parallelogram / document to a rect.
  if (s.flowchart?.nodeType) return flowchartGlyphBody(s, fill, stroke)
  if (s.type === 'ellipse') {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${fill} ${stroke}/>`
  }
  if (s.type === 'triangle') return `<polygon points="${trianglePoints({ x, y, w, h })}" ${fill} ${stroke}/>`
  if (s.type === 'diamond') return `<polygon points="${diamondPoints({ x, y, w, h })}" ${fill} ${stroke}/>`
  // Freely-drawn polygon (#139): normalised points scaled onto the box, matching
  // ShapeView. polygonPointsString coerces every component to a number, so a
  // crafted point can't escape the attribute here.
  if (s.type === 'polygon') {
    const pts = polygonPointsString({ x, y, w, h, points: s.points })
    if (pts) return `<polygon points="${pts}" ${fill} ${stroke}/>`
  }
  // The radius used to be hardcoded to 8 here, so every box left the canvas less
  // rounded than it was drawn — a rounded rectangle renders at 20 on the canvas but
  // exported at 8, in all four surfaces this one function feeds (PNG, PDF export,
  // the home tile, the minimap).
  // Resolve it through the helper the live canvas uses (#411) instead of restating
  // the rule; num() as well, because nothing in this file reaches an attribute
  // unguarded, so the line audits on its own.
  const rx = num(shapeCornerRadius(s.type, s.cornerRadius), SHARP_CORNER_RADIUS)
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${fill} ${stroke}/>`
}

// nodeShape geometry is local to the node box (0,0 at top-left), so the glyph is
// drawn inside a translate group — the same approach ShapeView uses.
function flowchartGlyphBody(s, fill, stroke) {
  const { x, y, w, h } = box(s)
  const glyph = nodeShape(s.flowchart.nodeType, w, h)
  let inner
  if (glyph.kind === 'ellipse') {
    inner = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${fill} ${stroke}/>`
  } else if (glyph.kind === 'polygon') {
    inner = `<polygon points="${glyph.points}" ${fill} ${stroke}/>`
  } else if (glyph.kind === 'path') {
    inner = `<path d="${glyph.d}" ${fill} ${stroke}/>`
  } else {
    inner = `<rect x="0" y="0" width="${w}" height="${h}" rx="${num(glyph.rx, 8)}" ${fill} ${stroke}/>`
  }
  return `<g transform="translate(${x} ${y})">${inner}</g>`
}

function shapeText(s) {
  if (!s.text?.content) return ''
  const st = s.text.style || {}
  const { x, y, w, h } = box(s)
  const cx = x + w / 2
  const cy = y + h / 2
  return (
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"` +
    ` fill="${safeColor(st.color, '#171717')}" font-size="${num(st.size || 16, 16)}"` +
    ` font-weight="${st.bold ? 700 : 500}" font-family="Inter, sans-serif">` +
    `${escapeText(s.text.content)}</text>`
  )
}

function connectorBody(c, shapes) {
  const a = endpointPoint(c.from, shapes)
  const b = endpointPoint(c.to, shapes)
  const stroke = `stroke="${safeColor(c.style?.color, '#7C7C7C')}" stroke-width="${num(c.style?.width || 2.2, 2.2)}"`
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${stroke} stroke-linecap="round"/>`
}

// Resolve an endpoint to a point. Attached ends use the shape centre as a cheap
// approximation (full anchor math is overkill for a 200x100 preview).
function endpointPoint(endpoint, shapes) {
  if (endpoint?.shapeId) {
    const shape = shapes.find((s) => s.id === endpoint.shapeId)
    if (shape) {
      const { x, y, w, h } = box(shape)
      return { x: x + w / 2, y: y + h / 2 }
    }
  }
  return { x: num(endpoint?.x), y: num(endpoint?.y) }
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Colours come out of the persisted document, and this markup is injected into the
// DOM to preview a diagram — including diagrams SHARED by someone else. escapeText is
// for text nodes and does not neutralise quotes, so a crafted colour could close the
// attribute it sits in and add an event handler to the element. Allow only real colour
// syntax and fall back otherwise. EVERY persisted value reaching an attribute in this
// file has to pass through safeColor() or num() — a single raw one reopens the hole.
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s/]+\)|hsla?\([0-9.,%\s/deg]+\)|[a-z]{3,20})$/i

export function safeColor(value, fallback = 'none') {
  const raw = String(value ?? '').trim()
  return COLOR_RE.test(raw) ? raw : fallback
}

// Numbers likewise: geometry attributes must never carry arbitrary text.
export function num(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
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
  // Sections render behind everything, in every type.
  const body = sectionsSvg(doc) + rendered.body
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxAttr(viewBox)}"` +
    ` preserveAspectRatio="${options.fit || 'xMidYMid meet'}" style="${styleAttr}">` +
    `${body}</svg>`
  )
}

// Every per-type viewBox is built from the document's own coordinates (canvas size,
// content bounds derived from node positions), so it is guarded here rather than in
// each branch — four numbers, nothing else, whatever the document holds.
function viewBoxAttr(viewBox) {
  const parts = String(viewBox).trim().split(/\s+/).slice(0, 4).map((v) => num(v))
  return parts.length === 4 ? parts.join(' ') : '0 0 1 1'
}

// Named sections/frames (document-level) drawn behind all content, any type.
function sectionsSvg(doc) {
  return (doc.sections || [])
    .map((s) => {
      const color = safeColor(s.color, '#6E56CF')
      const { x, y, w, h } = box(s)
      const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="rgba(110,86,207,0.035)" stroke="${color}" stroke-width="1.5"/>`
      const bar = `<rect x="${x}" y="${y}" width="${w}" height="26" rx="6" fill="${color}"/>`
      const title = s.title
        ? `<text x="${x + 8}" y="${y + 17}" fill="#FFFFFF" font-size="12" font-weight="600" font-family="Inter, sans-serif">${escapeText(s.title)}</text>`
        : ''
      return rect + bar + title
    })
    .join('')
}

// Per-type body + viewBox. Block (and any unknown type) renders the shared
// shapes/connectors over the canvas rect; the layered types render their own
// geometry over their content bbox.
function renderBody(doc) {
  if (isUnifiedDocument(doc)) return unifiedBody(doc)
  if (doc.diagramType === 'mindmap' && doc.mindmap) return mindmapBody(doc)
  if (doc.diagramType === 'flowchart' && doc.flowchart) return flowchartBody(doc)
  if (doc.diagramType === 'whiteboard' && doc.whiteboard) return whiteboardBody(doc)
  return blockBody(doc)
}

// The unified canvas holds every layer at once, so its export has to compose them
// the way DiagramCanvas draws them — block shapes and whiteboard ink in absolute
// canvas coordinates, then the mind-map and flowchart frames translated to their
// origins.
//
// Without this a unified document fell through to blockBody(), so export (PNG/PDF),
// the saved thumbnail and the home/trash tile previews all showed ONLY block shapes:
// whiteboard ink, sticky notes and both frames vanished, and the canvas-sized viewBox
// would have cropped the frames even if they had been drawn. Every new diagram is a
// unified document, so that was the common case, not an edge case.
function unifiedBody(doc) {
  // whiteboardBody already emits the shared block layer (connectors + shapes) AND
  // the whiteboard ink over it, which is exactly the absolute-coordinate layer here.
  const base = doc.whiteboard ? whiteboardBody(doc) : blockBody(doc)
  const boxes = [parseViewBox(base.viewBox)]
  let body = base.body

  // Origins are persisted values reaching an SVG attribute, so they go through num()
  // for the same reason colours go through safeColor(): this markup is injected into a
  // viewer's DOM, and the document may have been authored by someone else.
  const mindmap = doc.mindmap
  if (mindmap?.nodes?.length) {
    const ox = num(mindmap.origin?.x)
    const oy = num(mindmap.origin?.y)
    const { bbox } = layoutMindMap(mindmap)
    body += `<g transform="translate(${ox} ${oy})">${mindmapBody(doc).body}</g>`
    boxes.push({ x: ox + bbox.x, y: oy + bbox.y, w: bbox.w, h: bbox.h })
  }

  const flowchart = doc.flowchart
  let labelled = false
  if (flowchart?.nodes?.length) {
    const ox = num(flowchart.origin?.x)
    const oy = num(flowchart.origin?.y)
    const bounds = flowchartContentBounds(flowchart)
    body += `<g transform="translate(${ox} ${oy})">${flowchartBody(doc).body}</g>`
    boxes.push({ x: ox + bounds.x, y: oy + bounds.y, w: bounds.w, h: bounds.h })
    labelled = (flowchart.edges || []).some((edge) => edge.label)
  }

  // flowchartContentBounds covers nodes, not the labels drawn beside edge routes, so
  // allow more margin when any edge carries one rather than cropping it. Measuring
  // label text properly would need font metrics — not worth it until someone hits it.
  return { viewBox: unionViewBox(boxes, labelled ? 96 : 40), body }
}

function parseViewBox(viewBox) {
  const [x, y, w, h] = viewBox.split(' ').map(Number)
  return { x, y, w, h }
}

// Smallest box covering every layer that has content, with a little breathing room so
// frame edges aren't flush against the crop.
function unionViewBox(boxes, pad = 40) {
  const bounds = unionBounds(boxes.filter((b) => b && b.w > 0 && b.h > 0))
  if (!bounds) return '0 0 1 1'
  return `${bounds.x - pad} ${bounds.y - pad} ${bounds.w + pad * 2} ${bounds.h + pad * 2}`
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
  // bbox is anchored on the FIRST tree, so a map holding several (#48) can reach
  // above/left of it — the viewBox has to start at the bbox, not at zero.
  return { viewBox: `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`, body: links + nodes }
}

// The node's background in its chosen shape (mirrors MindMapNodeLayer). fill and
// color derive from node.color, so they are persisted values like any other.
function mindmapNodeShape(node, nodeBox, fill, color, sw) {
  const attrs = `fill="${safeColor(fill)}" stroke="${safeColor(color)}" stroke-width="${num(sw, 1.8)}"`
  const { x, y, w, h } = box(nodeBox)
  if (node.shape === 'ellipse') {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`
  }
  if (node.shape === 'diamond') {
    return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${attrs}/>`
  }
  if (node.shape === 'hexagon') {
    const i = Math.min(w * 0.16, h / 2)
    return `<polygon points="${x + i},${y} ${x + w - i},${y} ${x + w},${y + h / 2} ${x + w - i},${y + h} ${x + i},${y + h} ${x},${y + h / 2}" ${attrs}/>`
  }
  const rx = node.shape === 'rounded' ? 12 : node.shape === 'rectangle' ? 4 : h / 2
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${attrs}/>`
}

function mindmapLink(model, node, positions, preset) {
  const color = safeColor(resolveNodeColor(model, node, preset))
  return `<path d="${branchPath(positions[node.parentId], positions[node.id])}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
}

function mindmapNode(model, node, nodeBox, preset) {
  const color = resolveNodeColor(model, node, preset)
  const fill = node.color ? nodeFill(node.color) : isRoot(model, node.id) ? '#ECE7FE' : nodeFill(color)
  const ink = safeColor(readableInk(fill), '#171717')
  const strokeWidth = isRoot(model, node.id) ? 2.5 : 1.8
  const fontSize = num(node.fontSize || (isRoot(model, node.id) ? 17 : 14), 14)
  const fontWeight = node.bold || isRoot(model, node.id) ? 700 : 500
  const rect = mindmapNodeShape(node, nodeBox, fill, color, strokeWidth)
  const { x, y, w, h } = box(nodeBox)
  const label = (node.emoji ? node.emoji + '  ' : '') + (node.text || '')
  const text = label
    ? `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="Inter, sans-serif">${escapeText(label)}</text>`
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
  const path = `<path d="${pointsToPath(route.points)}" fill="none" stroke="#7C7C7C" stroke-width="2"${markerEnd}/>`
  if (!edge.label) return path
  const half = edge.label.length * 4 + 8
  // The route is derived from node.x/node.y, which are persisted values, so the
  // label anchor is guarded like any other coordinate in this file.
  const lx = num(route.labelPoint.x)
  const ly = num(route.labelPoint.y)
  const pill = `<rect x="${lx - half}" y="${ly - 10}" width="${edge.label.length * 8 + 16}" height="20" rx="6" fill="#FFFFFF" stroke="#E2E2E2"/>`
  const label = `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="#525252" font-family="Inter, sans-serif">${escapeText(edge.label)}</text>`
  return path + pill + label
}

function flowchartNode(node, triad) {
  const size = flowchartNodeSize(node)
  const shape = nodeShape(node.nodeType, size.w, size.h)
  // Mirror the live layer: 'none' is the explicit "No fill" sentinel.
  const fill = node.fill === 'none' ? 'transparent' : safeColor(node.fill, triad.fill)
  const stroke = safeColor(node.border, triad.stroke)
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`
  const nx = num(node.x)
  const ny = num(node.y)
  let body
  if (shape.kind === 'ellipse') {
    body = `<ellipse cx="${nx + size.w / 2}" cy="${ny + size.h / 2}" rx="${size.w / 2}" ry="${size.h / 2}" ${attrs}/>`
  } else if (shape.kind === 'polygon') {
    body = `<polygon points="${shiftPolygon(shape.points, nx, ny)}" ${attrs}/>`
  } else {
    body = `<rect x="${nx}" y="${ny}" width="${size.w}" height="${size.h}" rx="${shape.rx}" ${attrs}/>`
  }
  const text =
    node.nodeType !== 'connector' && node.text
      ? `<text x="${nx + size.w / 2}" y="${ny + size.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="${triad.ink}" font-family="Inter, sans-serif">${escapeText(node.text)}</text>`
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
  // Shapes and board objects share one stacking scale (#27), so the export paints
  // them in a single zIndex-ordered pass — the same order the canvas draws. Lines
  // and tables used to be omitted entirely here, so a board holding either
  // exported and thumbnailed as though that content did not exist.
  const objects = [
    ...(doc.shapes || []).filter((s) => !s.hidden).map((s) => ({ kind: 'shape', object: s })),
    ...whiteboardObjectsInZOrder(model),
  ]
    .sort((a, b) => (a.object.zIndex || 0) - (b.object.zIndex || 0))
    .map(({ kind, object }) => WB_BODY[kind](object))
    .join('')
  return {
    viewBox: `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,
    body: connectors + objects,
  }
}

const WB_BODY = {
  shape: (s) => shapeBody(s) + shapeText(s),
  stroke: whiteboardStroke,
  line: whiteboardLine,
  table: whiteboardTable,
  sticky: whiteboardSticky,
}

// Curved through the same builder the canvas uses (#426). A stroke drawn as a
// smooth line on screen and exported as a polyline is the divergence #409 is
// about, one function further down the same file.
function whiteboardStroke(stroke) {
  if (!stroke.points || stroke.points.length < 2) return ''
  const opacity = stroke.kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
  const linecap = stroke.kind === 'highlighter' ? 'butt' : 'round'
  const color = safeColor(stroke.color, '#171717')
  return `<path d="${smoothPath(stroke.points)}" fill="none" stroke="${color}" stroke-width="${num(stroke.width, 2)}" stroke-opacity="${opacity}" stroke-linecap="${linecap}" stroke-linejoin="round"/>`
}

function whiteboardSticky(note) {
  const color = safeColor(note.color, '#FFE9A8')
  const ink = safeColor(contrastInk(color), '#171717')
  const { x, y, w, h } = box(note)
  const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`
  return rect + stickyText(note, { x, y, w, h }, ink)
}

// A note is multi-line plain text (#416), and SVG <text> neither wraps nor honours
// a newline — one <text> per note exported three typed lines as one long run that
// ran off the note. Each line gets its own <tspan>, hard breaks first and then the
// wrap the canvas applies, and lines past the bottom of the note are dropped rather
// than drawn over whatever sits below it.
function stickyText(note, { x, y, w, h }, ink) {
  if (!note.text) return ''
  const step = STICKY_FONT_SIZE * STICKY_LINE_HEIGHT
  const lines = stickyLines(note.text, w).slice(0, Math.max(0, Math.floor((h - STICKY_PAD_Y) / step)) || 1)
  const spans = lines
    .map((line, index) => `<tspan x="${x + STICKY_PAD_X / 2}" y="${y + STICKY_PAD_Y / 2 + step * (index + 0.8)}">${escapeText(line)}</tspan>`)
    .join('')
  return `<text fill="${ink}" font-size="${STICKY_FONT_SIZE}" font-family="Inter, sans-serif">${spans}</text>`
}


// Straight lines. Endpoint decorations (arrow / dot) are approximated by a dot at the
// decorated end: the export is a flat SVG with no marker defs for these, and a missing
// line reads far worse than a missing arrowhead.
function whiteboardLine(line) {
  const color = safeColor(line.color, '#171717')
  const width = num(line.width, 2)
  const [x1, y1, x2, y2] = [num(line.x1), num(line.y1), num(line.x2), num(line.y2)]
  const stroke = `stroke="${color}" stroke-width="${width}" stroke-linecap="round"`
  let out = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${stroke}/>`
  const cap = (x, y) => `<circle cx="${x}" cy="${y}" r="${width * 1.6}" fill="${color}"/>`
  if (line.start && line.start !== 'none') out += cap(x1, y1)
  if (line.end && line.end !== 'none') out += cap(x2, y2)
  return out
}


function whiteboardTable(table) {
  // Same geometry as the live canvas (WhiteboardTable): per-column/row sizes,
  // merged-cell spans and text alignment, so an export/thumbnail matches what's
  // on screen. Counts stay clamped (tableRows/tableCols), and cellW/cellH default
  // to sane numbers, so a malformed document can't blow the loop up.
  const rows = tableRows(table)
  const cols = tableCols(table)
  const safe = { ...table, cellW: num(table.cellW, 120), cellH: num(table.cellH, 40) }
  const color = safeColor(table.color, '#171717')
  const align = table.align || 'left'
  let out = ''
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (isCoveredCell(safe, r, c)) continue
      const box = cellSpanBox(safe, r, c)
      out += `<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.45"/>`
      const runs = tableCellRuns(safe, r, c)
      if (runs.length) {
        const ty = box.y + box.h / 2 + 5
        let tx = box.x + 8
        let anchor = ''
        if (align === 'center') {
          tx = box.x + box.w / 2
          anchor = ' text-anchor="middle"'
        } else if (align === 'right') {
          tx = box.x + box.w - 8
          anchor = ' text-anchor="end"'
        }
        // A tspan per run, so an export carries the same per-cell bold/italic/
        // underline the canvas shows (#344) — including the header row's bold,
        // which this path used to drop.
        const header = table.hasHeader === true && r === 0
        const spans = runs.map((run) => `<tspan${runAttributes(run, header)}>${escapeText(run.text)}</tspan>`).join('')
        out += `<text x="${num(tx)}" y="${num(ty)}"${anchor} fill="${color}" font-size="13" font-family="Inter, sans-serif">${spans}</text>`
      }
    }
  }
  return out
}

// The SVG attributes for one formatted run. A header cell bolds by default; an
// explicit mark on the run wins either way (matches WhiteboardTable).
function runAttributes(run, header) {
  let out = ` font-weight="${resolveMark(run, 'bold', header) ? 600 : 400}"`
  if (resolveMark(run, 'italic')) out += ' font-style="italic"'
  if (resolveMark(run, 'underline')) out += ' text-decoration="underline"'
  return out
}

// True when a parsed document has nothing to preview, accounting for every type's
// content (not just the shared shapes/connectors arrays).
export function isDocumentEmpty(rawDocument) {
  const doc = parseDiagramDocument(rawDocument)
  if ((doc.shapes || []).length || (doc.connectors || []).length || (doc.sections || []).length) return false
  if (doc.diagramType === 'mindmap' && doc.mindmap) {
    return (doc.mindmap.nodes || []).length <= 1
  }
  if (doc.diagramType === 'flowchart' && doc.flowchart) {
    return !(doc.flowchart.nodes || []).length && !(doc.flowchart.edges || []).length
  }
  if (doc.diagramType === 'whiteboard' && doc.whiteboard) return isWhiteboardBlank(doc.whiteboard)
  // The unified canvas had NO branch here, so any unified document without block
  // shapes was reported empty — a canvas holding only ink, or only a mind-map frame,
  // showed "nothing to preview". It is empty only when every layer is.
  if (isUnifiedDocument(doc)) {
    return (
      isWhiteboardBlank(doc.whiteboard) &&
      !(doc.mindmap?.nodes || []).length &&
      !(doc.flowchart?.nodes || []).length &&
      !(doc.flowchart?.edges || []).length
    )
  }
  return true
}

// Lines and tables count as content too; leaving them out reported a board holding
// only a table as blank.
function isWhiteboardBlank(model) {
  if (!model) return true
  return (
    !(model.strokes || []).length &&
    !(model.stickyNotes || []).length &&
    !(model.lines || []).length &&
    !(model.tables || []).length
  )
}

// Rasterize a store's current document to a PNG data URL, throttled per store,
// and persist it via the backend save_thumbnail method (which decodes the data
// URL into a private File and links it — spec §11.2/§11.4).
export function useThumbnail(store, diagramResource) {
  let lastRunAt = 0
  const saver = createResource({ url: 'draw.api.diagram.save_thumbnail' })

  async function generate({ force = false } = {}) {
    const now = Date.now()
    if (!force && now - lastRunAt < THROTTLE_MS) return null
    const name = diagramResource?.doc?.name
    if (!name) return null
    lastRunAt = now
    const document = store.getDocument()
    // An emptied diagram used to be rasterized to a blank white PNG, so Home had
    // to read every diagram's document to tell "blank" from "has a preview"
    // (#93, #223). Clear the stored thumbnail instead: with no raster, Home knows
    // the tile is blank without fetching anything.
    if (isDocumentEmpty(document)) {
      saver.submit({ name, thumbnail: '' })
      return null
    }
    const dataUrl = await rasterize(documentToSvg(document))
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
