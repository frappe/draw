<script setup>
// "Number of sides" for the custom polygon tile (#451 item 2). Opens inside the
// Shapes menu, in place of the tile that asked for it, and emits the count.
//
// The count is validated rather than corrected: a submit is disabled until the
// number is one a polygon can be built from, so nobody asks for 30 sides and gets
// a 15-sided shape without being told. Enter submits, Escape goes back to the
// tiles.
import { computed, nextTick, ref, onMounted } from 'vue'
import { Button, TextInput } from 'frappe-ui'
import {
  MIN_POLYGON_VERTICES,
  MAX_POLYGON_SIDES,
  isValidPolygonSides,
} from '@/diagram/polygon.js'

const emit = defineEmits(['pick', 'cancel'])

const DEFAULT_SIDES = 5
const sides = ref(String(DEFAULT_SIDES))
const input = ref(null)

const isValid = computed(() => isValidPolygonSides(sides.value))

onMounted(async () => {
  await nextTick()
  // Focus the field, not the first tile: the prompt exists to be typed into.
  input.value?.el?.focus?.()
  input.value?.el?.select?.()
})

function submit() {
  if (isValid.value) emit('pick', Number(sides.value))
}
</script>

<template>
  <div class="w-48 p-2.5">
    <label class="mb-1.5 block text-xs font-medium text-ink-gray-7" for="polygon-sides">Number of sides</label>
    <TextInput
      id="polygon-sides"
      ref="input"
      v-model="sides"
      type="number"
      size="sm"
      variant="outline"
      :min="MIN_POLYGON_VERTICES"
      :max="MAX_POLYGON_SIDES"
      @keydown.enter.prevent="submit"
      @keydown.esc.prevent="emit('cancel')"
    />
    <p class="mt-1.5 text-2xs text-ink-gray-5">
      {{ MIN_POLYGON_VERTICES }} to {{ MAX_POLYGON_SIDES }}, all sides equal.
    </p>
    <div class="mt-3 flex justify-end gap-1.5">
      <Button variant="ghost" size="sm" label="Cancel" @click="emit('cancel')" />
      <Button variant="solid" size="sm" label="Insert" :disabled="!isValid" @click="submit" />
    </div>
  </div>
</template>
