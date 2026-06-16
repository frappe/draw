// Internal app clipboard: copy/cut/paste with a +10/+10 offset and the
// connector-attachment rule (spec §7.3). No OS-clipboard interaction in v1.
// A module-level buffer lets paste repeat after the selection changes, and
// lets useKeyboard share the same session without prop plumbing.

const PASTE_OFFSET = 10

let buffer = { shapes: [], connectors: [] }

export function useClipboard(store) {
  return {
    copy: () => copySelection(store),
    cut: () => cutSelection(store),
    paste: () => pasteBuffer(store),
    hasContent: () => buffer.shapes.length > 0 || buffer.connectors.length > 0,
  }
}

// Snapshot the selected shapes plus connectors whose endpoints are all selected.
function copySelection(store) {
  const shapes = store.selectedShapes.value
  if (!shapes.length) return
  const shapeIds = new Set(shapes.map((shape) => shape.id))
  buffer = { shapes: clone(shapes), connectors: copyableConnectors(store, shapeIds) }
}

// Connectors survive only if both endpoint shapes are in the selection (§7.3).
function copyableConnectors(store, shapeIds) {
  const selected = store.state.connectors.filter((c) => store.state.selection.includes(c.id))
  return clone(selected.filter((connector) => endpointsCopied(connector, shapeIds)))
}

function endpointsCopied(connector, shapeIds) {
  return endpointCopied(connector.from, shapeIds) && endpointCopied(connector.to, shapeIds)
}

function endpointCopied(endpoint, shapeIds) {
  return !endpoint.shapeId || shapeIds.has(endpoint.shapeId)
}

function cutSelection(store) {
  copySelection(store)
  store.removeSelectionOrIds()
}

// Re-create the buffer at a +10/+10 offset, remap connector endpoints to the
// freshly-created shapes, then select the copies as one history step.
function pasteBuffer(store) {
  if (!buffer.shapes.length && !buffer.connectors.length) return
  const newIds = []
  store.commit('Paste', () => {
    const idMap = pasteShapes(store, newIds)
    pasteConnectors(store, idMap, newIds)
  })
  store.select(newIds)
}

function pasteShapes(store, newIds) {
  const idMap = {}
  for (const shape of buffer.shapes) {
    const partial = offsetShape(clone(shape))
    delete partial.id
    const newId = store.addShape(partial)
    idMap[shape.id] = newId
    newIds.push(newId)
  }
  return idMap
}

function offsetShape(shape) {
  shape.x += PASTE_OFFSET
  shape.y += PASTE_OFFSET
  return shape
}

function pasteConnectors(store, idMap, newIds) {
  for (const connector of buffer.connectors) {
    const partial = clone(connector)
    delete partial.id
    partial.from = remapEndpoint(partial.from, idMap)
    partial.to = remapEndpoint(partial.to, idMap)
    newIds.push(store.addConnector(partial))
  }
}

// Re-point an endpoint at the pasted copy of its shape, or offset a free point.
function remapEndpoint(endpoint, idMap) {
  if (endpoint.shapeId) return { ...endpoint, shapeId: idMap[endpoint.shapeId] }
  return { ...endpoint, x: endpoint.x + PASTE_OFFSET, y: endpoint.y + PASTE_OFFSET }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
