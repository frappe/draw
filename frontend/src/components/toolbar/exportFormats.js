// The export dialog's model (#225): the formats it offers, the scales that apply
// to a raster one, and the output size it reports. A plain module — not inline in
// the SFC — so the option set and the size arithmetic are unit-testable without
// mounting the dialog. Mirrors overflowMenu.js.
//
// There is NO background option. Transparency follows the canvas: a "No color"
// canvas exports transparent and a coloured one keeps its colour. The per-export
// checkbox was removed in #226 because it duplicated that setting and could
// contradict it.
//
// There is NO trim option either — compacting the canvas to its content is #228,
// which is being handled separately. The dialog has room for it when it lands.

// `icon` is a COMPLETE lucide class: Tailwind's JIT only emits classes it can
// read literally in the source (#292). PNG and JPEG carry different glyphs (#224).
export const EXPORT_FORMATS = [
  {
    value: 'png',
    label: 'PNG',
    icon: 'lucide-image',
    scalable: true,
    hint: 'Best for sharing. Keeps a transparent background.',
  },
  {
    value: 'jpeg',
    label: 'JPEG',
    icon: 'lucide-file-image',
    scalable: true,
    hint: 'Smaller file. No transparency — a blank canvas comes out white.',
  },
  {
    value: 'svg',
    label: 'SVG',
    icon: 'lucide-code',
    scalable: false,
    hint: 'Vector. Stays sharp at any size.',
  },
  {
    value: 'pdf',
    label: 'PDF',
    icon: 'lucide-file-text',
    scalable: false,
    hint: 'One page, sized to the canvas.',
  },
]

export const EXPORT_SCALES = [1, 2, 3, 4]
export const DEFAULT_FORMAT = 'png'
// 2x is the useful default for a raster: crisp on a high-density screen without
// quadrupling the file for no reason.
export const DEFAULT_SCALE = 2

export function findFormat(value) {
  return EXPORT_FORMATS.find((format) => format.value === value) || EXPORT_FORMATS[0]
}

export function isScalable(value) {
  return findFormat(value).scalable
}

// What the user will actually get, so the choice is not guesswork. A vector format
// has no pixel size, so it reports null and the dialog says so instead.
export function outputSize(canvas, formatValue, scale) {
  if (!isScalable(formatValue)) return null
  const multiplier = EXPORT_SCALES.includes(scale) ? scale : 1
  return {
    width: Math.round((canvas?.width || 0) * multiplier),
    height: Math.round((canvas?.height || 0) * multiplier),
  }
}

// A vector format reports NOTHING rather than "Vector — scales to any size" (#455).
// It sits beside the format hint, which already says "Vector. Stays sharp at any
// size." — two lines of the same sentence, where for a raster the two are
// complementary: a hint plus the real pixel size. The readout is empty here, not
// removed from the layout; the row it shares with the hint keeps its height.
export function outputSizeLabel(canvas, formatValue, scale) {
  const size = outputSize(canvas, formatValue, scale)
  if (!size) return ''
  return `${size.width} × ${size.height} px`
}
