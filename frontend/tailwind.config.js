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
  presets: [require('frappe-ui/tailwind')],
}
