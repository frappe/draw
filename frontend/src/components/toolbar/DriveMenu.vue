<script setup>
// Drive status for this diagram — shown only when the optional Frappe Drive/Suite
// integration is available. A new diagram is now auto-registered as a Drive file on
// create (Writer/Slides behaviour), so this is an "In Drive" affordance that opens
// Drive rather than a manual "Add to Drive". Clicking also re-registers idempotently
// — the manual fallback for diagrams made before the integration (or before Drive
// was installed). Hidden entirely when Drive is absent.
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Tooltip, call, toast } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'

const route = useRoute()
const available = ref(false)
const busy = ref(false)

onMounted(async () => {
  try {
    const status = await call('draw.api.drive_integration.is_available')
    available.value = !!status?.installed
  } catch {
    available.value = false // Drive not installed / API absent → stay hidden.
  }
})

async function openInDrive() {
  if (busy.value) return
  busy.value = true
  try {
    // Ensure this diagram has its Drive file (idempotent; normally already created
    // on insert), then hand off to Drive.
    await call('draw.api.drive_integration.add_to_drive', { name: route.params.name })
    window.open('/drive', '_blank')
  } catch (e) {
    toast.error('Could not open in Drive', { text: e?.message || '' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Tooltip v-if="available" text="This diagram is saved in your Drive — open it there">
    <Button variant="outline" :loading="busy" aria-label="Open in Drive" @click="openInDrive">
      <template #prefix><LucideIcon name="hard-drive" class="h-4 w-4" /></template>
      In Drive
    </Button>
  </Tooltip>
</template>
