<script setup>
// First-run tour (spec 17.2): a short, dismissible walkthrough shown once per
// browser (localStorage flag). Pure orientation — a few steps covering the
// canvas, tools and shortcuts — then it never reappears. "Skip" or finishing both
// set the flag. Re-openable via the `?` shortcuts sheet is out of scope here.
import { ref, computed } from 'vue'
import { Dialog, Button, FeatherIcon } from 'frappe-ui'

const KEY = 'frappe-draw-tour-seen'

const STEPS = [
  {
    icon: 'edit-3',
    title: 'Welcome to Frappe Draw',
    body: 'Sketch block diagrams, mind maps, flowcharts and whiteboards on one fast canvas. Here are a few things to get you going.',
  },
  {
    icon: 'mouse-pointer',
    title: 'Create & arrange',
    body: 'Double-click the canvas to drop a shape and type. Drag to move — smart guides snap edges and show equal spacing. Right-click anything for quick actions.',
  },
  {
    icon: 'sliders',
    title: 'Style on the right',
    body: 'Select an object to style its fill, border, text and links in the right panel. Pick a theme or turn on snap-to-grid from the Canvas section.',
  },
  {
    icon: 'command',
    title: 'Move fast',
    body: 'Press ? any time for the full shortcut list. ⌘/Ctrl+Z undoes, number keys recolour, and Export gives you PNG, SVG, PDF or a Markdown outline.',
  },
]

function seen() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true // storage blocked → don't nag
  }
}

const open = ref(!seen())
const step = ref(0)
const current = computed(() => STEPS[step.value])
const isLast = computed(() => step.value === STEPS.length - 1)

function finish() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* ignore */
  }
  open.value = false
}

function next() {
  if (isLast.value) finish()
  else step.value += 1
}
</script>

<template>
  <Dialog v-model="open" :options="{ size: 'sm' }">
    <template #body-content>
      <div class="flex flex-col items-center px-2 py-3 text-center">
        <div class="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-gray-2">
          <FeatherIcon :name="current.icon" class="h-5 w-5 text-ink-gray-8" />
        </div>
        <h2 class="text-base font-semibold text-ink-gray-9">{{ current.title }}</h2>
        <p class="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-gray-6">{{ current.body }}</p>

        <div class="mt-4 flex items-center gap-1.5">
          <span
            v-for="(s, i) in STEPS"
            :key="i"
            class="h-1.5 w-1.5 rounded-full"
            :class="i === step ? 'bg-ink-gray-8' : 'bg-outline-gray-2'"
          />
        </div>

        <div class="mt-5 flex w-full items-center justify-between">
          <button class="text-[12px] text-ink-gray-5 hover:text-ink-gray-8" @click="finish">Skip</button>
          <Button variant="solid" @click="next">{{ isLast ? 'Get started' : 'Next' }}</Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
