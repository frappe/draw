<script setup>
// One-click action tile for the Align / Arrange / Distribute / Transform
// sections. An icon-only frappe-ui Button: the label rides its `tooltip` (hover
// text) and `label` (accessible name) rather than being printed under the icon.
//
// Why the printed label went away (#294): it was set in 9px type, off the
// 13/14/16 scale, and these tiles sit six-across in a ~280px palette — at 13px a
// label like "Remove gaps" cannot fit. The name stays reachable by hover and by
// screen reader.
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { LUCIDE_ALIAS } from '@/icons/lucideAlias.js'

const props = defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  active: { type: Boolean, default: false },
})
defineEmits(['click'])

// Callers still pass feather-era names ('grid', 'columns', 'flip-horizontal').
// Several of those ALSO exist in lucide as a different glyph, so resolving
// through the same alias map the icon shim used is what keeps the rendered
// glyph identical to before.
const iconClass = computed(() => `lucide-${LUCIDE_ALIAS[props.icon] || props.icon}`)
</script>

<template>
  <Button
    class="!w-full"
    size="lg"
    theme="gray"
    :variant="active ? 'subtle' : 'outline'"
    :icon="iconClass"
    :tooltip="label"
    :label="label"
    @click="$emit('click')"
  />
</template>
