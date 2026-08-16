import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  DEFAULT_FORMAT,
  DEFAULT_SCALE,
  findFormat,
  isScalable,
  outputSize,
  outputSizeLabel,
} from './exportFormats.js'

// #225: the export dialog's model, plus source checks that the SFC binds it —
// browser-free, the way overflowMenu.test.js and ShareMenu.test.js work.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (file) => readFileSync(path.join(here, file), 'utf8')
const dialog = read('ExportDialog.vue')
const topToolbar = read('TopToolbar.vue')

const CANVAS = { width: 1280, height: 720 }

describe('export format model (#225)', () => {
  it('offers PNG, JPEG, SVG and PDF', () => {
    expect(EXPORT_FORMATS.map((f) => f.value)).toEqual(['png', 'jpeg', 'svg', 'pdf'])
  })

  it('gives each format its own glyph, as a complete lucide class (#224, #292)', () => {
    const icons = EXPORT_FORMATS.map((f) => f.icon)
    expect(new Set(icons).size).toBe(icons.length)
    for (const icon of icons) expect(icon).toMatch(/^lucide-[a-z0-9-]+$/)
  })

  it('marks only the raster formats scalable', () => {
    expect(isScalable('png')).toBe(true)
    expect(isScalable('jpeg')).toBe(true)
    expect(isScalable('svg')).toBe(false)
    expect(isScalable('pdf')).toBe(false)
  })

  it('starts on PNG at 2x', () => {
    // Crisp on a high-density screen without quadrupling the file for nothing.
    expect(DEFAULT_FORMAT).toBe('png')
    expect(DEFAULT_SCALE).toBe(2)
    expect(EXPORT_SCALES).toEqual([1, 2, 3, 4])
  })

  it('falls back to the first format rather than returning undefined', () => {
    expect(findFormat('nope')).toBe(EXPORT_FORMATS[0])
  })
})

describe('the size the dialog reports (#225)', () => {
  it('multiplies the canvas by the chosen scale', () => {
    expect(outputSize(CANVAS, 'png', 1)).toEqual({ width: 1280, height: 720 })
    expect(outputSize(CANVAS, 'png', 4)).toEqual({ width: 5120, height: 2880 })
    expect(outputSizeLabel(CANVAS, 'jpeg', 2)).toBe('2560 × 1440 px')
  })

  // The readout used to say "Vector — scales to any size", which is the format hint
  // beside it said twice ("Vector. Stays sharp at any size."). For a raster the two
  // are complementary — a hint plus the real pixel size — and for a vector the
  // readout has nothing of its own to report (#455).
  it('reports nothing at all for a vector format', () => {
    expect(outputSize(CANVAS, 'svg', 4)).toBeNull()
    expect(outputSizeLabel(CANVAS, 'pdf', 2)).toBe('')
  })

  it('ignores a scale that is not on the list', () => {
    expect(outputSize(CANVAS, 'png', 7)).toEqual({ width: 1280, height: 720 })
  })

  it('survives a canvas that has not loaded yet', () => {
    expect(outputSize(undefined, 'png', 2)).toEqual({ width: 0, height: 0 })
  })
})

describe('the dialog wires that model up (#225)', () => {
  it('replaces the old fire-on-click menu with an explicit Export button', () => {
    expect(dialog).toContain('<Dialog')
    expect(dialog).toContain('@click="runExport"')
    expect(topToolbar).toContain('ExportDialog')
    expect(topToolbar).not.toContain('ExportMenu')
  })

  it('drives both pickers from the shared lists', () => {
    expect(dialog).toContain('EXPORT_FORMATS.map')
    expect(dialog).toContain('EXPORT_SCALES.map')
  })

  // #455: it used to be `v-if="showsScale"` on a whole Size block. Hiding it took
  // ~44px out of a vertically centred dialog, so picking SVG moved every remaining
  // control up the screen — under the pointer that had just clicked. It is disabled
  // rather than hidden now, and it rides on the Format row.
  it('disables the scale picker for a vector format instead of removing it', () => {
    expect(dialog).toContain(':disabled="!showsScale"')
    expect(dialog).not.toContain('v-if="showsScale"')
  })

  // The two things that made the dialog change height, both bound so a later edit
  // has to mean it: the scale control and the hint.
  it('holds one height whatever the format is', () => {
    // JPEG's hint wraps to two lines at this width while PNG's and SVG's do not.
    expect(dialog).toContain('min-h-8')
    // The size readout shares the hint's row, so an empty one costs no height.
    expect(dialog).toMatch(/{{ current\.hint }}[\s\S]{0,200}{{ sizeLabel }}/)
    // No Size block left to take its own height with it.
    expect(dialog).not.toContain('>Size<')
  })

  // A Frappe UI Select, not a hand-rolled control, and a fixed width — it sizes its
  // trigger to the current value, so 1x and 4x would nudge the formats sideways.
  it('uses a Select for the scale, at a fixed width', () => {
    expect(dialog).toContain('<Select')
    expect(dialog).toContain('w-16 shrink-0')
  })

  it('previews through the same builder the export uses', () => {
    // A preview from a second renderer would drift from the file it promises.
    expect(dialog).toContain('documentToSvg(store.getDocument())')
  })

  it('keeps Print reachable', () => {
    expect(dialog).toContain('exporter.printDiagram()')
  })

  it('names the file after the diagram, not "diagram"', () => {
    // useExport has always taken a title accessor and nothing ever passed one, so
    // every export landed in Downloads as diagram.png.
    expect(dialog).toContain('useExport(store, () => diagram.doc?.title)')
    expect(dialog).toContain('loadDiagram(route.params.name)')
  })

  it('offers no background control, which #226 settled', () => {
    // Transparency follows the canvas. A per-export toggle could contradict it.
    // The preview box's own white backdrop is not a control — the canvas is light
    // even in dark mode, so the preview has to be too.
    expect(dialog).not.toMatch(/transparent/i)
    expect(dialog).not.toMatch(/\bbackground\s*=\s*ref\(/)
    expect(dialog).not.toContain('Checkbox')
    expect(dialog).not.toContain('Switch')
    // No background is threaded into the exporter either.
    expect(dialog).not.toMatch(/export(Png|Jpeg|Svg|Pdf)\([^)]*background/i)
  })

  it('offers no canvas trim, which is #228 and handled separately', () => {
    expect(dialog).not.toMatch(/trim|compact/i)
  })
})
