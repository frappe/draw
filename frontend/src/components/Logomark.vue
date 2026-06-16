<script setup>
// Frappe Draw logomark — a tiny block diagram in brand violet #6846E3 (README
// "Assets"). Brand violet is used for the logomark + avatar only.
defineProps({
  size: { type: Number, default: 26 },
})
</script>

<template>
  <svg viewBox="0 0 100 100" :width="size" :height="size" style="border-radius: 8px">
    <rect width="100" height="100" rx="28" fill="#6846E3" />
    <rect x="28" y="28" width="20" height="20" rx="4" fill="#fff" />
    <rect x="55" y="55" width="20" height="20" rx="4" fill="#fff" />
    <path d="M48 38h10a4 4 0 0 1 4 4v13" stroke="#fff" stroke-width="5" fill="none" />
  </svg>
</template>
