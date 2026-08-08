<script setup>
// The default look-and-feel controls for a mind-map node (#260): border on/off,
// fill on/off, corner curve, and text alignment. Reused for both the Parent-node
// and Child-node defaults in Settings, and (later) for a per-node override. Emits
// a fresh style object on every change (never mutates the bound one) so the parent
// stays the single source and the persisted settings watcher fires cleanly.
import { Button, TabButtons } from 'frappe-ui'

const style = defineModel({ type: Object, required: true })

const curveOptions = [
  { label: 'None', value: 'none' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'High', value: 'high' },
]
const alignOptions = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]

function set(patch) {
  style.value = { ...style.value, ...patch }
}
</script>

<template>
  <div class="flex flex-col items-end gap-3">
    <div class="flex items-center gap-2">
      <Button
        size="sm"
        theme="gray"
        :variant="style.border ? 'subtle' : 'outline'"
        label="Border"
        @click="set({ border: !style.border })"
      />
      <Button
        size="sm"
        theme="gray"
        :variant="style.fill ? 'subtle' : 'outline'"
        label="Fill"
        @click="set({ fill: !style.fill })"
      />
    </div>
    <TabButtons
      size="sm"
      :model-value="style.curve"
      :options="curveOptions"
      @update:model-value="set({ curve: $event })"
    />
    <TabButtons
      size="sm"
      :model-value="style.align"
      :options="alignOptions"
      @update:model-value="set({ align: $event })"
    />
  </div>
</template>
