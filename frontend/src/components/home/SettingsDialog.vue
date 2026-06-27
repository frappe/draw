<script setup>
// App settings dialog, opened from the home sidebar. Holds app-wide preferences
// (currently dark mode; room to grow). Each control writes straight to the
// persisted settings singleton (useAppSettings), so changes apply immediately
// across home + editor and survive a reload. All chrome is Frappe UI.
import { Dialog, Switch } from 'frappe-ui'
import { useAppSettings } from '@/composables/useAppSettings.js'

const open = defineModel({ type: Boolean, default: false })
const { settings } = useAppSettings()
</script>

<template>
  <Dialog v-model="open" :options="{ title: 'Settings', size: 'lg' }">
    <template #body-content>
      <div class="flex flex-col divide-y divide-outline-gray-1">
        <div class="flex items-center justify-between py-3">
          <Switch
            v-model="settings.darkMode"
            label="Dark mode"
            description="Use a dark theme across Frappe Draw. Diagram canvases stay light."
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
