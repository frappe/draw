<script setup>
// Right-palette controls for a selected connector/line (spec §5.3): per-end
// arrowhead style (Google-Slides style), line color, width, dash and corners.
// Writes through store.updateConnector, which shallow-merges nested style/arrowheads.
//
// Every row is the same control: a row of equal cells, each drawing what it does
// rather than naming it, with the name in a tooltip (#493). Dash and Corners used to
// be frappe-ui TabButtons carrying words, which read as a different kind of control
// from the icon rows directly above them — and brought the native browser tooltip
// with them (#497).
//
// There is no label field: a connector's label is added by double-clicking the
// connector itself (#492). The field was the redundant half of an interaction that
// already worked, and it is the reason this menu could not shorten.
import { computed } from 'vue'
import { Tooltip, TooltipProvider } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import PaletteSection from './PaletteSection.vue'
import EspressoSwatchGrid from './EspressoSwatchGrid.vue'
import ShapeGlyph from '@/components/floating/ShapeGlyph.vue'

const props = defineProps({
  connector: { type: Object, required: true },
})
const store = useDiagramStore()

// Endpoint styles offered for each end (matches ConnectorMarker shapes).
//
// Arrow carries a drawn `glyph` rather than a Lucide `icon` (#490): it draws a
// SOLID triangle, and Lucide is stroked outlines throughout, so `lucide-arrow-right`
// promised an open arrowhead the renderer never produces. Open keeps its chevron —
// that one is stroked on the canvas too, so the icon is already honest.
const ENDPOINTS = [
  { value: 'none', icon: 'lucide-minus', label: 'None' },
  { value: 'arrow', glyph: 'arrowhead', label: 'Arrow' },
  { value: 'open-arrow', icon: 'lucide-chevron-right', label: 'Open' },
  { value: 'circle', icon: 'lucide-circle', label: 'Circle' },
  { value: 'square', icon: 'lucide-square', label: 'Square' },
  { value: 'diamond', icon: 'lucide-square', label: 'Diamond', rotate: true },
]
const WIDTHS = [1.5, 2.2, 3, 4]
const DASHES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]
const CORNERS = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'sharp', label: 'Sharp' },
]
// The connector default, and the value the swatch grid has to show as selected.
const DEFAULT_COLOR = '#7C7C7C'

function normEnd(value) {
  if (value === true) return 'arrow'
  if (value === false || value == null) return 'none'
  return value
}
const startType = computed(() => normEnd(props.connector.arrowheads?.start))
const endType = computed(() => normEnd(props.connector.arrowheads?.end))
const style = computed(() => props.connector.style || {})
const color = computed(() => style.value.color || DEFAULT_COLOR)
const width = computed(() => style.value.width || 2.2)

function setEnd(which, value) {
  store.updateConnector(props.connector.id, { arrowheads: { [which]: value } })
}
function setStyle(patch) {
  store.updateConnector(props.connector.id, { style: patch })
}

// The dash preview draws the pattern at the connector's own width, using the same
// rule ConnectorView does — so the cell is a preview of this line, not a generic
// picture of "dashed".
function dashPreview(dash) {
  if (dash === 'dashed') return `${width.value * 3} ${width.value * 2}`
  if (dash === 'dotted') return `${width.value} ${width.value * 2}`
  return null
}

const cellActive = 'bg-surface-gray-3 text-ink-gray-9'
const cellIdle = 'text-ink-gray-7 hover:bg-surface-gray-2'
const cell = 'flex h-7 flex-1 items-center justify-center rounded-md'
</script>

<template>
  <!-- One provider for the whole menu: it opens as a Popover, whose content is
       teleported out of the toolbar's provider, so without this the tooltips would
       match the toolbar's in looks but each wait out its own delay (#497). -->
  <TooltipProvider>
    <PaletteSection label="Start">
      <div class="flex gap-1">
        <Tooltip v-for="e in ENDPOINTS" :key="`s-${e.value}`" :text="e.label">
          <button
            :class="[cell, startType === e.value ? cellActive : cellIdle]"
            :aria-label="`Start: ${e.label}`"
            :aria-pressed="startType === e.value"
            @click="setEnd('start', e.value)"
          >
            <ShapeGlyph v-if="e.glyph" class="h-4 w-4" family="endpoint" :type="e.value" aria-hidden="true" />
            <span v-else class="h-4 w-4" aria-hidden="true" :class="[e.icon, e.rotate ? 'rotate-45' : '']" />
          </button>
        </Tooltip>
      </div>
    </PaletteSection>

    <PaletteSection label="End">
      <div class="flex gap-1">
        <Tooltip v-for="e in ENDPOINTS" :key="`e-${e.value}`" :text="e.label">
          <button
            :class="[cell, endType === e.value ? cellActive : cellIdle]"
            :aria-label="`End: ${e.label}`"
            :aria-pressed="endType === e.value"
            @click="setEnd('end', e.value)"
          >
            <ShapeGlyph v-if="e.glyph" class="h-4 w-4" family="endpoint" :type="e.value" aria-hidden="true" />
            <span v-else class="h-4 w-4" aria-hidden="true" :class="[e.icon, e.rotate ? 'rotate-45' : '']" />
          </button>
        </Tooltip>
      </div>
    </PaletteSection>

    <PaletteSection label="Line">
      <!-- The curated Espresso grid, like fill, border and text colour (#494). The
           hex field it replaces was the last colour control in the app still asking
           for a value rather than offering the palette.
           allow-none is false: the grid's "None" emits 'none' in fill mode, and a
           connector with no stroke colour would simply vanish. -->
      <EspressoSwatchGrid mode="fill" :model-value="color" :allow-none="false" @select="setStyle({ color: $event })" />

      <div class="mb-2 mt-2 text-2xs font-semibold text-ink-gray-5">Width</div>
      <div class="mb-2 flex gap-1">
        <Tooltip v-for="w in WIDTHS" :key="w" :text="`${w}px`">
          <button
            :class="[cell, width === w ? cellActive : cellIdle]"
            :aria-label="`Line width ${w}`"
            :aria-pressed="width === w"
            @click="setStyle({ width: w })"
          >
            <span class="w-5 rounded-full bg-surface-gray-10" :style="{ height: Math.max(1, w - 0.5) + 'px' }" />
          </button>
        </Tooltip>
      </div>

      <!-- Dash: the pattern itself, drawn at this connector's width, rather than the
           words Solid / Dashed / Dotted. No new artwork — it is the same
           stroke-dasharray the canvas paints. -->
      <div class="mb-2 text-2xs font-semibold text-ink-gray-5">Dash</div>
      <div class="flex gap-1">
        <Tooltip v-for="d in DASHES" :key="d.value" :text="d.label">
          <button
            :class="[cell, (style.dash || 'solid') === d.value ? cellActive : cellIdle]"
            :aria-label="`Dash: ${d.label}`"
            :aria-pressed="(style.dash || 'solid') === d.value"
            @click="setStyle({ dash: d.value })"
          >
            <!-- Inset by the cap radius: round caps overhang each end by half the
                 stroke, so a line drawn to the viewBox edge has its last dot cut off. -->
            <svg class="w-5" viewBox="0 0 20 4" fill="none" aria-hidden="true">
              <line
                x1="1"
                y1="2"
                x2="19"
                y2="2"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                :stroke-dasharray="dashPreview(d.value)"
              />
            </svg>
          </button>
        </Tooltip>
      </div>

      <!-- Elbow routes can bend with rounded or sharp corners (spec 3.6). -->
      <template v-if="connector.type === 'elbow'">
        <div class="mb-2 mt-2 text-2xs font-semibold text-ink-gray-5">Corners</div>
        <div class="flex gap-1">
          <Tooltip v-for="c in CORNERS" :key="c.value" :text="c.label">
            <button
              :class="[cell, (style.corner || 'rounded') === c.value ? cellActive : cellIdle]"
              :aria-label="`Corners: ${c.label}`"
              :aria-pressed="(style.corner || 'rounded') === c.value"
              @click="setStyle({ corner: c.value })"
            >
              <ShapeGlyph class="h-4 w-4" family="corner" :type="c.value" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </template>
    </PaletteSection>
  </TooltipProvider>
</template>
