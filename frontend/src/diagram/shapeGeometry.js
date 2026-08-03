// Corner radius for the box shapes, shared so the live draw preview and the
// committed shape agree (#130). A plain rectangle / square is only lightly
// rounded (8); the dedicated "rounded rectangle" is pill-round (20). The preview
// ghost renders through the same value, so a sharp rectangle never previews as a
// rounded one. Non-box shapes (ellipse, diamond, …) ignore this.
export const SHARP_CORNER_RADIUS = 8
export const ROUNDED_CORNER_RADIUS = 20

export function shapeCornerRadius(type) {
  return type === 'rounded' ? ROUNDED_CORNER_RADIUS : SHARP_CORNER_RADIUS
}
