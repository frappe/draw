<script setup>
// Frappe Draw logomark — the brand icon: a white 3-node hierarchy mark on a
// violet (#6846E3) rounded square. Matches the app favicon. Brand violet is used
// for the logomark + avatar only.
defineProps({
  size: { type: Number, default: 26 },
})
</script>

<template>
  <svg viewBox="0 0 100 100" :width="size" :height="size" style="border-radius: 22%">
    <rect width="100" height="100" rx="24" fill="#6846E3" />
    <rect x="18" y="43" width="16" height="16" rx="4" fill="#fff" />
    <rect x="64" y="21" width="16" height="16" rx="4" fill="#fff" />
    <rect x="64" y="63" width="16" height="16" rx="4" fill="#fff" />
    <path
      d="M64 29H50V71h14M34 51h16"
      stroke="#fff"
      stroke-width="6"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
