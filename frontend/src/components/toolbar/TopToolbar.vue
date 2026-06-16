<script setup>
// Top toolbar (48px, spec §4.4). Left: back chevron, logomark, editable title,
// save indicator. Right: Export, Share, Print, dark-mode toggle, avatar.
import { useRouter } from 'vue-router'
import { Button, FeatherIcon } from 'frappe-ui'
import Logomark from '@/components/Logomark.vue'
import TitleEditor from './TitleEditor.vue'
import SaveIndicator from './SaveIndicator.vue'
import ExportMenu from './ExportMenu.vue'
import ShareMenu from './ShareMenu.vue'

defineProps({
  title: { type: String, default: 'Untitled diagram' },
  saveStatus: { type: String, default: 'saved' },
  dark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:title', 'toggle-dark'])

const router = useRouter()
</script>

<template>
  <header
    class="flex h-12 flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-white px-3"
  >
    <Button variant="ghost" @click="router.push({ name: 'Home' })">
      <FeatherIcon name="chevron-left" class="h-4 w-4" />
    </Button>
    <div class="h-5 w-px bg-outline-gray-1" />
    <Logomark :size="22" />
    <TitleEditor :title="title" @update:title="emit('update:title', $event)" />
    <SaveIndicator :status="saveStatus" />

    <div class="ml-auto flex items-center gap-2">
      <ExportMenu />
      <ShareMenu />
      <Button variant="outline">
        <FeatherIcon name="printer" class="h-4 w-4" />
      </Button>
      <div class="h-5 w-px bg-outline-gray-1" />
      <Button variant="outline" @click="emit('toggle-dark')">
        <FeatherIcon :name="dark ? 'sun' : 'moon'" class="h-4 w-4" />
      </Button>
      <div
        class="flex h-7 w-7 items-center justify-center rounded-full bg-[#6846E3] text-xs font-semibold text-white"
      >
        TS
      </div>
    </div>
  </header>
</template>
