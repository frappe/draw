<script setup>
// One control on the canvas toolbar. Wrapping frappe-ui's Button here gives every
// entry the same size and pressed treatment in one place, and makes `label`
// mandatory so no control can ship without an accessible name (#176).
//
// Three details are load-bearing:
//
// - Button is the ROOT element, and the tooltip rides on its own `tooltip` prop
//   rather than an enclosing <Tooltip>. A Popover renders #trigger through reka's
//   PopoverTrigger as-child, which merges its listeners onto the single child
//   element; a wrapper component swallows them and the popover never opens.
//   Button reuses an ancestor TooltipProvider when there is one, so the toolbar
//   still gets skip-delay tooltips.
// - Pressed state rides on `aria-pressed` and the matching Tailwind variant
//   rather than a `variant` swap, which is what frappe-ui's own EditorFixedMenu
//   does. It keeps the state in the accessibility tree, not only in paint.
// - `@mousedown.prevent` stops the button taking focus, so clicking Bold while a
//   shape's label is being edited does not blur the text editor. The toolbar sits
//   far from the shape now, so the pointer crosses the canvas to reach it.
//
// An `icon` (prop or slot) makes frappe-ui render a square icon-only button and
// use `label` as the aria-label. Omit both for a text button.
import { Button } from 'frappe-ui'

defineProps({
  label: { type: String, required: true },
  // Defaults to the label. Set it when the control needs to say more than its
  // name, for example "Tidy up — re-flow the whole chart".
  tooltip: { type: String, default: '' },
  icon: { type: String, default: undefined },
  iconLeft: { type: String, default: undefined },
  // Chrome stays neutral gray; 'red' is for destructive controls only.
  theme: { type: String, default: 'gray' },
  // Toggles only. Left undefined the aria-pressed attribute is not rendered at
  // all — a stepper or a menu trigger is not a toggle, and claiming otherwise
  // makes a screen reader announce a pressed state that means nothing.
  active: { type: Boolean, default: undefined },
  disabled: { type: Boolean, default: false },
})
</script>

<template>
  <Button
    variant="ghost"
    :theme="theme"
    size="sm"
    :icon="icon"
    :icon-left="iconLeft"
    :label="label"
    :tooltip="tooltip || label"
    :disabled="disabled"
    :aria-pressed="active"
    class="aria-pressed:bg-surface-gray-3"
    @mousedown.prevent
  >
    <!-- Both slots are forwarded only when the caller actually passed one.
         Button resolves its text as `slots.default?.() ?? props.label`, so an
         unconditional <slot /> registers an empty default slot and silently
         swallows the label. -->
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template v-if="$slots.default" #default><slot /></template>
  </Button>
</template>
