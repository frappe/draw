<script setup>
// Keyboard shortcuts cheat-sheet (press ?). A reference of every shortcut,
// grouped. Key chips render through frappe-ui's <KeyboardShortcut>, which
// resolves `Mod` to ⌘ or Ctrl per platform — so nothing here branches on the
// platform except Redo, whose BINDING (not just its glyph) differs.
//
// Rows are either a combo (`combo`, plus `alt` for equivalent alternatives) or
// free-form guidance ('Arrow keys', 'Alt-drag', 'Drag on empty'), which is not a
// key combination and stays plain text.
import { computed } from 'vue'
import { Dialog, KeyboardShortcut } from 'frappe-ui'
import { shortcutsOpen } from '@/composables/useShortcutsHelp.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

const groups = computed(() => [
  {
    title: 'Essentials',
    items: [
      { combo: 'Mod+Z', label: 'Undo' },
      isMac ? { combo: 'Mod+Shift+Z', label: 'Redo' } : { combo: 'Ctrl+Y', label: 'Redo' },
      { combo: 'Mod+C', alt: ['Mod+X', 'Mod+V'], label: 'Copy / Cut / Paste' },
      { combo: 'Mod+D', label: 'Duplicate' },
      { combo: 'Mod+A', label: 'Select all' },
      { combo: 'Delete', alt: ['Backspace'], label: 'Delete selection' },
      { combo: 'Esc', label: 'Deselect · cancel tool · exit edit' },
    ],
  },
  {
    title: 'Move & arrange',
    items: [
      { text: 'Arrow keys', label: 'Nudge 1px' },
      { text: '⇧ Arrow', label: 'Nudge 10px' },
      { text: 'Alt-drag', label: 'Duplicate & drag' },
      { text: 'Drag on empty', label: 'Marquee select' },
      { text: '⇧ click', label: 'Add / remove from selection' },
    ],
  },
  {
    title: 'Create',
    items: [
      { text: 'Double-click', label: 'Add text / edit' },
      { text: 'Click a shape, drag', label: 'Move' },
      { combo: '?', label: 'This shortcuts sheet' },
    ],
  },
  {
    title: 'Mind map',
    items: [
      { combo: 'Tab', label: 'Add child' },
      { combo: 'Enter', label: 'Add sibling' },
    ],
  },
  {
    title: 'Flowchart',
    items: [
      { combo: 'Enter', label: 'Add Process' },
      { combo: 'D', label: 'Add Decision' },
    ],
  },
  {
    title: 'Whiteboard tools',
    items: [
      { combo: 'P', alt: ['H', 'E'], label: 'Pen / Highlighter / Eraser' },
      { combo: 'N', alt: ['G'], label: 'Line / Table' },
      { combo: 'L', alt: ['S'], label: 'Laser / Sticky' },
    ],
  },
])
</script>

<template>
  <Dialog v-model:open="shortcutsOpen" title="Keyboard shortcuts" size="3xl">
    <template #default>
      <div class="grid grid-cols-2 gap-x-8 gap-y-5">
        <section v-for="g in groups" :key="g.title">
          <h3 class="mb-2 text-sm font-semibold text-ink-gray-5">{{ g.title }}</h3>
          <div class="flex flex-col gap-1.5">
            <div v-for="(row, i) in g.items" :key="i" class="flex items-center justify-between gap-3">
              <span class="text-sm text-ink-gray-7">{{ row.label }}</span>
              <KeyboardShortcut
                v-if="row.combo"
                bg
                :combo="row.combo"
                :alt-combos="row.alt || []"
                class="shrink-0"
              />
              <span v-else class="shrink-0 whitespace-nowrap text-sm text-ink-gray-5">{{ row.text }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </Dialog>
</template>
