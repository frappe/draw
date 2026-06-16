// Theme presets — coordinated color triads applied per-canvas (README "Canvas
// theme-preset tokens"). Shapes reference these via the --t* / --t2* / --t3*
// CSS custom properties scoped to the canvas wrapper, NOT chrome tokens.

export const THEME_PRESET_NAMES = ['ocean', 'slate', 'violet', 'sunset']

export const DEFAULT_THEME_PRESET = 'ocean'

// Each preset holds three triads: primary (t), secondary (t2), tertiary (t3).
// A triad is { fill, stroke, ink } — fill colour, border colour, text colour.
export const THEME_PRESETS = {
  ocean: {
    label: 'Ocean',
    t: { fill: '#EFF6FF', stroke: '#4F94FF', ink: '#0A2F58' },
    t2: { fill: '#F4FFF6', stroke: '#88D5A5', ink: '#16794C' },
    t3: { fill: '#FDFAED', stroke: '#FBCC55', ink: '#91400D' },
  },
  slate: {
    label: 'Slate',
    t: { fill: '#F3F3F3', stroke: '#C7C7C7', ink: '#171717' },
    t2: { fill: '#E2E2E2', stroke: '#999999', ink: '#383838' },
    t3: { fill: '#FFFFFF', stroke: '#7C7C7C', ink: '#525252' },
  },
  violet: {
    label: 'Violet',
    t: { fill: '#EFEAFE', stroke: '#8A6BF0', ink: '#3A2A8C' },
    t2: { fill: '#E7F8FB', stroke: '#5BC8E0', ink: '#0B6E84' },
    t3: { fill: '#FCEAF5', stroke: '#E68AC4', ink: '#A8327E' },
  },
  sunset: {
    label: 'Sunset',
    t: { fill: '#FFF1E6', stroke: '#F6A360', ink: '#9A4B0E' },
    t2: { fill: '#FDECEC', stroke: '#F08A8A', ink: '#B52A2A' },
    t3: { fill: '#FFF7D8', stroke: '#EFC53F', ink: '#86600A' },
  },
}

export function findThemePreset(name) {
  return THEME_PRESETS[name] || THEME_PRESETS[DEFAULT_THEME_PRESET]
}

// The primary triad styles new shapes (README §5.1 — never raw black-on-white).
export function primaryTriad(name) {
  return findThemePreset(name).t
}

// CSS var style object for the canvas wrapper, so shapes can read var(--t-fill).
export function themeVarStyle(name) {
  const preset = findThemePreset(name)
  const style = {}
  for (const [key, triad] of Object.entries({ t: preset.t, t2: preset.t2, t3: preset.t3 })) {
    const prefix = key === 't' ? '--t' : `--${key}`
    style[`${prefix}-fill`] = triad.fill
    style[`${prefix}-stroke`] = triad.stroke
    style[`${prefix}-ink`] = triad.ink
  }
  return style
}

// Connectors are always neutral, independent of preset (README).
export const CONNECTOR_DEFAULT_STYLE = { color: '#7C7C7C', width: 2.2, dash: 'solid' }
