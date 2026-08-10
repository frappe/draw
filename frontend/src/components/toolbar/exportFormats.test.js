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

  it('reports no pixel size for a vector format', () => {
    expect(outputSize(CANVAS, 'svg', 4)).toBeNull()
    expect(outputSizeLabel(CANVAS, 'pdf', 2)).toBe('Vector — scales to any size')
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

  it('hides the scale picker for a vector format', () => {
    expect(dialog).toContain('v-if="showsScale"')
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
