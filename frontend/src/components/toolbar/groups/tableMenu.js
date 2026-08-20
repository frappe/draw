// The table actions menu (#553): insert / delete rows and columns, make the
// selected rows the header, clear the cells, delete the table. Pure — it takes
// what is selected and the handlers to call, and returns frappe-ui MenuOptions —
// so the wording and the grouping can be tested without mounting the toolbar.
//
// Icon names are complete lucide classes: the Tailwind preset reads them
// literally out of the source, so they cannot be assembled at runtime.

// "row" / "2 rows" — the menu says how much a delete is about to take.
function plural(count, noun) {
  return count > 1 ? `${count} ${noun}s` : noun
}

export function tableMenuOptions({
  rowCount = 1,
  columnCount = 1,
  isHeader = false,
  isHeaderColumn = false,
  actions,
}) {
  return [
    {
      group: 'Rows',
      key: 'rows',
      options: [
        { label: 'Insert row above', icon: 'lucide-arrow-up', onClick: actions.insertRowAbove },
        { label: 'Insert row below', icon: 'lucide-arrow-down', onClick: actions.insertRowBelow },
        {
          label: isHeader ? 'Remove header row' : 'Make header row',
          icon: 'lucide-heading',
          onClick: actions.toggleHeaderRows,
        },
        {
          label: `Delete ${plural(rowCount, 'row')}`,
          icon: 'lucide-trash-2',
          onClick: actions.deleteRows,
        },
      ],
    },
    {
      group: 'Columns',
      key: 'columns',
      options: [
        { label: 'Insert column left', icon: 'lucide-arrow-left', onClick: actions.insertColumnBefore },
        { label: 'Insert column right', icon: 'lucide-arrow-right', onClick: actions.insertColumnAfter },
        {
          label: isHeaderColumn ? 'Remove header column' : 'Make header column',
          icon: 'lucide-heading',
          onClick: actions.toggleHeaderColumns,
        },
        {
          label: `Delete ${plural(columnCount, 'column')}`,
          icon: 'lucide-trash-2',
          onClick: actions.deleteColumns,
        },
      ],
    },
    {
      group: 'Table',
      key: 'table',
      options: [
        { label: 'Clear contents', icon: 'lucide-eraser', onClick: actions.clearContents },
        { label: 'Delete table', icon: 'lucide-trash-2', onClick: actions.deleteTable },
      ],
    },
  ]
}
