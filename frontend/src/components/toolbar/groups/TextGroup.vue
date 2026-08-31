<script setup>
// Text formatting for the current block selection (#361): font, size, the four
// marks, alignment and colour. Fitting text to its shape is automatic and no
// longer a control here (#550) — see useAutoFitText.
//
// This group is shown for a shape whether or not its label is being edited. It
// IS the text-only menu while editing (#259), and part of the shape menu
// otherwise — which is why every control drives the live rich-text editor when
// one is open and the shape-level base style when it is not.
import { computed, ref, watch } from 'vue'
import { Popover, Select, TextInput } from 'frappe-ui'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import { richCommands, isMarkActive, activeTextColor } from '@/composables/useRichText.js'
import ColorPickerBody from '@/components/palette-right/ColorPickerBody.vue'
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
// Writer's compact text-colour row. It gives the common choices one-click access;
// the continuous picker below is the escape hatch for every other colour.
const WRITER_TEXT_COLORS = ['#FFB3E6', '#00B3E6', '#E6B333', '#3366E6', '#999966', '#99FF99', '#B34D4D', '#80B300']

const textRef = computed(() => textShapes.value[0])
const textStyle = computed(() => textRef.value?.text?.style || {})
const textAlign = computed(() => textRef.value?.text?.align || 'center')
// An unset font IS Inter, so it resolves to Inter's stack. Left as '', it would
// match no option now that Inter names a real one, and the Select would show blank
// on every shape that has never had a font chosen — which is most of them.
const font = computed(() => textStyle.value.font || ESPRESSO_SANS)
const fontSize = computed(() => textStyle.value.size ?? 16)
const currentTextColor = computed(() => {
  if (editing.value && activeTextColor.value) {
    return activeTextColor.value
  }
  return textStyle.value.color || '#171717'
})

// The typed draft, kept separate from `fontSize` so a half-typed value (the "3"
// on its way to "32") never round-trips through the store. Re-synced whenever
// the committed size changes from elsewhere (the +/- steppers, another shape).
const fontSizeDraft = ref(String(fontSize.value))
watch(fontSize, (value) => {
  fontSizeDraft.value = String(value)
})

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

// Applies the typed draft as the shape's base font size (#550): same clamp as
// the +/- steppers, so typing "9999" lands at the same ceiling clicking + a
// hundred times would. A draft that isn't a positive number is discarded —
// the input snaps back to the last committed size via the `fontSize` watcher.
//
// Committed on Enter only, never on blur (matching ZoomGroup's typed-value
// control) — clicking a different shape while a size is half-typed fires blur
// AFTER the canvas's pointerdown has already moved the selection, which would
// otherwise write the typed size onto whatever got clicked instead of the
// shape the user was actually editing.
function commitFontSizeDraft() {
  const parsed = Number(fontSizeDraft.value)
  if (Number.isFinite(parsed) && parsed > 0) {
    updateTextStyle({ size: Math.max(6, Math.min(200, Math.round(parsed))) })
  } else {
    fontSizeDraft.value = String(fontSize.value)
  }
}

// Blur with no Enter is a cancel: an edit abandoned by clicking elsewhere
// reverts rather than silently committing to a shape the click may have
// just changed the selection to.
function resetFontSizeDraft() {
  fontSizeDraft.value = String(fontSize.value)
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
    <TextInput
      v-model="fontSizeDraft"
      type="text"
      size="sm"
      variant="ghost"
      inputmode="numeric"
      aria-label="Font size"
      class="w-9 [&_input]:px-0 [&_input]:text-center [&_input]:tabular-nums"
      @focus="$event.target.select()"
      @keydown.enter="commitFontSizeDraft(); $event.target.blur()"
      @blur="resetFontSizeDraft"
    />
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
          <span class="grid size-4 place-items-center rounded text-sm font-semibold" :style="{ color: currentTextColor }">A</span>
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="w-[176px] p-3">
        <div class="mb-3 flex flex-wrap gap-1.5">
          <button
            v-for="color in WRITER_TEXT_COLORS"
            :key="color"
            type="button"
            class="size-3.5 rounded-full shadow-sm ring-1 ring-black/10"
            :class="currentTextColor.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-outline-gray-5 ring-offset-1' : ''"
            :style="{ background: color }"
            :aria-label="`Text colour ${color}`"
            @click="setTextColor(color)"
          />
        </div>
        <ColorPickerBody :show-quick-colors="false" :model-value="currentTextColor" @update:model-value="setTextColor" />
      </div>
    </template>
  </Popover>
</template>
