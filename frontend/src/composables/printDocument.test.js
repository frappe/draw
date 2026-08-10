import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #227: the printed page had white bands down it and lost the canvas colour.
// The page is built as one CSS string, so assert that string. Browser-free, the
// same way the toolbar SFCs are source-checked.
vi.mock('frappe-ui', () => ({ toast: { error() {} } }))

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'useExport.js'),
  'utf8',
)
const printCss = source.match(/function printDocument[\s\S]*?\n}/)?.[0] ?? ''

describe('the printed page is the canvas and nothing else (#227)', () => {
  it('sets the page box to the canvas size, with no margin', () => {
    expect(printCss).toContain('@page{size:${num(width)}px ${num(height)}px;margin:0}')
  })

  it('fills the page box instead of sizing from the drawing ratio', () => {
    // `height:auto` printed the leftover page height as a white band whenever the
    // paper was not exactly the canvas ratio. This is the whole of "extra whitespace".
    expect(printCss).toContain('svg{display:block;width:100%;height:100%}')
    expect(printCss).not.toContain('height:auto')
  })

  it('gives html and body a height for that 100% to resolve against', () => {
    expect(printCss).toContain('html,body{margin:0;padding:0;width:100%;height:100%}')
  })

  it('keeps background colours, which browsers drop when printing', () => {
    // Without this a coloured canvas prints white — "does not match the canvas".
    expect(printCss).toContain('print-color-adjust:exact')
    expect(printCss).toContain('-webkit-print-color-adjust:exact')
  })

  it('still passes the canvas dimensions through num(), not raw document values', () => {
    // Canvas fields come from an untrusted document and this string is written
    // into a new window, so it is an HTML-injection sink.
    expect(printCss).toContain('num(width)')
    expect(printCss).toContain('num(height)')
  })

  it('is used for Print and for the PDF fallback alike', () => {
    const calls = source.match(/exportPdfWithPrintWindow\(/g) || []
    expect(calls.length).toBeGreaterThanOrEqual(3) // definition + print + pdf fallback
  })
})
