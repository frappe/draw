<script setup>
// One-click action tile for the Align / Arrange / Distribute / Transform
// sections. A frappe-ui Button with the icon before the label.
//
// The label used to be printed under the icon at 9px, which is off the type
// scale. Rather than shrink the text to fit the tile, the tile grew to fit the
// text: `size="md"` is frappe-ui's 32px control, whose label is text-base (14px),
// and the sections lay these out two-per-row so a label like "Remove gaps" fits
// without truncating (#294).
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
    class="!w-full !justify-start"
    size="md"
    theme="gray"
    :variant="active ? 'subtle' : 'outline'"
    :icon-left="icon"
    :tooltip="label"
    :label="label"
    @click="$emit('click')"
  />
</template>
