// The connector tools the palette arms, mapped to the stored connector geometry
// + default arrowheads. 'line' is a plain straight segment with no arrowheads;
// 'connector-arrow' adds an end arrow; elbow/curved keep the end arrow. The arrow
// connector is namespaced ('connector-arrow') because 'arrow' is already a block
// SHAPE type — sharing the id made every block arrow commit as a connector.
//
// Shared by useShapeCreation (creation) and useConnectorDrawing (the snap-to-
// anchor draw path), so BOTH agree on which armed types are connectors — otherwise
// a type one side omits (line / connector-arrow) draws with no connection anchors.
export const CONNECTOR_SPECS = {
  line: { type: 'straight', arrowheads: { start: 'none', end: 'none' } },
  'connector-arrow': { type: 'straight', arrowheads: { start: 'none', end: 'arrow' } },
  straight: { type: 'straight', arrowheads: { start: 'none', end: 'arrow' } },
  elbow: { type: 'elbow', arrowheads: { start: 'none', end: 'arrow' } },
  curved: { type: 'curved', arrowheads: { start: 'none', end: 'arrow' } },
}

export const CONNECTOR_TYPES = Object.keys(CONNECTOR_SPECS)
