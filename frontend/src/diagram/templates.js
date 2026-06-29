// Built-in starter templates per diagram type (spec 10.1) — each returns a full
// diagram document (schema.js shape) ready to open. Whiteboard ships the workshop
// boards (retro / kanban / brainstorm — spec 15.6). Built with the same pure
// factories / model helpers the editor uses, so templates stay in sync with the
// real schema. User-saved templates (10.3) are layered on in useTemplates.js.

import { createDiagramDocument } from '@/diagram/schema.js'
import { createShape, createConnector } from '@/diagram/factories.js'
import { createMindMap, addChild } from '@/diagram/mindmapModel.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from '@/diagram/flowchartModel.js'
import { createWhiteboard, addStickyNote } from '@/diagram/whiteboardModel.js'

const PRESET = 'ocean'

function baseDoc(type) {
  return { ...createDiagramDocument(undefined, type), themePreset: PRESET }
}

function box(doc, type, x, y, w, h, text) {
  const shape = createShape({ type, x, y, w, h, zIndex: doc.shapes.length + 1 }, PRESET)
  if (text != null) shape.text.content = text
  doc.shapes.push(shape)
  return shape
}

function heading(doc, x, y, w, text) {
  const shape = createShape({ type: 'text', x, y, w, h: 36, zIndex: doc.shapes.length + 1 }, PRESET)
  shape.text = { ...shape.text, content: text, align: 'center', style: { ...shape.text.style, size: 18, bold: true } }
  doc.shapes.push(shape)
  return shape
}

function arrow(doc, from, to) {
  doc.connectors.push(
    createConnector({
      type: 'elbow',
      from: { shapeId: from.id, anchor: 'bottom' },
      to: { shapeId: to.id, anchor: 'top' },
      arrowheads: { start: 'none', end: 'arrow' },
    }),
  )
}

// ----- block ----------------------------------------------------------------

function blockLinear() {
  const doc = baseDoc('block')
  const a = box(doc, 'rounded', 320, 100, 200, 90, 'Start')
  const b = box(doc, 'rectangle', 320, 260, 200, 90, 'Do the work')
  const c = box(doc, 'rounded', 320, 420, 200, 90, 'Done')
  arrow(doc, a, b)
  arrow(doc, b, c)
  return doc
}

function blockHub() {
  const doc = baseDoc('block')
  const hub = box(doc, 'ellipse', 380, 280, 180, 110, 'Core')
  const spokes = [
    box(doc, 'rectangle', 120, 90, 170, 80, 'Idea A'),
    box(doc, 'rectangle', 660, 90, 170, 80, 'Idea B'),
    box(doc, 'rectangle', 120, 480, 170, 80, 'Idea C'),
    box(doc, 'rectangle', 660, 480, 170, 80, 'Idea D'),
  ]
  for (const s of spokes) {
    doc.connectors.push(createConnector({ type: 'straight', from: { shapeId: hub.id, anchor: 'right' }, to: { shapeId: s.id, anchor: 'left' }, arrowheads: { start: 'none', end: 'arrow' } }))
  }
  return doc
}

// ----- mind map --------------------------------------------------------------

function mindProject() {
  const doc = baseDoc('mindmap')
  const m = createMindMap('Project')
  for (const t of ['Goals', 'Scope', 'Timeline', 'Risks', 'Team']) addChild(m, m.rootId, t)
  doc.mindmap = m
  return doc
}

// ----- flowchart -------------------------------------------------------------

function flowApproval() {
  const doc = baseDoc('flowchart')
  const m = createFlowchart()
  const start = addFlowchartNode(m, 'terminator', 'Start', 360, 60)
  const submit = addFlowchartNode(m, 'process', 'Submit request', 350, 180)
  const review = addFlowchartNode(m, 'decision', 'Approved?', 360, 310)
  const done = addFlowchartNode(m, 'terminator', 'Done', 360, 480)
  const revise = addFlowchartNode(m, 'process', 'Revise', 600, 310)
  addFlowchartEdge(m, start, submit)
  addFlowchartEdge(m, submit, review)
  addFlowchartEdge(m, review, done, { label: 'Yes' })
  addFlowchartEdge(m, review, revise, { label: 'No' })
  addFlowchartEdge(m, revise, submit)
  doc.flowchart = m
  return doc
}

// ----- whiteboard workshop boards (15.6) -------------------------------------

function columns(labels) {
  const doc = baseDoc('whiteboard')
  const m = createWhiteboard()
  labels.forEach((col, i) => {
    const x = 120 + i * 260
    heading(doc, x, 60, 220, col.title)
    col.colors.forEach((color, row) => addStickyNote(m, x + 20, 120 + row * 130, { color }))
  })
  doc.whiteboard = m
  return doc
}

function wbRetro() {
  return columns([
    { title: 'What went well', colors: ['#D5F2E3', '#D5F2E3'] },
    { title: 'What to improve', colors: ['#FDE8C8', '#FDE8C8'] },
    { title: 'Action items', colors: ['#D6E6FF', '#D6E6FF'] },
  ])
}

function wbKanban() {
  return columns([
    { title: 'To do', colors: ['#FCE7E7', '#FCE7E7'] },
    { title: 'Doing', colors: ['#FFF3C4', '#FFF3C4'] },
    { title: 'Done', colors: ['#D5F2E3', '#D5F2E3'] },
  ])
}

function wbBrainstorm() {
  const doc = baseDoc('whiteboard')
  const m = createWhiteboard()
  heading(doc, 360, 50, 280, 'Brainstorm')
  const spots = [[180, 180], [520, 160], [320, 320], [640, 340], [220, 460]]
  const palette = ['#FFF3C4', '#D6E6FF', '#D5F2E3', '#FDE8C8', '#F3D9FB']
  spots.forEach(([x, y], i) => addStickyNote(m, x, y, { color: palette[i % palette.length] }))
  doc.whiteboard = m
  return doc
}

// Templates offered for a given type. `build()` returns a fresh document each
// call (so editing one never mutates the template).
const BUILTIN = {
  block: [
    { key: 'block-linear', name: 'Linear flow', hint: 'Start → work → done', build: blockLinear },
    { key: 'block-hub', name: 'Hub & spoke', hint: 'Core idea + branches', build: blockHub },
  ],
  mindmap: [{ key: 'mind-project', name: 'Project plan', hint: 'Goals, scope, risks…', build: mindProject }],
  flowchart: [{ key: 'flow-approval', name: 'Approval flow', hint: 'Submit → review → done', build: flowApproval }],
  whiteboard: [
    { key: 'wb-retro', name: 'Retrospective', hint: 'Went well / improve / actions', build: wbRetro },
    { key: 'wb-kanban', name: 'Kanban', hint: 'To do / doing / done', build: wbKanban },
    { key: 'wb-brainstorm', name: 'Brainstorm', hint: 'Central topic + stickies', build: wbBrainstorm },
  ],
}

export function builtinTemplates(type) {
  return BUILTIN[type] || []
}
