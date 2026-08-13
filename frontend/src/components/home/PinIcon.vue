<script setup>
// The pin, outline or filled (#412).
//
// It was a `lucide-pin` span with `fill-current` added when pinned — which did
// nothing at all. frappe-ui renders a lucide class as a MASK tinted with
// `background-color: currentColor` (tailwind/iconPackPlugin.js), so there is no
// `fill` to set: the glyph can only ever be the outline it was drawn as, in
// whatever colour currentColor is. The pinned state therefore only ever changed
// hue, which is exactly what the issue reports.
//
// Lucide ships no filled pin, so the filled state is its own path — the SAME
// geometry as lucide's pin.svg, painted rather than stroked, so the two states
// are one icon in two weights instead of two different marks.
//
// frappe-ui-exempt: a fill variant the icon pack does not contain; a lucide class
// cannot express it.
defineProps({
  pinned: { type: Boolean, default: false },
})

// lucide-static/icons/pin.svg, at its own 24px viewBox.
const OUTLINE =
  'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'
</script>

<template>
  <svg
    class="h-4 w-4 flex-none"
    viewBox="0 0 24 24"
    aria-hidden="true"
    :fill="pinned ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 17v5" />
    <path :d="OUTLINE" />
  </svg>
</template>
