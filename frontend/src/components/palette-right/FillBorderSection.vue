<script setup>
// Fill & border controls (spec §4.3, README 4d). Espresso swatch rows commit
// fill / border colour to the selected shapes; "+ more" opens an Espresso-only
// picker (no arbitrary hex in v1). Weight + dash-style fields update the border.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

const fillSwatches = ['#EFF6FF', '#F4FFF6', '#FDFAED', '#FCEAF5', '#F3F3F3', '#171717']
const borderSwatches = ['#4F94FF', '#88D5A5', '#FBCC55', '#E68AC4', '#999999', '#171717']

// Espresso-only extended palette for the "+ more" picker (curated, no free hex).
const moreColors = [
  '#FFFFFF', '#F8F8F8', '#F3F3F3', '#E2E2E2', '#C7C7C7', '#999999',
  '#7C7C7C', '#525252', '#383838', '#171717', '#EFF6FF', '#4F94FF',
  '#006EDB', '#F4FFF6', '#88D5A5', '#30A66D', '#FDFAED', '#FBCC55',
  '#FCEAF5', '#E68AC4', '#FDECEC', '#CC2929', '#EFEAFE', '#6846E3',
]

const dashStyles = ['solid', 'dashed', 'dotted']

// Selected shape ids (fill/border apply to all of them at once, §4.3).
const selectedIds = computed(() => store.selectedShapes.value.map((shape) => shape.id))

// Reference shape drives the field readouts (first in selection).
const reference = computed(() => store.selectedShapes.value[0])
const weight = computed(() => reference.value?.border?.width ?? 1.5)
const dash = computed(() => reference.value?.border?.dash ?? 'solid')

function setFill(color) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { fill: color })
}

function setBorderColor(color) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { border: { color } })
}

function setWeight(value) {
  const width = Number(value)
  if (selectedIds.value.length && width >= 0) store.updateShapes(selectedIds.value, { border: { width } })
}

function setDash(value) {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { border: { dash: value } })
}
</script>

<template>
  <PaletteSection label="Fill & border">
    <div class="mb-1 text-[10px] text-ink-gray-5">Fill</div>
    <div class="mb-2.5 flex flex-wrap gap-1.5">
      <button
        v-for="color in fillSwatches"
        :key="color"
        class="h-[22px] w-[22px] rounded-[5px] border border-black/10"
        :style="{ background: color }"
        @click="setFill(color)"
      />
      <Popover>
        <template #target="{ togglePopover }">
          <button
            class="h-[22px] w-[22px] rounded-[5px] border border-dashed border-outline-gray-3 text-[12px] leading-none text-ink-gray-5"
            @click="togglePopover()"
          >
            +
          </button>
        </template>
        <template #body-main>
          <div class="grid grid-cols-6 gap-1.5 p-2">
            <button
              v-for="color in moreColors"
              :key="`fill-${color}`"
              class="h-[22px] w-[22px] rounded-[5px] border border-black/10"
              :style="{ background: color }"
              @click="setFill(color)"
            />
          </div>
        </template>
      </Popover>
    </div>

    <div class="mb-1 text-[10px] text-ink-gray-5">Border</div>
    <div class="mb-2.5 flex flex-wrap gap-1.5">
      <button
        v-for="color in borderSwatches"
        :key="color"
        class="h-[22px] w-[22px] rounded-[5px] border border-black/10"
        :style="{ background: color }"
        @click="setBorderColor(color)"
      />
      <Popover>
        <template #target="{ togglePopover }">
          <button
            class="h-[22px] w-[22px] rounded-[5px] border border-dashed border-outline-gray-3 text-[12px] leading-none text-ink-gray-5"
            @click="togglePopover()"
          >
            +
          </button>
        </template>
        <template #body-main>
          <div class="grid grid-cols-6 gap-1.5 p-2">
            <button
              v-for="color in moreColors"
              :key="`border-${color}`"
              class="h-[22px] w-[22px] rounded-[5px] border border-black/10"
              :style="{ background: color }"
              @click="setBorderColor(color)"
            />
          </div>
        </template>
      </Popover>
    </div>

    <div class="flex gap-1.5">
      <label class="flex flex-1 items-center gap-1 rounded-md border border-outline-gray-1 px-2 py-1 text-xs text-ink-gray-7">
        <input
          type="number"
          min="0"
          step="0.5"
          :value="weight"
          class="w-full bg-transparent outline-none"
          @change="setWeight($event.target.value)"
        />
        <span class="text-ink-gray-5">px</span>
      </label>
      <select
        class="flex-1 rounded-md border border-outline-gray-1 px-2 py-1 text-xs capitalize text-ink-gray-7"
        :value="dash"
        @change="setDash($event.target.value)"
      >
        <option v-for="style in dashStyles" :key="style" :value="style" class="capitalize">
          {{ style }}
        </option>
      </select>
    </div>
  </PaletteSection>
</template>
