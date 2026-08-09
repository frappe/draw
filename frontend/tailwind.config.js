/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts}',
    // frappe-ui ships .vue source; its components' Tailwind classes (Dialog
    // overlay/positioning, Dropdown, Tooltip, etc.) must be scanned or they get
    // purged — which leaves the Dialog unstyled and spilling across the page.
    './node_modules/frappe-ui/src/**/*.{vue,js,ts}',
  ],
  // Mind-map node markers are stored on the DOCUMENT as bare lucide names
  // (mindmapModel marker.icon), so their classes are built at runtime and the
  // JIT never sees them in source. Listing them keeps old documents rendering.
  safelist: [
    'star', 'flag', 'circle-check', 'circle-alert', 'heart', 'zap',
    'bookmark', 'bell', 'target', 'lightbulb', 'sparkles', 'clock',
    'rocket', 'trophy', 'flame', 'thumbs-up', 'gift', 'eye',
  ].map((icon) => `lucide-${icon}`),
  presets: [require('frappe-ui/tailwind')],
}
