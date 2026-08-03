<script setup>
// Home sidebar, built on frappe-ui's official <Sidebar> so it matches Drive /
// Writer (header block with logo + user + menu, sections, icon-rail collapse).
// Nav only — Home / Recent / Shared with you / Pinned / Trash (#116). No folders
// (#115). The nav set lives in homeViews.js so it can be unit-tested browser-free.
import { ref, computed } from 'vue'
import { Sidebar, SidebarItem, toast } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import { SIDEBAR_NAV } from '@/components/home/homeViews.js'
import { logout } from '@/data/session.js'

const props = defineProps({
  active: { type: String, default: 'home' },
})
const emit = defineEmits(['navigate'])

const collapsed = ref(false)
const showSettings = ref(false)

// Real logged-in user, injected into the page boot by www/draw.py.
const fullName = computed(() => window.full_name || 'You')

// Log out, keeping the user here with an error if the session survives — a
// silent no-op would look like the old "403 Not Permitted" logout.
async function signOut() {
  try {
    await logout()
  } catch (error) {
    toast.error('Could not log out', { text: error?.message || '' })
  }
}

// Header dropdown (Settings + Log out), matching Drive's header menu.
const header = computed(() => ({
  title: 'Frappe Draw',
  subtitle: fullName.value,
  menuItems: [
    { label: 'Settings', icon: 'settings', onClick: () => (showSettings.value = true) },
    { label: 'Log out', icon: 'log-out', onClick: signOut },
  ],
}))

const sections = computed(() => [{ items: SIDEBAR_NAV }])
</script>

<template>
  <Sidebar v-model:collapsed="collapsed" :header="header" :sections="sections">
    <template #header-logo>
      <div class="flex h-full w-full items-center justify-center">
        <Logomark :size="26" />
      </div>
    </template>

    <template #sidebar-item="{ item, isCollapsed }">
      <SidebarItem
        :label="item.label"
        :is-active="props.active === item.key"
        :is-collapsed="isCollapsed"
        :on-click="() => emit('navigate', item.key)"
      >
        <template #icon><LucideIcon :name="item.feather" class="size-4 text-ink-gray-6" /></template>
      </SidebarItem>
    </template>
  </Sidebar>

  <SettingsDialog v-model:open="showSettings" />
</template>
