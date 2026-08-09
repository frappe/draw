<script setup>
// Divider between toolbar groups. Same markup frappe-ui's own MenuItems uses for
// its separators, so the bar matches an EditorFixedMenu rather than approximating
// one, and hidden from the accessibility tree because it carries no meaning.
</script>

<template>
  <span data-slot="menu-separator" class="mx-1 h-5 w-px shrink-0 bg-surface-gray-3" aria-hidden="true" />
</template>
