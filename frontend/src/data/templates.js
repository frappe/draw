// Starter templates (spec §2). Each is just a pre-filled diagram document built
// on the shared schema, so opening one drops the user straight into the editor
// with content. Keep these light — they are previews + starting points.

import { createDiagramDocument } from '@/diagram/schema.js'
import { createShape, createConnector } from '@/diagram/factories.js'

function box(type, x, y, w, h, label) {
  const shape = createShape({ type, x, y, w, h, zIndex: 1 }, 'ocean')
  shape.text.content = label
  return shape
}

function link(from, to) {
  return createConnector({ from, to })
}

function documentWith(shapes, connectors = []) {
  const document = createDiagramDocument()
  document.shapes = shapes
  document.connectors = connectors
  return document
}

function flowchart() {
  const start = box('ellipse', 560, 80, 200, 90, 'Start')
  const step = box('rectangle', 560, 290, 200, 90, 'Process')
  const end = box('ellipse', 560, 500, 200, 90, 'End')
  const flow = [
    link({ shapeId: start.id, anchor: 'bottom' }, { shapeId: step.id, anchor: 'top' }),
    link({ shapeId: step.id, anchor: 'bottom' }, { shapeId: end.id, anchor: 'top' }),
  ]
  return documentWith([start, step, end], flow)
}

function orgChart() {
  const lead = box('rectangle', 540, 80, 200, 90, 'CEO')
  const reports = [
    box('rectangle', 300, 320, 180, 86, 'Engineering'),
    box('rectangle', 540, 320, 180, 86, 'Design'),
    box('rectangle', 780, 320, 180, 86, 'Sales'),
  ]
  const edges = reports.map((node) =>
    link({ shapeId: lead.id, anchor: 'bottom' }, { shapeId: node.id, anchor: 'top' }),
  )
  return documentWith([lead, ...reports], edges)
}

function swotGrid() {
  return documentWith([
    box('rectangle', 200, 80, 380, 250, 'Strengths'),
    box('rectangle', 700, 80, 380, 250, 'Weaknesses'),
    box('rectangle', 200, 380, 380, 250, 'Opportunities'),
    box('rectangle', 700, 380, 380, 250, 'Threats'),
  ])
}

function mindMap() {
  const core = box('ellipse', 540, 300, 200, 110, 'Idea')
  const branches = [
    box('ellipse', 200, 140, 170, 80, 'Topic A'),
    box('ellipse', 900, 140, 170, 80, 'Topic B'),
    box('ellipse', 900, 460, 170, 80, 'Topic C'),
  ]
  const edges = branches.map((node) => link({ shapeId: core.id, anchor: 'right' }, { shapeId: node.id, anchor: 'left' }))
  return documentWith([core, ...branches], edges)
}

function timeline() {
  const nodes = [
    box('ellipse', 200, 320, 150, 80, 'Q1'),
    box('ellipse', 560, 320, 150, 80, 'Q2'),
    box('ellipse', 920, 320, 150, 80, 'Q3'),
  ]
  const edges = [
    link({ shapeId: nodes[0].id, anchor: 'right' }, { shapeId: nodes[1].id, anchor: 'left' }),
    link({ shapeId: nodes[1].id, anchor: 'right' }, { shapeId: nodes[2].id, anchor: 'left' }),
  ]
  return documentWith(nodes, edges)
}

export const TEMPLATES = [
  { key: 'blank', title: 'Blank canvas', document: createDiagramDocument() },
  { key: 'flowchart', title: 'Flowchart', document: flowchart() },
  { key: 'orgchart', title: 'Org chart', document: orgChart() },
  { key: 'swot', title: 'SWOT grid', document: swotGrid() },
  { key: 'mindmap', title: 'Mind map', document: mindMap() },
  { key: 'timeline', title: 'Timeline', document: timeline() },
]
