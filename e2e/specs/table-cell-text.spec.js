import { test, expect } from '../helpers/fixtures.js'
import { boxInWindow } from '../helpers/editor.js'

// Editing a table cell, and per-cell bold/italic/underline (#344).
//
// The cell editor was a plain <input> until #344 replaced it with a
// contenteditable, so the FIRST test here guards behaviour that already worked
// and had no coverage: typing into a cell and having it persist. The rest cover
// the new formatting. Everything asserts the PERSISTED document, because a run
// that renders but never reaches whiteboard.tables[] is this app's characteristic
// failure — and formatting is exactly the kind of thing that looks right on
// screen while the model still holds a plain string.
//
// Cells are reached by clicking the seeded cell text: once to select the table,
// again to drop the caret in (the T2 click-to-edit path). The <text> is
// pointer-events:none, so the click lands on the table group beneath it.

const table = async (diagram, name) => (await diagram.saved(name)).whiteboard.tables[0]

async function openCell(page) {
  const cell = page.getByText('CELL-TEXT').first()
  const box = await boxInWindow(page, cell, 'the seeded table cell')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // Two SEPARATE clicks, not a double-click. A cell only opens on a click once
  // its table is already selected (the T2 path), so the first click selects and
  // the second drops the caret in. The pause keeps the pair from registering as a
  // double-click, which takes a different route: onDoubleClick sets editingCell
  // and then calls selectTable, whose setSelection clears it straight back to null.
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(600)
  await page.mouse.click(point.x, point.y)
  await expect(page.locator('[role="textbox"][contenteditable]')).toBeVisible()
}

// Select the whole cell: the caret opens at the end, so extend it to the start.
async function selectAllInCell(page) {
  await page.keyboard.press('Shift+Home')
}

test.describe('whiteboard table cell text (#344)', () => {
  test('typing in a cell still persists as plain text', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    await selectAllInCell(page)
    await page.keyboard.type('TYPED-TEXT')
    await page.keyboard.press('Enter')

    await expect
      .poll(async () => (await table(diagram, name)).cells['0,0'], {
        message: 'text typed into a cell never reached the saved document',
        timeout: 20_000,
      })
      .toBe('TYPED-TEXT')
    // Plain text must not grow a runs entry, so old clients see no change.
    expect((await table(diagram, name)).cellRuns?.['0,0'], 'plain text stored formatting runs').toBeUndefined()
  })

  test('Escape abandons an edit instead of committing it', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    await selectAllInCell(page)
    await page.keyboard.type('DISCARD-ME')
    await page.keyboard.press('Escape')

    // Give autosave the same room the committing tests get, then assert nothing moved.
    await page.waitForTimeout(3000)
    expect((await table(diagram, name)).cells['0,0'], 'Escape committed the edit anyway').toBe('CELL-TEXT')
  })

  test('bolding the selected words persists as runs, keeping the plain text intact', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    await selectAllInCell(page)
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.press('Enter')

    await expect
      .poll(async () => (await table(diagram, name)).cellRuns?.['0,0'], {
        message: 'bolding a cell never reached the saved document',
        timeout: 20_000,
      })
      .toEqual([{ text: 'CELL-TEXT', bold: true }])
    // cells stays the plain-text source of truth.
    expect((await table(diagram, name)).cells['0,0'], 'the cell text changed while bolding it').toBe('CELL-TEXT')
  })

  test('bold applies to only the selected part of a cell', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    // The caret opens at the end; take just the last four characters ("TEXT").
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.press('Enter')

    await expect
      .poll(async () => (await table(diagram, name)).cellRuns?.['0,0'], {
        message: 'a partial bold never reached the saved document',
        timeout: 20_000,
      })
      .toEqual([{ text: 'CELL-' }, { text: 'TEXT', bold: true }])
  })

  test('the B / I / U control formats a cell from the toolbar', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    await selectAllInCell(page)
    await page.getByRole('button', { name: 'Italic' }).click()
    await page.keyboard.press('Enter')

    await expect
      .poll(async () => (await table(diagram, name)).cellRuns?.['0,0'], {
        message: 'the Italic control never reached the saved document',
        timeout: 20_000,
      })
      .toEqual([{ text: 'CELL-TEXT', italic: true }])
  })
})

// Double-click into a cell (#353, #354). Two separate faults kept this from
// working, so both document types are covered: onDoubleClick set editingCell and
// then selected the table, whose setSelection cleared it again (#353); and on the
// unified canvas the select tool never delegates to the whiteboard layer, so the
// handler was unreachable there regardless (#354).
test.describe('opening a table cell by double-click (#353, #354)', () => {
  const editor = (page) => page.locator('[role="textbox"][contenteditable]')

  for (const type of ['whiteboard', 'unified']) {
    test(`double-clicking a cell opens it for editing on a ${type} document`, async ({ page, diagram }) => {
      const name = await diagram.open(type, { table: true })
      const cell = page.getByText('CELL-TEXT').first()
      const box = await boxInWindow(page, cell, 'the seeded table cell')

      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)

      await expect(editor(page), 'double-click left no caret in the cell').toBeVisible()

      // And it is a working editor, not just a mounted one.
      await page.keyboard.press('Shift+Home')
      await page.keyboard.type('FROM-DBLCLICK')
      await page.keyboard.press('Enter')
      await expect
        .poll(async () => (await diagram.saved(name)).whiteboard.tables[0].cells['0,0'], {
          message: 'text typed after a double-click never reached the saved document',
          timeout: 20_000,
        })
        .toBe('FROM-DBLCLICK')
    })
  }

  // The unified route is deliberately narrow: only a table UNDER THE CURSOR is
  // routed to the whiteboard layer. That is still what this guards — but empty
  // canvas no longer does nothing there: it starts a canvas text element, which is
  // what the empty state has always promised and what #418 delivered.
  //
  // The property the old assertion was really protecting still holds, and is what
  // is checked here: walking away from that double-click leaves NO stray shape,
  // because an empty text element is discarded when it commits.
  test('double-clicking empty unified canvas types there, and leaves nothing if abandoned', async ({
    page,
    diagram,
  }) => {
    const name = await diagram.open('unified', { table: true })
    const before = (await diagram.saved(name)).shapes.length

    await page.mouse.dblclick(120, 700)
    await expect(editor(page), 'double-click left no caret to type into').toBeVisible()

    // Click away without typing: the element commits empty and is dropped.
    await page.mouse.click(400, 700)
    await page.waitForTimeout(2000)
    expect((await diagram.saved(name)).shapes.length, 'an empty text element was left behind').toBe(before)
  })
})

// #507: "the table is really looking bad… the cursor comes at the top, then the
// text is vertically centred, text is red by default." Three defects in one
// component, which is what happens when the editor is styled independently of the
// renderer it commits to. These read COMPUTED STYLE rather than the document,
// because that is where the mismatch lived — the model was right the whole time.
test.describe('a table cell is typed in the same type it commits to (#507)', () => {
  // The committed <text> for a cell, and the editor open over it.
  const committed = (page) => page.locator('svg text').filter({ hasText: 'CELL-TEXT' }).first()
  const editorEl = (page) => page.locator('[role="textbox"][contenteditable]')

  test('the editor draws in the table’s colour, not a chrome grey', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { table: true })
    const committedFill = await committed(page).evaluate((node) => getComputedStyle(node).fill)

    await openCell(page)
    const editorColor = await editorEl(page).evaluate((node) => getComputedStyle(node).color)

    // Same colour in both states, so committing changes nothing about the text.
    expect(editorColor, 'the cell changes colour when it commits').toBe(committedFill)
  })

  test('the editor uses the size the committed text is drawn at', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { table: true })
    const committedSize = await committed(page).evaluate((node) => getComputedStyle(node).fontSize)

    await openCell(page)
    const editorSize = await editorEl(page).evaluate((node) => getComputedStyle(node).fontSize)

    expect(editorSize).toBe(committedSize)
  })

  test('the caret sits centred in an EMPTY cell, not at the top', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { table: true })
    await openCell(page)
    // Empty the cell: with no text node there is no flex item, which is exactly
    // the state where the caret used to fall to the top of the box.
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press('Backspace')

    const box = await editorEl(page).evaluate((node) => {
      const style = getComputedStyle(node)
      return { line: parseFloat(style.lineHeight), height: node.getBoundingClientRect().height }
    })
    // One line box filling the cell is what centres the caret whether or not
    // anything has been typed.
    expect(Math.abs(box.line - box.height), 'the line box does not fill the cell').toBeLessThan(2)
  })
})

// #508: a cell gets the same text options a text box has. Colour and alignment used
// to live on the TABLE only, so "this cell in red" was impossible — they are per
// cell now, with the table's value as the default an untouched cell follows.
test.describe('per-cell text options (#508)', () => {
  const table = async (diagram, name) => (await diagram.saved(name)).whiteboard.tables[0]

  // Scoped to the canvas toolbar AND exact. Both matter: the fixture names each
  // diagram after its own test, so the title button's accessible name contains the
  // test's words — and getByRole matches substrings by default, which made a test
  // called "strikethrough persists…" match the title as well as the control.
  const control = (page, name) =>
    page.locator('[data-canvas-toolbar]').getByRole('button', { name, exact: true })

  test('strikethrough persists as a run, like the other three marks', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    await selectAllInCell(page)
    await control(page, 'Strikethrough').click()
    // Enter COMMITS. Escape abandons the edit — there is a test in this file that
    // says so, and using it here asserted a mark had persisted after cancelling it.
    await page.keyboard.press('Enter')

    await expect
      .poll(async () => (await table(diagram, name)).cellRuns?.['0,0']?.[0]?.strike, {
        message: 'strikethrough never reached the saved cell',
        timeout: 20_000,
      })
      .toBe(true)
    // The plain text is untouched by a mark, which is the runs model's contract.
    expect((await table(diagram, name)).cells['0,0']).toBe('CELL-TEXT')
  })

  test('a colour picked for one cell lands on that cell, not the table', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })
    const before = (await table(diagram, name)).color

    await openCell(page)
    await control(page, 'Cell text colour').click()
    await page.getByRole('button', { name: 'blue 500', exact: true }).click()

    await expect
      .poll(async () => (await table(diagram, name)).cellStyles?.['0,0']?.color, {
        message: 'the cell colour never reached the document',
        timeout: 20_000,
      })
      .toBe('#0289F7')
    // The table's own colour is the default other cells still follow.
    expect((await table(diagram, name)).color).toBe(before)
  })

  test('alignment is per cell too', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { table: true })

    await openCell(page)
    await control(page, 'Align center').click()

    await expect
      .poll(async () => (await table(diagram, name)).cellStyles?.['0,0']?.align, {
        message: 'the cell alignment never reached the document',
        timeout: 20_000,
      })
      .toBe('center')
    expect((await table(diagram, name)).align, 'the table itself moved').not.toBe('center')
  })
})
