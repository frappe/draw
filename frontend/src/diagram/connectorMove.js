// Pure geometry for moving a connector's body (#542): a line drawn onto empty
// canvas should be selectable and draggable like any other object, but an
// endpoint ATTACHED to a shape already follows that shape's anchor on its own
// (ConnectorView's resolve() reads it live) — moving it explicitly here would
// fight that. So only a FREE endpoint, plus a stored curve midpoint, actually
// needs to translate with the drag.

// Whether dragging this connector's body would move anything at all. A
// connector with both ends attached is fully pinned by its shapes — every
// structural connector (mind-map branch, flowchart edge, mind-map cross-link)
// is always attached at both ends, so this doubles as their drag guard without
// needing a role check.
export function connectorBodyMovable(connector) {
  return !connector?.from?.shapeId || !connector?.to?.shapeId
}

// The patch to apply for a body drag of `(dx, dy)`. Only touches the parts
// that are free to move; an attached endpoint is left out of the patch
// entirely (nothing to write — it already follows its shape).
export function translateConnectorBody(connector, dx, dy) {
  const patch = {}
  if (!connector?.from?.shapeId) {
    patch.from = { ...connector.from, x: (connector.from?.x || 0) + dx, y: (connector.from?.y || 0) + dy }
  }
  if (!connector?.to?.shapeId) {
    patch.to = { ...connector.to, x: (connector.to?.x || 0) + dx, y: (connector.to?.y || 0) + dy }
  }
  if (connector?.midpoint) {
    patch.midpoint = { x: connector.midpoint.x + dx, y: connector.midpoint.y + dy }
  }
  if (Number.isFinite(connector?.midX)) {
    patch.midX = connector.midX + dx
  }
  return patch
}
