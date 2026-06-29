// "Insert example" seed content per diagram type (spec 10.2) — a quick-start so
// an empty canvas isn't a blank page. Everything is built inside ONE store
// commit (using the pure factories / model helpers directly, not the per-call
// store mutations) so the whole example is a single undoable step.

import { createShape, createConnector } from '@/diagram/factories.js'
import { addChild } from '@/diagram/mindmapModel.js'
import { addFlowchartNode, addFlowchartEdge } from '@/diagram/flowchartModel.js'
import { addStickyNote } from '@/diagram/whiteboardModel.js'

export function insertExample(store) {
  const type = store.state.diagramType
  if (type === 'mindmap') return seedMindmap(store)
  if (type === 'flowchart') return seedFlowchart(store)
  if (type === 'whiteboard') return seedWhiteboard(store)
  return seedBlock(store)
}

// Three labelled boxes joined top-to-bottom by elbow connectors.
function seedBlock(store) {
  const preset = store.state.themePreset
  const ids = []
  store.commit('Insert example', () => {
    const labels = ['Start', 'Do the work', 'Done']
    const boxes = labels.map((label, i) => {
      const shape = createShape({ type: i === 1 ? 'rectangle' : 'rounded', x: 320, y: 120 + i * 150, w: 200, h: 96 }, preset)
      shape.text.content = label
      shape.zIndex = i + 1
      store.state.shapes.push(shape)
      ids.push(shape.id)
      return shape
    })
    for (let i = 0; i < boxes.length - 1; i += 1) {
      store.state.connectors.push(
        createConnector({
          type: 'elbow',
          from: { shapeId: boxes[i].id, anchor: 'bottom' },
          to: { shapeId: boxes[i + 1].id, anchor: 'top' },
          arrowheads: { start: 'none', end: 'arrow' },
        }),
      )
    }
  })
  store.select(ids)
}

// A central topic with four branches.
function seedMindmap(store) {
  if (!store.state.mindmap) return
  store.commit('Insert example', () => {
    const root = store.state.mindmap.rootId
    for (const text of ['Goals', 'Plan', 'Risks', 'Next steps']) {
      addChild(store.state.mindmap, root, text)
    }
  })
}

// Start → process → decision with Yes/No outcomes.
function seedFlowchart(store) {
  if (!store.state.flowchart) return
  store.commit('Insert example', () => {
    const m = store.state.flowchart
    const start = addFlowchartNode(m, 'terminator', 'Start', 360, 80)
    const work = addFlowchartNode(m, 'process', 'Do the work', 355, 200)
    const check = addFlowchartNode(m, 'decision', 'Looks good?', 360, 330)
    const ship = addFlowchartNode(m, 'terminator', 'Ship it', 360, 500)
    const fix = addFlowchartNode(m, 'process', 'Fix it', 590, 330)
    addFlowchartEdge(m, start, work)
    addFlowchartEdge(m, work, check)
    addFlowchartEdge(m, check, ship, { label: 'Yes' })
    addFlowchartEdge(m, check, fix, { label: 'No' })
    addFlowchartEdge(m, fix, work)
  })
}

// A small retro board: three labelled sticky columns.
function seedWhiteboard(store) {
  if (!store.state.whiteboard) return
  store.commit('Insert example', () => {
    const m = store.state.whiteboard
    const columns = [
      { text: 'What went well', color: '#D5F2E3' },
      { text: 'What to improve', color: '#FDE8C8' },
      { text: 'Action items', color: '#D6E6FF' },
    ]
    columns.forEach((col, i) => addStickyNote(m, 200 + i * 240, 160, { text: col.text, color: col.color }))
  })
}
