// The connector tools the palette arms, mapped to the stored connector geometry
// + default arrowheads.
//
// SIX tools, as three geometries x two endings (#499): straight, elbowed and
// curved, each as a plain line and as an arrow. The set used to be five, named
// along neither axis — `line`, `connector-arrow`, `elbow`, `curved`, `straight` —
// where `elbow` and `curved` silently meant "elbowed ARROW" and "curved ARROW",
// and the two plain variants of those did not exist at all.
//
// The ids now say both axes. They are safe to rename because NOTHING persists
// them: what a document stores is `spec.type` ('straight' | 'elbow' | 'curved')
// plus its arrowheads, and both creation paths map through this table to get
// there. The key only ever lives in editorUi.state.drawShapeType, which is not
// saved. So there is no migration here, despite the ids changing.
//
// The `-straight` / `-elbow` / `-curved` suffixes also settle a real collision the
// old names had: `line` is ALSO the whiteboard's own line tool, and `arrow` is a
// block SHAPE type (which is why the old arrow id had to be namespaced at all).
//
// Shared by useShapeCreation (creation) and useConnectorDrawing (the snap-to-
// anchor draw path), so BOTH agree on which armed types are connectors — otherwise
// a type one side omits draws with no connection anchors.
const NO_HEADS = { start: 'none', end: 'none' }
const END_ARROW = { start: 'none', end: 'arrow' }

export const CONNECTOR_SPECS = {
  'line-straight': { type: 'straight', arrowheads: { ...NO_HEADS } },
  'line-elbow': { type: 'elbow', arrowheads: { ...NO_HEADS } },
  'line-curved': { type: 'curved', arrowheads: { ...NO_HEADS } },
  'arrow-straight': { type: 'straight', arrowheads: { ...END_ARROW } },
  'arrow-elbow': { type: 'elbow', arrowheads: { ...END_ARROW } },
  'arrow-curved': { type: 'curved', arrowheads: { ...END_ARROW } },
}

// What an unrecognised armed type commits as. The draw path needs a fallback and a
// straight arrow is the least surprising one; it is deliberately NOT a menu entry,
// which is what the old duplicate `straight` key had become.
export const FALLBACK_CONNECTOR = CONNECTOR_SPECS['arrow-straight']

export const CONNECTOR_TYPES = Object.keys(CONNECTOR_SPECS)
