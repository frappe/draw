import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import fs from 'node:fs/promises'

// Export had no browser coverage at all, and it is the feature with the worst
// track record in this app: #40 found that EVERY unified document — i.e. every new
// diagram — exported as block-only, silently dropping whiteboard ink, sticky notes
// and both frames, and that whiteboard lines and tables were never exported at
// all. That shipped because `documentToSvg` was only ever exercised by unit tests
// on hand-built documents.
//
// These drive the real Export menu and read the file the browser actually
// downloaded. The SVG cases are the strong ones: the downloaded markup is asserted
// to contain content from every layer, which is exactly the omission #40 fixed and
// the one that would return if another diagram type were added without checking
// every `diagramType ===` dispatch.

// Click an item in the Export dropdown and return the download it produced.
// The item is awaited for visibility first — popover items miss silently when
// clicked mid-settle, which then looks like a broken exporter.
//
// `exact: true` matters: getByRole name matching is a SUBSTRING match, and the
// `diagram` fixture titles each document after the test that created it — so the
// title button in the header matched `name: 'Export'` in every test whose own name
// contained the word "export". See the warning in helpers/fixtures.js.
async function exportVia(page, label) {
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const item = page.getByText(label, { exact: true }).first()
  await item.waitFor({ state: 'visible' })
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()])
  return download
}

async function downloadedText(download) {
  const path = await download.path()
  return fs.readFile(path, 'utf8')
}

async function downloadedBytes(download) {
  const path = await download.path()
  return fs.readFile(path)
}

test.describe('export: a unified document exports every layer', () => {
  // The #40 regression, stated end to end. A unified document holds block shapes,
  // whiteboard ink, a sticky, and mind-map + flowchart frames; all of it has to
  // reach the file.
  test('SVG contains block, whiteboard, mind-map and flowchart content', async ({
    page,
    diagram,
  }) => {
    await diagram.open('unified', { withFrames: true })

    const svg = await downloadedText(await exportVia(page, 'SVG'))

    expect(svg.startsWith('<svg'), 'export produced something that is not an SVG').toBe(true)
    // Seeded whiteboard stroke colour and sticky colour (see fixtures/documents.js).
    expect(svg, 'whiteboard ink missing from the export').toContain('#171717')
    expect(svg, 'sticky note missing from the export').toContain('#FEF3C7')
    expect(svg, 'sticky text missing from the export').toContain('note')
    // Mind-map and flowchart frames.
    expect(svg, 'mind-map frame missing from the export').toContain('Branch A')
    expect(svg, 'flowchart frame missing from the export').toContain('Do work')
  })

  test('the viewBox is wide enough to include the off-canvas frames', async ({ page, diagram }) => {
    // The frames sit outside the 1280x720 canvas rect (mind map at y=900, flowchart
    // at x=1500). A canvas-sized viewBox renders them into the file but crops them
    // out of the picture, which looks identical to not exporting them.
    await diagram.open('unified', { withFrames: true })

    const svg = await downloadedText(await exportVia(page, 'SVG'))
    const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)

    expect(x + w, 'viewBox is too narrow for the flowchart frame').toBeGreaterThan(1500)
    expect(y + h, 'viewBox is too short for the mind-map frame').toBeGreaterThan(900)
  })

  test('a whiteboard line and table reach the exported file', async ({ page, diagram }) => {
    // Lines and tables were omitted from the export path entirely until #40 — legacy
    // boards included. The default board fixture has neither, so this needs the
    // objects variant or it cannot notice their absence.
    await diagram.open('whiteboard', { objects: true })

    const svg = await downloadedText(await exportVia(page, 'SVG'))

    expect(svg, 'whiteboard ink missing').toContain('#171717')
    expect(svg, 'whiteboard LINE missing from the export').toContain('#AA0011')
    expect(svg, 'whiteboard TABLE missing from the export').toContain('#00AA55')
    expect(svg, 'table cell text missing from the export').toContain('CELL-TEXT')
  })
})

test.describe('export: the raster and document formats produce real files', () => {
  test('PNG downloads a decodable image, not a blank or truncated one', async ({ page, diagram }) => {
    await diagram.open('unified', { withFrames: true })

    const download = await exportVia(page, 'PNG · 1×')
    expect(await download.suggestedFilename()).toMatch(/\.png$/)

    const bytes = await downloadedBytes(download)
    // PNG signature, then width/height from the IHDR chunk (bytes 16-23).
    expect(bytes.subarray(0, 8).toString('hex'), 'not a PNG').toBe('89504e470d0a1a0a')
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    expect(width, 'exported PNG has no width').toBeGreaterThan(100)
    expect(height, 'exported PNG has no height').toBeGreaterThan(100)
  })

  test('PNG · 3× is larger than PNG · 1×, so the scale argument is wired', async ({
    page,
    diagram,
  }) => {
    await diagram.open('unified', { withFrames: true })

    const one = await downloadedBytes(await exportVia(page, 'PNG · 1×'))
    const three = await downloadedBytes(await exportVia(page, 'PNG · 3×'))

    expect(three.readUInt32BE(16), 'the 3x export is no bigger than the 1x one').toBeGreaterThan(
      one.readUInt32BE(16),
    )
  })

  test('PDF downloads a real PDF', async ({ page, diagram }) => {
    await diagram.open('unified', { withFrames: true })

    const download = await exportVia(page, 'PDF')
    expect(await download.suggestedFilename()).toMatch(/\.pdf$/)
    const bytes = await downloadedBytes(download)
    expect(bytes.subarray(0, 5).toString('utf8'), 'not a PDF').toBe('%PDF-')
  })

  test('the Markdown outline export carries the diagram content', async ({ page, diagram }) => {
    await diagram.open('unified', { withFrames: true })

    const md = await downloadedText(await exportVia(page, 'Outline (Markdown)'))
    expect(md.length, 'outline export is empty').toBeGreaterThan(0)
  })
})

test.describe('export: hygiene', () => {
  test('exporting every format raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('unified', { withFrames: true })

    for (const label of ['SVG', 'PNG · 2×', 'PNG · transparent', 'JPEG', 'PDF']) {
      await exportVia(page, label)
    }

    expect(errors.pageErrors, 'an export raised an uncaught exception').toEqual([])
    expect(errors.failures, 'an export made a request that failed').toEqual([])
  })
})
