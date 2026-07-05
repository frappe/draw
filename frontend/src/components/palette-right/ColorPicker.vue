<script setup>
// A continuous (Figma-style) colour control: a labelled swatch trigger that
// opens a popover with a saturation/value square, a hue slider, a hex field,
// and a row of quick swatches. Works in HSV internally and commits hex.
import { reactive, computed, watch } from 'vue'
import { Popover } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { recentColors, pushRecentColor } from '@/composables/useRecentColors.js'

const props = defineProps({
  modelValue: { type: String, default: '#FFFFFF' },
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const quickColors = [
  '#FFFFFF', '#F3F3F3', '#C7C7C7', '#999999', '#525252', '#171717',
  '#4F94FF', '#006EDB', '#88D5A5', '#30A66D', '#FBCC55', '#E68AC4',
]

const hsv = reactive({ h: 0, s: 0, v: 1, a: 1 })

// The opaque RGB hex (drives the SV square / hue math / previews).
const currentHex = computed(() => {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v)
  return rgbToHex(r, g, b)
})

// The emitted colour: 6-digit when fully opaque, 8-digit #RRGGBBAA otherwise
// (SVG fill/stroke accept both), so the picker carries its own transparency.
const currentColor = computed(() =>
  hsv.a >= 1 ? currentHex.value : currentHex.value + alphaHex(hsv.a),
)

const hueColor = computed(() => {
  const { r, g, b } = hsvToRgb(hsv.h, 1, 1)
  return rgbToHex(r, g, b)
})

// The trigger swatch shows the bound colour (may be 'none'); the picker edits a
// concrete colour.
const swatch = computed(() => parseColor(props.modelValue)?.hex || '#FFFFFF')

syncFromHex(props.modelValue)
watch(
  () => props.modelValue,
  (value) => {
    if (value && value.toLowerCase() !== currentColor.value.toLowerCase()) syncFromHex(value)
  },
)

function syncFromHex(value) {
  const parsed = parseColor(value) || { hex: '#FFFFFF', a: 1 }
  const rgb = hexToRgb(parsed.hex)
  const next = rgbToHsv(rgb.r, rgb.g, rgb.b)
  hsv.h = next.h
  hsv.s = next.s
  hsv.v = next.v
  hsv.a = parsed.a
}

function commit() {
  emit('update:modelValue', currentColor.value)
}

function pickAlpha(event, element) {
  const rect = element.getBoundingClientRect()
  hsv.a = clamp01((event.clientX - rect.left) / rect.width)
  commit()
}

function alphaHex(a) {
  return Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}

function pickSquare(event, element) {
  const rect = element.getBoundingClientRect()
  hsv.s = clamp01((event.clientX - rect.left) / rect.width)
  hsv.v = 1 - clamp01((event.clientY - rect.top) / rect.height)
  commit()
}

function pickHue(event, element) {
  const rect = element.getBoundingClientRect()
  hsv.h = clamp01((event.clientX - rect.left) / rect.width) * 360
  commit()
}

function onHex(value) {
  if (!parseColor(value)) return
  syncFromHex(value)
  commit()
  pushRecentColor(currentColor.value)
}

// Native eyedropper (Chrome/Edge): sample any pixel on screen (spec 8.3). Hidden
// where the API is missing. The user-cancel rejection is swallowed.
const supportsEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window
async function pickEyedropper() {
  try {
    const result = await new window.EyeDropper().open()
    if (result?.sRGBHex) onHex(result.sRGBHex)
  } catch {
    /* user pressed Escape — ignore */
  }
}

// Drive a picker handler from the initial press and through the drag.
function startDrag(event, handler) {
  event.preventDefault()
  const element = event.currentTarget
  handler(event, element)
  const move = (moveEvent) => handler(moveEvent, element)
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    pushRecentColor(currentHex.value)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

// --- colour math (pure) ----------------------------------------------------
function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

// Parse #RGB / #RRGGBB / #RRGGBBAA → { hex: '#RRGGBB', a: 0..1 }, or null.
function parseColor(value) {
  let hex = (value || '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map((c) => c + c).join('')
  if (/^[0-9a-f]{8}$/i.test(hex)) return { hex: `#${hex.slice(0, 6).toUpperCase()}`, a: parseInt(hex.slice(6, 8), 16) / 255 }
  if (/^[0-9a-f]{6}$/i.test(hex)) return { hex: `#${hex.toUpperCase()}`, a: 1 }
  return null
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function rgbToHex(r, g, b) {
  const part = (x) => Math.round(x).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase()
}

function rgbToHsv(r, g, b) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const delta = max - Math.min(red, green, blue)
  let hue = 0
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue = (hue * 60 + 360) % 360
  }
  return { h: hue, s: max ? delta / max : 0, v: max }
}

function hsvToRgb(h, s, v) {
  const chroma = v * s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - chroma
  const [r, g, b] = hsvSegment(Math.floor(h / 60) % 6, chroma, x)
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

function hsvSegment(segment, chroma, x) {
  return [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][segment]
}
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="label" class="w-12 shrink-0 text-[11px] text-ink-gray-6">{{ label }}</span>
    <Popover>
      <template #target="{ togglePopover }">
        <button
          class="flex h-8 flex-1 items-center gap-2 rounded-md border border-outline-gray-2 px-2 hover:border-outline-gray-3"
          @click="togglePopover()"
        >
          <span class="h-4 w-4 rounded-[3px] border border-black/10" :style="{ background: swatch }" />
          <span class="text-[11px] font-medium uppercase text-ink-gray-7">{{ swatch }}</span>
        </button>
      </template>
      <template #body-main>
        <div class="w-[208px] select-none p-2.5">
          <div
            class="relative h-[124px] w-full cursor-crosshair rounded-md"
            :style="{ background: hueColor }"
            @pointerdown="startDrag($event, pickSquare)"
          >
            <div class="absolute inset-0 rounded-md" style="background: linear-gradient(to right, #fff, rgba(255,255,255,0))" />
            <div class="absolute inset-0 rounded-md" style="background: linear-gradient(to top, #000, rgba(0,0,0,0))" />
            <div
              class="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/25"
              :style="{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%' }"
            />
          </div>

          <div
            class="relative mt-3 h-3 w-full cursor-pointer rounded-full"
            style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
            @pointerdown="startDrag($event, pickHue)"
          >
            <div
              class="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/25"
              :style="{ left: (hsv.h / 360) * 100 + '%' }"
            />
          </div>

          <!-- Alpha (opacity) over a checkerboard, transparent → opaque colour. -->
          <div
            class="relative mt-3 h-3 w-full cursor-pointer rounded-full"
            style="background: repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
            @pointerdown="startDrag($event, pickAlpha)"
          >
            <div class="absolute inset-0 rounded-full" :style="{ background: `linear-gradient(to right, transparent, ${currentHex})` }" />
            <div
              class="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/25"
              :style="{ left: hsv.a * 100 + '%' }"
            />
          </div>

          <div class="mt-3 flex items-center gap-1.5">
            <div class="flex flex-1 items-center gap-1.5 rounded-md border border-outline-gray-2 px-2">
              <span class="text-[11px] text-ink-gray-5">#</span>
              <input
                :value="currentColor.replace('#', '')"
                maxlength="8"
                class="h-7 w-full bg-transparent text-[11px] font-medium uppercase text-ink-gray-8 outline-none"
                @change="onHex($event.target.value)"
              />
            </div>
            <button
              v-if="supportsEyedropper"
              class="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-outline-gray-2 text-ink-gray-6 hover:bg-surface-gray-2"
              title="Pick a colour from the screen"
              aria-label="Eyedropper"
              @click="pickEyedropper"
            >
              <LucideIcon name="crosshair" class="h-4 w-4" />
            </button>
          </div>

          <div v-if="recentColors.length" class="mt-2.5">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Recent</div>
            <div class="grid grid-cols-6 gap-1.5">
              <button
                v-for="color in recentColors"
                :key="color"
                class="h-[18px] w-[18px] rounded-[4px] border border-black/10"
                :style="{ background: color }"
                @click="onHex(color)"
              />
            </div>
          </div>

          <div class="mt-2.5 grid grid-cols-6 gap-1.5">
            <button
              v-for="color in quickColors"
              :key="color"
              class="h-[18px] w-[18px] rounded-[4px] border border-black/10"
              :style="{ background: color }"
              @click="onHex(color)"
            />
          </div>
        </div>
      </template>
    </Popover>
  </div>
</template>
