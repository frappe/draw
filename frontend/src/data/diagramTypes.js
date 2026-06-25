// The four diagram types, with display labels + icons, shared by the home
// filter control and the diagram tiles so naming stays in one place.

export const DIAGRAM_TYPES = [
  { value: 'block', label: 'Block', icon: 'square' },
  { value: 'mindmap', label: 'Mind map', icon: 'share-2' },
  { value: 'flowchart', label: 'Flowchart', icon: 'git-branch' },
  { value: 'whiteboard', label: 'Whiteboard', icon: 'edit-3' },
]

const BY_VALUE = Object.fromEntries(DIAGRAM_TYPES.map((type) => [type.value, type]))

export function typeLabel(value) {
  return BY_VALUE[value]?.label || 'Block'
}

export function typeIcon(value) {
  return BY_VALUE[value]?.icon || 'square'
}
