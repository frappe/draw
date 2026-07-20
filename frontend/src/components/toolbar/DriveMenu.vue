<script setup>
// "Add to Drive" action — appears only when the optional Frappe Drive integration
// is available (Drive installed + a team set up). Registers the diagram in Drive
// as a link file that opens right back in this editor. Idempotent server-side, so
// clicking again just re-uses the existing Drive file.
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
    available.value = !!status?.ready
  } catch {
    available.value = false // Drive not installed / API absent → stay hidden.
  }
})

async function addToDrive() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await call('draw.api.drive_integration.add_to_drive', { name: route.params.name })
    if (res?.file) {
      toast.success('Added to Drive', {
        text: 'Opens in Draw from your Drive.',
        action: { label: 'Open Drive', onClick: () => window.open('/drive', '_blank') },
      })
    } else {
      toast.error('Could not add to Drive')
    }
  } catch (e) {
    toast.error('Could not add to Drive', { text: e?.message || '' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Tooltip v-if="available" text="Add this diagram to Frappe Drive">
    <Button variant="outline" :loading="busy" aria-label="Add to Drive" @click="addToDrive">
      <template #prefix><LucideIcon name="hard-drive" class="h-4 w-4" /></template>
      Add to Drive
    </Button>
  </Tooltip>
</template>
