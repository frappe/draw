<script setup>
// A right-palette section: uppercase label + a body slot (README 4d). Each
// section is padded with a bottom hairline.
defineProps({
  label: { type: String, required: true },
})
</script>

<template>
  <section class="border-b border-outline-gray-1 px-3.5 py-3">
    <div class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">
      {{ label }}
    </div>
    <slot />
  </section>
</template>
