// Canvas size presets (logical units). Spec §4.1 — the canvas is always one
// of these fixed sizes. Dimensions are logical pixels at ~96 DPI.

export const CANVAS_PRESETS = [
  { name: 'Widescreen 16:9', width: 1280, height: 720 },
  { name: 'Standard 4:3', width: 1024, height: 768 },
  { name: 'A4 Landscape', width: 1123, height: 794 },
  { name: 'A4 Portrait', width: 794, height: 1123 },
  { name: 'Letter Landscape', width: 1056, height: 816 },
  { name: 'Letter Portrait', width: 816, height: 1056 },
  { name: 'Square', width: 1080, height: 1080 },
]

export const DEFAULT_PRESET_NAME = 'Widescreen 16:9'

export function findPreset(name) {
  return CANVAS_PRESETS.find((preset) => preset.name === name) || CANVAS_PRESETS[0]
}
