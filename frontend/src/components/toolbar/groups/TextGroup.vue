<script setup>
// Text formatting for the current block selection (#361): font, size, the four
// marks, alignment, colour and auto-fit.
//
// This group is shown for a shape whether or not its label is being edited. It
// IS the text-only menu while editing (#259), and part of the shape menu
// otherwise — which is why every control drives the live rich-text editor when
// one is open and the shape-level base style when it is not.
import { computed } from 'vue'
import { Popover, Select } from 'frappe-ui'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import { richCommands, isMarkActive } from '@/composables/useRichText.js'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'
import ToolbarButton from '../ToolbarButton.vue'

// textShapes, not every selected shape (#519): a mixed selection of an image and a
// rectangle reads and writes the rectangle's label, and passes the image by. Reading
// shapes[0] meant an image first in the selection reported a font and a size it had
// no way to carry.
const { store, textShapes, editing } = useBlockSelection()
const textIds = computed(() => textShapes.value.map((shape) => shape.id))

// Espresso defines exactly two typefaces (design/colors_and_type.css): the Inter
// sans stack and a mono stack. Those two now match it character for character (#475).
//
// Inter used to be `value: ''`, which inherited whatever the canvas happened to be
// set in rather than naming a stack. Mono was Espresso's list minus 'JetBrains Mono'.
//
// Serif and Handwritten have no Espresso equivalent and stay as canvas-only extras —
// CLAUDE.md cardinal rule 2 makes the SVG canvas the explicit exception to chrome
// tokens, so the canvas is allowed a look of its own.
//
// "Rounded" is gone. Its stack asked for Nunito, which was never loaded anywhere in
// the app — no @font-face, no import — so it fell back to Segoe UI on Windows and
// plain system-ui on macOS and had never once rendered as anything rounded. An
// option that does nothing is worse than one fewer option, and shipping a webfont to
// rescue it was not worth the download.
const ESPRESSO_SANS = "'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
const ESPRESSO_MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace"

const FONTS = [
  { label: 'Inter', value: ESPRESSO_SANS },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: ESPRESSO_MONO },
  { label: 'Handwritten', value: "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive" },
]
const MARKS = [
  { name: 'bold', label: 'Bold', icon: 'lucide-bold' },
  { name: 'italic', label: 'Italic', icon: 'lucide-italic' },
  { name: 'underline', label: 'Underline', icon: 'lucide-underline' },
  { name: 'strike', label: 'Strikethrough', icon: 'lucide-strikethrough' },
]
const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: 'lucide-text-align-start' },
  { value: 'center', label: 'Align center', icon: 'lucide-text-align-center' },
  { value: 'right', label: 'Align right', icon: 'lucide-text-align-end' },
]

const textRef = computed(() => textShapes.value[0])
const textStyle = computed(() => textRef.value?.text?.style || {})
const textAlign = computed(() => textRef.value?.text?.align || 'center')
// An unset font IS Inter, so it resolves to Inter's stack. Left as '', it would
// match no option now that Inter names a real one, and the Select would show blank
// on every shape that has never had a font chosen — which is most of them.
const font = computed(() => textStyle.value.font || ESPRESSO_SANS)
const fontSize = computed(() => textStyle.value.size ?? 16)
const autoFit = computed(() => Boolean(textRef.value?.text?.autoFit))
const currentTextColor = computed(() => textStyle.value.color || '#171717')

function updateTextStyle(patch) {
  if (textIds.value.length) store.updateShapes(textIds.value, { text: { style: patch } })
}

function markText(name) {
  if (!editing.value) return updateTextStyle({ [name]: !textStyle.value[name] })
  if (name === 'bold') richCommands.toggleBold()
  else if (name === 'italic') richCommands.toggleItalic()
  else if (name === 'underline') richCommands.toggleUnderline()
  else if (name === 'strike') richCommands.toggleStrike()
}

function markActive(name) {
  return editing.value ? isMarkActive(name) : Boolean(textStyle.value[name])
}

function setTextAlign(value) {
  if (editing.value) richCommands.setAlign(value)
  else if (textIds.value.length) store.updateShapes(textIds.value, { text: { align: value } })
}

function alignActive(value) {
  return editing.value ? isMarkActive(null, { textAlign: value }) : textAlign.value === value
}

// The alignment trigger wears whichever of the three is set, so folding them
// into a menu does not also hide which one is on. While a label is being edited
// the answer comes from the live editor, which can report none of them (a fresh
// paragraph with no explicit alignment) — hence the fallback rather than an
// assumption that one always matches.
const currentAlignment = computed(
  () => ALIGNMENTS.find((alignment) => alignActive(alignment.value)) || ALIGNMENTS[1],
)

function stepFontSize(delta) {
  updateTextStyle({ size: Math.max(6, Math.min(200, Number(fontSize.value) + delta)) })
}

function setFont(value) {
  updateTextStyle({ font: value })
}

function toggleAutoFit() {
  if (textIds.value.length) store.updateShapes(textIds.value, { text: { autoFit: !autoFit.value } })
}

// Recolours the caret selection live while editing, else sets the shape's base
// text colour across the whole selection (#259).
function setTextColor(hex) {
  if (!hex) return
  if (editing.value) richCommands.setColor(hex)
  else updateTextStyle({ color: hex })
}
</script>

<template>
  <Select :model-value="font" :options="FONTS" class="h-7 w-[92px]" @update:model-value="setFont" @mousedown.stop />

  <div class="flex items-center rounded-md border border-outline-gray-2">
    <ToolbarButton class="!w-6" label="Decrease font size" icon="lucide-minus" @click="stepFontSize(-1)" />
    <span class="w-6 text-center text-sm tabular-nums text-ink-gray-8">{{ fontSize }}</span>
    <ToolbarButton class="!w-6" label="Increase font size" icon="lucide-plus" @click="stepFontSize(1)" />
  </div>

  <ToolbarButton
    v-for="mark in MARKS"
    :key="mark.name"
    :label="mark.label"
    :icon="mark.icon"
    :active="markActive(mark.name)"
    @click="markText(mark.name)"
  />

  <!-- One entry, opening the three. Left / centre / right as three buttons cost
       96px of a bar that overflowed a 1280px screen by 155px, and the trigger
       still shows which alignment is set, so the state stays readable without
       opening it. -->
  <Popover>
    <template #trigger>
      <ToolbarButton :label="currentAlignment.label" :icon="currentAlignment.icon" />
    </template>
    <template #default="{ toggle }">
      <div class="flex gap-1 p-1">
        <ToolbarButton
          v-for="alignment in ALIGNMENTS"
          :key="alignment.value"
          :label="alignment.label"
          :icon="alignment.icon"
          :active="alignActive(alignment.value)"
          @click="setTextAlign(alignment.value); toggle()"
        />
      </div>
    </template>
  </Popover>

  <Popover>
    <template #trigger>
      <ToolbarButton label="Text colour">
        <template #icon>
          <span class="grid size-4 place-items-center rounded text-xs font-semibold" :style="{ color: currentTextColor }">A</span>
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="p-1">
        <EspressoSwatchGrid mode="fill" :allow-none="false" :model-value="currentTextColor" @select="setTextColor" />
      </div>
    </template>
  </Popover>

  <ToolbarButton
    label="Auto-fit text to shape"
    icon="lucide-scaling"
    :active="autoFit"
    @click="toggleAutoFit"
  />
</template>
