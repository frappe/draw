// Branch coloring for mind maps (spec diagram-types A3/A4/M3). Each first-level
// branch is assigned an Espresso color; descendants inherit it (lightened by
// depth); any node may override via node.color; theme presets reassign the
// branch palette. Pure helpers so coloring stays unit-testable.

import { childrenOf, parentOf, isRoot } from './mindmapModel.js'

// Curated Espresso branch hues (match the FillBorder swatch family).
const BRANCH_PALETTES = {
  ocean: ['#4F94FF', '#30A66D', '#FBCC55', '#E68AC4', '#8A6BF0', '#F08A8A'],
  slate: ['#525252', '#7C7C7C', '#999999', '#383838', '#171717', '#C7C7C7'],
  violet: ['#8A6BF0', '#5BC8E0', '#E68AC4', '#6846E3', '#30A66D', '#FBCC55'],
  sunset: ['#F6A360', '#F08A8A', '#EFC53F', '#E68AC4', '#8A6BF0', '#4F94FF'],
}

const ROOT_COLOR = '#6846E3'

export function branchPalette(themePreset) {
  return BRANCH_PALETTES[themePreset] || BRANCH_PALETTES.ocean
}

// The first-level branch that a node belongs to (itself if first-level, the root
// for the root, walking up otherwise). Returns the branch node, or null.
function branchAncestor(model, id) {
  let node = model.nodes.find((candidate) => candidate.id === id)
  while (node && node.parentId && node.parentId !== model.rootId) {
    node = parentOf(model, node.id)
  }
  return node || null
}

// Resolve a node's display color: explicit override wins; the root is the brand
// color; otherwise inherit the branch's palette color, lightened by depth.
export function resolveNodeColor(model, node, themePreset) {
  if (node.color) return node.color
  if (isRoot(model, node.id)) return ROOT_COLOR
  const branch = branchAncestor(model, node.id)
  if (!branch) return ROOT_COLOR
  const palette = branchPalette(themePreset)
  const index = firstLevelIndex(model, branch.id)
  const base = palette[index % palette.length]
  return lighten(base, Math.max(0, node.depth - 1))
}

// Position of a first-level branch among the root's children (drives its hue).
function firstLevelIndex(model, branchId) {
  return childrenOf(model, model.rootId).findIndex((child) => child.id === branchId)
}

// A soft pill fill derived from the branch color (very light tint).
export function nodeFill(color) {
  return mixWithWhite(color, 0.86)
}

// Lighten a hex color toward white; each depth step adds a little more white so
// deeper descendants read softer (spec A3 "optionally lightening with depth").
export function lighten(hex, depthSteps) {
  if (depthSteps <= 0) return hex
  const amount = Math.min(0.5, depthSteps * 0.12)
  return mixWithWhite(hex, amount)
}

// Mix a hex color with white by `ratio` (0 = original, 1 = white).
function mixWithWhite(hex, ratio) {
  const { r, g, b } = parseHex(hex)
  const blend = (channel) => Math.round(channel + (255 - channel) * ratio)
  return toHex(blend(r), blend(g), blend(b))
}

function parseHex(hex) {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function toHex(r, g, b) {
  const part = (channel) => channel.toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

// Pick readable text ink (dark for light fills, white for dark fills).
export function readableInk(backgroundHex) {
  const { r, g, b } = parseHex(backgroundHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1F2933' : '#FFFFFF'
}
