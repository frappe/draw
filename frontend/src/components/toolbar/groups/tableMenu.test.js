// The table actions menu (#553): what it offers, and how it words a delete that
// is about to take more than one row or column.
import { describe, it, expect, vi } from 'vitest'
import { tableMenuOptions } from './tableMenu.js'

const actions = () =>
  Object.fromEntries(
    [
      'insertRowAbove',
      'insertRowBelow',
      'deleteRows',
      'insertColumnBefore',
      'insertColumnAfter',
      'deleteColumns',
      'toggleHeaderRows',
      'toggleHeaderColumns',
      'clearContents',
      'deleteTable',
    ].map((name) => [name, vi.fn()]),
  )

const labels = (options) => options.flatMap((group) => group.options.map((item) => item.label))

describe('tableMenuOptions', () => {
  it('offers every row, column and table action', () => {
    expect(labels(tableMenuOptions({ actions: actions() }))).toEqual([
      'Insert row above',
      'Insert row below',
      'Make header row',
      'Delete row',
      'Insert column left',
      'Insert column right',
      'Make header column',
      'Delete column',
      'Clear contents',
      'Delete table',
    ])
  })

  it('counts what a delete would take', () => {
    const menu = tableMenuOptions({ rowCount: 3, columnCount: 2, actions: actions() })
    expect(labels(menu)).toContain('Delete 3 rows')
    expect(labels(menu)).toContain('Delete 2 columns')
  })

  it('reverts rather than repeats when the selected rows are already the header', () => {
    const menu = tableMenuOptions({ isHeader: true, actions: actions() })
    expect(labels(menu)).toContain('Remove header row')
  })

  it('reverts rather than repeats when the selected columns are already the header', () => {
    const menu = tableMenuOptions({ isHeaderColumn: true, actions: actions() })
    expect(labels(menu)).toContain('Remove header column')
  })

  it('wires each entry to its action', () => {
    const handlers = actions()
    const menu = tableMenuOptions({ actions: handlers })
    for (const group of menu) for (const item of group.options) item.onClick()
    for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalled()
  })
})
