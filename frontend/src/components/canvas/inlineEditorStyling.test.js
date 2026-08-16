import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// One habit, two components (#496, #507): an inline editor styled independently of
// the renderer it commits to. The drift is only visible while the editor is open,
// which is why it survives review — the screenshot afterwards looks correct.
//
// | Component | Editing | Committed |
// |---|---|---|
// | connector label | left-aligned | text-anchor="middle" |
// | table cell | text-ink-gray-9, 14px by luck | table.color, font-size="14" |
//
// Asserted by source inspection: this repo keeps unit tests browser-free (node env,
// no @vue/test-utils), the same way canvasToolbar.test.js does. Comments are
// stripped first, because the comments in both files NAME the values being asserted
// gone — that is what a comment recording a removal is for.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) =>
  readFileSync(path.join(here, rel), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the table cell editor matches the cell it commits to (#507)', () => {
  const source = read('WhiteboardTable.vue')

  // The property has not changed — the editor and the committed text read ONE
  // source — but #508 moved that source into the model, where a cell can override
  // the table. So these assert the same thing against its new home.
  it('sets the editor’s colour from the same place the cell is drawn from', () => {
    // A cell was typed in near-black and committed in the table's colour.
    expect(source).not.toContain('text-ink-gray-9')
    expect(source).toContain('tableCellStyle(')
    expect(source).toContain('color: editingStyle.value?.color')
  })

  it('takes one font size for both the editor and the committed text', () => {
    // They agreed at 14 by coincidence — font-size="14" against text-sm — not by
    // construction, so either could move on its own. Both now read the cell's size,
    // which falls back to the model's TABLE_FONT_SIZE.
    expect(source).toContain('TABLE_FONT_SIZE')
    expect(source).toContain(':font-size="cell.size"')
    expect(source).toContain('fontSize: `${editingStyle.value?.size')
    expect(source).not.toContain('text-sm')
  })

  it('centres the caret with a line box rather than a flex item', () => {
    // `items-center` has nothing to centre in an EMPTY cell: no text node, no flex
    // item, so the caret fell to the top and jumped to the middle on the first
    // keystroke. A full-height line box centres it either way.
    const editor = source.slice(source.indexOf('contenteditable="true"'))
    const tag = editor.slice(0, editor.indexOf('/>'))
    expect(tag).not.toContain('items-center')
    expect(source).toContain('lineHeight')
  })
})

describe('the connector label editor matches the label it commits to (#496)', () => {
  const source = read('ConnectorView.vue')

  it('reaches the real input, since a bare class lands on TextInput’s wrapper', () => {
    // TextInput sets inheritAttrs: false and filters class/style out of the attrs
    // it hands the <input>, so `text-center` styled a div and the text stayed left.
    expect(source).toContain('[&_input]:text-center')
    expect(source).not.toContain('class="w-full text-center"')
  })

  it('still commits the label centred, which is what the editor now matches', () => {
    expect(source).toContain('text-anchor="middle"')
  })
})

describe('an inserted table is not ink (#507)', () => {
  const composables = (file) => read(`../../composables/${file}`)

  // The model default is #171717 and so is PEN_COLORS[0], so this only ever showed
  // up for someone who had drawn in another colour first: draw in red, insert a
  // table, get red table text. That is also why a test that simply inserts a table
  // would pass with the bug still in place — the call site is the thing to pin.
  it('passes no pen colour from either insert path', () => {
    for (const file of ['useInsertCatalog.js', 'useWhiteboardInteraction.js']) {
      const source = composables(file)
      const call = source.slice(source.indexOf('addTable('))
      const args = call.slice(0, call.indexOf('})') + 2)
      expect(args, `${file} still hands the table the pen's colour`).not.toContain('penColor')
    }
  })
})
