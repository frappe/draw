<script setup>
// Divider between toolbar groups. frappe-ui's own MenuItems markup, so the bar
// matches an EditorFixedMenu rather than approximating one, and hidden from the
// accessibility tree because it carries no meaning.
//
// ONE deliberate difference: no `mx-1`. The reference carries it inside a
// `gap-1` bar, so its separators sit in 8px on each side against 4px between
// buttons. That rhythm suits a bar with a dozen items; this one carries up to
// 44, and the doubled margin cost 56px in the densest state — enough on its own
// to overflow the 1280px minimum. The container's own gap still gives each
// separator 4px of air on both sides.
</script>

<template>
  <span data-slot="menu-separator" class="h-5 w-px shrink-0 bg-surface-gray-3" aria-hidden="true" />
</template>
