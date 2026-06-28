<script setup>
// Keyboard shortcuts cheat-sheet (press ?). A reference of every shortcut,
// grouped, with platform-correct modifier labels (⌘ on Mac, Ctrl elsewhere).
import { computed } from 'vue'
import { Dialog } from 'frappe-ui'
import { shortcutsOpen } from '@/composables/useShortcutsHelp.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
const mod = isMac ? '⌘' : 'Ctrl'

const groups = computed(() => [
  {
    title: 'Essentials',
    items: [
      [`${mod} Z`, 'Undo'],
      [`${mod} ${isMac ? '⇧ Z' : 'Y'}`, 'Redo'],
      [`${mod} C / X / V`, 'Copy / Cut / Paste'],
      [`${mod} D`, 'Duplicate'],
      [`${mod} A`, 'Select all'],
      ['Delete / Backspace', 'Delete selection'],
      ['Esc', 'Deselect · cancel tool · exit edit'],
    ],
  },
  {
    title: 'Move & arrange',
    items: [
      ['Arrow keys', 'Nudge 1px'],
      ['⇧ Arrow', 'Nudge 10px'],
      ['Alt-drag', 'Duplicate & drag'],
      ['Drag on empty', 'Marquee select'],
      ['⇧ click', 'Add / remove from selection'],
    ],
  },
  {
    title: 'Create',
    items: [
      ['Double-click', 'Add text / edit'],
      ['Click a shape, drag', 'Move'],
      ['?', 'This shortcuts sheet'],
    ],
  },
  {
    title: 'Mind map',
    items: [
      ['Tab', 'Add child'],
      ['Enter', 'Add sibling'],
    ],
  },
  {
    title: 'Flowchart',
    items: [
      ['Enter', 'Add Process'],
      ['D', 'Add Decision'],
    ],
  },
  {
    title: 'Whiteboard tools',
    items: [
      ['P / H / E', 'Pen / Highlighter / Eraser'],
      ['N / G', 'Line / Table'],
      ['L / S', 'Laser / Sticky'],
    ],
  },
])
</script>

<template>
  <Dialog v-model="shortcutsOpen" :options="{ title: 'Keyboard shortcuts', size: '3xl' }">
    <template #body-content>
      <div class="grid grid-cols-2 gap-x-8 gap-y-5">
        <section v-for="g in groups" :key="g.title">
          <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-gray-5">{{ g.title }}</h3>
          <div class="flex flex-col gap-1.5">
            <div v-for="(row, i) in g.items" :key="i" class="flex items-center justify-between gap-3">
              <span class="text-[13px] text-ink-gray-7">{{ row[1] }}</span>
              <kbd class="whitespace-nowrap rounded-md border border-outline-gray-2 bg-surface-gray-2 px-2 py-0.5 text-[11px] font-medium text-ink-gray-8">{{ row[0] }}</kbd>
            </div>
          </div>
        </section>
      </div>
    </template>
  </Dialog>
</template>
