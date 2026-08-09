<script setup>
// Floating contextual toolbar for block diagrams — replaces the right palette.
// Hovers just above the current selection with the common edit actions; the
// heavier controls live in popovers (fill/border, text, arrange, link, opacity),
// each reusing the existing modification sections so all logic (incl. multi-
// select intersection) is shared. Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Button, Divider, Popover, Select, TabButtons } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { anchorPoint, unionBounds } from '@/diagram/geometry.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { isDragging } from '@/composables/useShapeTransform.js'
import { activeEditor, richCommands, isMarkActive } from '@/composables/useRichText.js'
import { isMindmapShape } from '@/diagram/freeFloating.js'
import { hasFill, hasBorder } from '@/diagram/mindmapNodeStyle.js'
import { inkFor } from '@/diagram/espressoPalette.js'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'
import FillBorderSection from '@/components/palette-right/FillBorderSection.vue'
import ArrangeSection from '@/components/palette-right/ArrangeSection.vue'
import AlignSection from '@/components/palette-right/AlignSection.vue'
import DistributeSizeSection from '@/components/palette-right/DistributeSizeSection.vue'
import TransformSection from '@/components/palette-right/TransformSection.vue'
import LinkSection from '@/components/palette-right/LinkSection.vue'
import TransparencySection from '@/components/palette-right/TransparencySection.vue'
import ConnectorSection from '@/components/palette-right/ConnectorSection.vue'

const store = useDiagramStore()

const selection = computed(() => store.state.selection || [])
const shapes = computed(() => selection.value.map((id) => store.shapeById(id)).filter(Boolean))
const count = computed(() => selection.value.length)

// A lone selected connector gets its line controls instead of shape controls.
const connector = computed(() =>
  count.value === 1 ? store.connectorById(selection.value[0]) || null : null,
)
const hasShapes = computed(() => shapes.value.length > 0)
// Align + distribute act between shapes, so they only apply to a multi-selection.
const multi = computed(() => shapes.value.length >= 2)
const primaryFill = computed(() => shapes.value[0]?.fill || '#ffffff')
const primaryBorder = computed(() => shapes.value[0]?.border?.color || '#171717')

// Resolve a connector endpoint to a concrete world point: attached ends
// ({shapeId,anchor}) follow the shape's anchor; free ends carry {x,y}.
function resolveEndpoint(endpoint) {
  if (!endpoint) return null
  if (endpoint.shapeId) {
    const shape = store.shapeById(endpoint.shapeId)
    if (shape) return anchorPoint(shape, endpoint.anchor || 'right')
  }
  if (typeof endpoint.x === 'number' && typeof endpoint.y === 'number') {
    return { x: endpoint.x, y: endpoint.y }
  }
  return null
}

// Selection bounding box in canvas coords (shapes: x/y/w/h; connector: endpoints).
const box = computed(() => {
  if (hasShapes.value) {
    return unionBounds(shapes.value.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })))
  }
  if (connector.value) {
    // Resolve each endpoint to a concrete point: attached ends carry
    // {shapeId,anchor} with null x/y, so use the shape's anchor point (mirrors
    // ConnectorView.resolve). Feeding the raw nulls to Math.min would coerce to
    // 0 and pin the toolbar to the canvas origin.
    const pts = [connector.value.from, connector.value.to].map(resolveEndpoint).filter(Boolean)
    if (!pts.length) return null
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  return null
})

const style = useCanvasToolbarStyle(box)

function duplicate() {
  const ids = store.duplicate(selection.value)
  if (ids?.length) store.select(ids)
}
function remove() {
  store.removeSelectionOrIds(selection.value)
}

// ---- inline text formatting (surfaced directly on the bar for one-click edits).
// Drives the live rich-text editor when a text box is being edited, else the
// shape-level base style across the whole selection. Mirrors TextSection.
const FONTS = [
  { label: 'Inter', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { label: 'Rounded', value: '"Nunito", "Segoe UI", system-ui, sans-serif' },
  { label: 'Handwritten', value: "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive" },
]
const editing = computed(() => Boolean(activeEditor.value))
const shapeIds = computed(() => shapes.value.map((s) => s.id))
const textRef = computed(() => shapes.value[0])
const textStyle = computed(() => textRef.value?.text?.style || {})
const textAlign = computed(() => textRef.value?.text?.align || 'center')
const font = computed(() => textStyle.value.font || '')
const fontSize = computed(() => textStyle.value.size ?? 16)
const autoFit = computed(() => Boolean(textRef.value?.text?.autoFit))
function updateTextStyle(patch) {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { text: { style: patch } })
}
function markText(name) {
  if (editing.value) {
    if (name === 'bold') richCommands.toggleBold()
    else if (name === 'italic') richCommands.toggleItalic()
    else if (name === 'underline') richCommands.toggleUnderline()
    else if (name === 'strike') richCommands.toggleStrike()
  } else updateTextStyle({ [name]: !textStyle.value[name] })
}
function markActive(name) {
  return editing.value ? isMarkActive(name) : Boolean(textStyle.value[name])
}
function setTextAlign(value) {
  if (editing.value) richCommands.setAlign(value)
  else if (shapeIds.value.length) store.updateShapes(shapeIds.value, { text: { align: value } })
}
function alignActive(value) {
  return editing.value ? isMarkActive(null, { textAlign: value }) : textAlign.value === value
}
function stepFontSize(delta) {
  const next = Math.max(6, Math.min(200, Number(fontSize.value) + delta))
  updateTextStyle({ size: next })
}
function setFont(value) {
  updateTextStyle({ font: value })
}
function toggleAutoFit() {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { text: { autoFit: !autoFit.value } })
}

// Text colour (#259): while editing it recolours the caret/selection live, else it
// sets the shape's base text colour across the selection.
const currentTextColor = computed(() => textStyle.value.color || '#171717')
function setTextColor(hex) {
  if (!hex) return
  if (editing.value) richCommands.setColor(hex)
  else updateTextStyle({ color: hex })
}

const panel = 'max-h-[70vh] w-[300px] overflow-y-auto'

// ---- mind-map node overrides (#274 / #260). A node selection swaps the full
// colour picker for the curated Espresso grid and exposes a per-node corner curve.
const isNodeSelection = computed(() => hasShapes.value && shapes.value.every((s) => isMindmapShape(s)))
const nodeCurve = computed(() => shapes.value[0]?.mindmap?.curve || 'moderate')
const curveOptions = [
  { label: 'None', value: 'none' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'High', value: 'high' },
]

// Set a node's fill from the grid: a colour boxes it (keeping text readable), "None"
// (null) clears it — the node stays shaped only while it still has a border.
function setNodeFill(hex) {
  const ids = shapeIds.value
  if (!ids.length) return
  if (hex === null) store.updateShapes(ids, { fill: 'none', mindmap: { shaped: hasBorder(shapes.value[0]) } })
  else store.updateShapes(ids, { fill: hex, text: { style: { color: inkFor(hex) } }, mindmap: { shaped: true } })
}

// Set a node's border colour from the grid; "None" (null) removes the stroke, and
// the node stays shaped only while it still has a fill.
function setNodeBorder(hex) {
  const ids = shapeIds.value
  if (!ids.length) return
  if (hex === null) {
    store.updateShapes(ids, { border: { color: 'transparent', width: 0 }, mindmap: { shaped: hasFill(shapes.value[0]) } })
  } else {
    const width = shapes.value[0]?.border?.width > 0 ? shapes.value[0].border.width : 1.5
    store.updateShapes(ids, { border: { color: hex, width }, mindmap: { shaped: true } })
  }
}

function setNodeCurve(value) {
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { mindmap: { curve: value } })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="count && box && !isDragging"
      data-block-toolbar
      class="fixed z-30 flex max-w-[50vw] -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="style"
    >
      <!-- Connector selected: just its line controls. -->
      <template v-if="connector">
        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-minus" tooltip="Line" label="Line" @mousedown.prevent />
          </template>
          <template #default><div :class="panel"><ConnectorSection :connector="connector" /></div></template>
        </Popover>
      </template>

      <!-- Shapes selected: fill+border+opacity, text, arrange, link. While editing
           TEXT the shape controls hide and the bar becomes a text-only menu (#259). -->
      <template v-else-if="hasShapes">
        <template v-if="!editing">
        <!-- Fill and Border are separate menu items (each opens its own colour
             picker); opacity lives with Fill. -->
        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" tooltip="Fill" label="Fill" @mousedown.prevent>
              <template #icon>
                <span class="h-4 w-4 rounded-full border border-outline-gray-4" :style="{ background: primaryFill }" />
              </template>
            </Button>
          </template>
          <template #default>
            <div :class="panel">
              <EspressoSwatchGrid v-if="isNodeSelection" mode="fill" :model-value="primaryFill" @select="setNodeFill" />
              <template v-else><FillBorderSection mode="fill" /><TransparencySection /></template>
            </div>
          </template>
        </Popover>

        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" tooltip="Border" label="Border" @mousedown.prevent>
              <template #icon>
                <span class="h-4 w-4 rounded-full border-[3px] bg-surface-base" :style="{ borderColor: primaryBorder }" />
              </template>
            </Button>
          </template>
          <template #default>
            <div :class="panel">
              <EspressoSwatchGrid v-if="isNodeSelection" mode="border" :model-value="primaryBorder" @select="setNodeBorder" />
              <FillBorderSection v-else mode="border" />
            </div>
          </template>
        </Popover>

        <!-- Per-node corner curve (#260), only for mind-map nodes. -->
        <Popover v-if="isNodeSelection" side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-spline" tooltip="Corners" label="Corners" @mousedown.prevent />
          </template>
          <template #default>
            <div class="p-2">
              <TabButtons size="sm" :model-value="nodeCurve" :options="curveOptions" @update:model-value="setNodeCurve" />
            </div>
          </template>
        </Popover>

        <Divider orientation="vertical" class="mx-0.5 !h-5" />
        </template>

        <!-- Text formatting: font, size, B/I/U/S, align, colour. Always shown for a
             shape — this IS the text-only menu while editing text (#259), and part of
             the shape menu otherwise. -->
        <Select :model-value="font" :options="FONTS" class="h-8 w-[92px]" @update:model-value="setFont" @mousedown.stop />
        <div class="flex items-center rounded-md border border-outline-gray-2">
          <Button variant="ghost" theme="gray" size="md" class="!w-6" icon="lucide-minus" label="Decrease font size" @mousedown.prevent @click="stepFontSize(-1)" />
          <span class="w-6 text-center text-sm tabular-nums text-ink-gray-8">{{ fontSize }}</span>
          <Button variant="ghost" theme="gray" size="md" class="!w-6" icon="lucide-plus" label="Increase font size" @mousedown.prevent @click="stepFontSize(1)" />
        </div>
        <Button :variant="markActive('bold') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-bold" tooltip="Bold" label="Bold" @mousedown.prevent @click="markText('bold')" />
        <Button :variant="markActive('italic') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-italic" tooltip="Italic" label="Italic" @mousedown.prevent @click="markText('italic')" />
        <Button :variant="markActive('underline') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-underline" tooltip="Underline" label="Underline" @mousedown.prevent @click="markText('underline')" />
        <Button :variant="markActive('strike') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-strikethrough" tooltip="Strikethrough" label="Strikethrough" @mousedown.prevent @click="markText('strike')" />
        <Button :variant="alignActive('left') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-text-align-start" tooltip="Align left" label="Align left" @mousedown.prevent @click="setTextAlign('left')" />
        <Button :variant="alignActive('center') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-text-align-center" tooltip="Align center" label="Align center" @mousedown.prevent @click="setTextAlign('center')" />
        <Button :variant="alignActive('right') ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-text-align-end" tooltip="Align right" label="Align right" @mousedown.prevent @click="setTextAlign('right')" />
        <!-- Text colour (#259): a coloured "A" opens the Espresso grid. -->
        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" tooltip="Text colour" label="Text colour" @mousedown.prevent>
              <template #icon>
                <span class="grid size-4 place-items-center rounded text-xs font-semibold" :style="{ color: currentTextColor }">A</span>
              </template>
            </Button>
          </template>
          <template #default>
            <div class="p-1"><EspressoSwatchGrid mode="fill" :allow-none="false" :model-value="currentTextColor" @select="setTextColor" /></div>
          </template>
        </Popover>
        <Button :variant="autoFit ? 'subtle' : 'ghost'" theme="gray" size="md" icon="lucide-scaling" tooltip="Auto-fit text to shape" label="Auto-fit text to shape" @mousedown.prevent @click="toggleAutoFit" />

        <template v-if="!editing">
        <Divider orientation="vertical" class="mx-0.5 !h-5" />

        <!-- Arrange / Align / Distribute / Transform are separate menu items, not
             one crammed leaf; each opens just its own section. -->
        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-layers" tooltip="Arrange" label="Arrange" @mousedown.prevent />
          </template>
          <template #default><div :class="panel"><ArrangeSection /></div></template>
        </Popover>

        <!-- Align & distribute act between shapes — only for a multi-selection,
             so a lone shape doesn't open an empty menu. -->
        <Popover v-if="multi" side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-align-center-horizontal" tooltip="Align" label="Align" @mousedown.prevent />
          </template>
          <template #default><div :class="panel"><AlignSection /></div></template>
        </Popover>

        <Popover v-if="multi" side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-columns-2" tooltip="Distribute & size" label="Distribute & size" @mousedown.prevent />
          </template>
          <template #default><div :class="panel"><DistributeSizeSection /></div></template>
        </Popover>

        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-flip-horizontal-2" tooltip="Transform" label="Transform" @mousedown.prevent />
          </template>
          <template #default><div :class="panel"><TransformSection /></div></template>
        </Popover>

        <Popover side="top">
          <template #trigger>
            <Button variant="ghost" theme="gray" size="md" icon="lucide-link" tooltip="Link" label="Link" @mousedown.prevent />
          </template>
          <template #default>
            <div :class="panel">
              <LinkSection />
            </div>
          </template>
        </Popover>

        <Divider orientation="vertical" class="mx-0.5 !h-5" />

        <Button variant="ghost" theme="gray" size="md" icon="lucide-copy" tooltip="Duplicate" label="Duplicate" @mousedown.prevent @click="duplicate" />
        </template>
      </template>

      <!-- Delete hides while editing text — you're editing the label, not the shape. -->
      <Button v-if="!editing" variant="ghost" theme="red" size="md" icon="lucide-trash-2" tooltip="Delete" label="Delete" @mousedown.prevent @click="remove" />
    </div>
  </Teleport>
</template>
