<script setup>
// One-click action tile for the Align / Arrange / Distribute / Transform
// sections. Icon only, with the label carried as the tooltip and the accessible
// name (#472).
//
// This reverses two earlier decisions on purpose. #294 stopped printing the label
// under the icon at 9px, which is off the type scale, and grew the tile to fit
// readable text instead; #267 then laid the tiles two-per-row because "Backward"
// and "To front" truncate in a three-column tile. With the words gone both
// constraints lift, so the grid tightens from two columns to four and the menu
// drops from 300px to 200px.
//
// `icon` rather than `icon-left`: frappe-ui renders an icon-only button from it and
// demotes `label` to the aria-label, so the accessible name survives the words
// coming off. The tooltip was already there on every tile, which is what made this
// safe to do at all.
import { Button } from 'frappe-ui'

defineProps({
  /** Complete lucide utility class, e.g. 'lucide-align-left'. Not a bare name:
   *  Tailwind's JIT only emits classes it can read literally in the source, so
   *  building one with `lucide-${name}` yields no CSS and a blank icon. */
  icon: { type: String, required: true },
  label: { type: String, required: true },
  active: { type: Boolean, default: false },
})
defineEmits(['click'])
</script>

<template>
  <Button
    class="!w-full"
    size="md"
    theme="gray"
    :variant="active ? 'subtle' : 'outline'"
    :icon="icon"
    :tooltip="label"
    :label="label"
    @click="$emit('click')"
  />
</template>
