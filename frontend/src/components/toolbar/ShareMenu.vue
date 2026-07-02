<script setup>
// Share dialog (SPEC §9), Drive-style: "General access" (Restricted vs Anyone
// with the link — view only) plus "People" — invite specific users by email as
// viewer or editor, backed by Frappe DocShare. Native <select>s for roles so the
// change event is reliable. The diagram resource is loaded from the route.
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Dialog, Avatar } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { loadDiagram } from '@/data/diagrams.js'
import { useShare } from '@/composables/useShare.js'

const route = useRoute()
const diagram = loadDiagram(route.params.name)
const share = useShare(diagram)

const open = ref(false)
const query = ref('')
const results = ref([])
const inviteRole = ref('view') // role for the next person added

// Load current members whenever the dialog opens.
watch(open, (isOpen) => {
  if (isOpen) share.loadShares()
})

const ownerEmail = computed(() => diagram.doc?.owner || '')
const memberEmails = computed(() => new Set(share.members.value.map((m) => m.user)))

// Debounced user search; hide the owner and people already added.
let searchTimer = null
watch(query, (txt) => {
  clearTimeout(searchTimer)
  if (!txt.trim()) {
    results.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    const found = await share.searchUsers(txt)
    results.value = found.filter((u) => u.name !== ownerEmail.value && !memberEmails.value.has(u.name))
  }, 200)
})

async function invite(user) {
  await share.addMember(user, inviteRole.value === 'edit')
  query.value = ''
  results.value = []
}

const accessLevel = computed({
  get: () => (share.isPublic.value ? 'link' : 'restricted'),
  set: (value) => {
    const wantPublic = value === 'link'
    if (wantPublic !== share.isPublic.value) share.toggleGlobalAccess()
  },
})
</script>

<template>
  <Button variant="outline" @click="open = true">
    <template #prefix><LucideIcon name="share-2" class="h-4 w-4" /></template>
    Share
  </Button>

  <Dialog v-model="open" :options="{ title: 'Share diagram', size: 'lg' }">
    <template #body-content>
      <div class="space-y-5">
        <!-- People -->
        <div>
          <p class="mb-2 text-sm font-medium text-ink-gray-7">People</p>

          <!-- Invite by email + role. -->
          <div class="relative flex gap-2">
            <div class="relative flex-1">
              <input
                v-model="query"
                type="text"
                placeholder="Add people by email…"
                class="h-9 w-full rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 outline-none focus:border-outline-gray-3"
                @keydown.enter="query.trim() && invite(query.trim())"
              />
              <!-- Search results dropdown. -->
              <div
                v-if="results.length"
                class="absolute left-0 right-0 top-10 z-10 max-h-56 overflow-auto rounded-md border border-outline-gray-2 bg-surface-base py-1 shadow-lg"
              >
                <button
                  v-for="u in results"
                  :key="u.name"
                  class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-gray-2"
                  @click="invite(u.name)"
                >
                  <Avatar size="sm" :image="u.user_image" :label="u.full_name || u.name" />
                  <span class="min-w-0">
                    <span class="block truncate text-[13px] text-ink-gray-8">{{ u.full_name || u.name }}</span>
                    <span class="block truncate text-[11px] text-ink-gray-5">{{ u.name }}</span>
                  </span>
                </button>
              </div>
            </div>
            <select
              v-model="inviteRole"
              class="h-9 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 outline-none"
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
          </div>

          <!-- Members list (owner first, then shared users). -->
          <div class="mt-3 space-y-1.5">
            <div class="flex items-center gap-2.5">
              <Avatar size="md" :label="ownerEmail" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px] text-ink-gray-8">{{ ownerEmail }}</div>
              </div>
              <span class="text-[12px] text-ink-gray-5">Owner</span>
            </div>

            <div v-for="m in share.members.value" :key="m.user" class="flex items-center gap-2.5">
              <Avatar size="md" :image="m.user_image" :label="m.full_name || m.user" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-[13px] text-ink-gray-8">{{ m.full_name || m.user }}</div>
                <div class="truncate text-[11px] text-ink-gray-5">{{ m.user }}</div>
              </div>
              <select
                :value="m.can_edit ? 'edit' : 'view'"
                class="h-8 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-[13px] text-ink-gray-8 outline-none"
                @change="share.setMemberRole(m.user, $event.target.value === 'edit')"
              >
                <option value="view">Can view</option>
                <option value="edit">Can edit</option>
              </select>
              <button
                class="flex h-8 w-8 items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2"
                title="Remove"
                aria-label="Remove"
                @click="share.removeMember(m.user)"
              >
                <LucideIcon name="x" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- General access -->
        <div class="border-t border-outline-gray-1 pt-4">
          <p class="mb-2 text-sm font-medium text-ink-gray-7">General access</p>
          <div class="flex items-center gap-2">
            <LucideIcon :name="share.isPublic.value ? 'globe' : 'lock'" class="h-4 w-4 text-ink-gray-6" />
            <select
              v-model="accessLevel"
              class="h-9 flex-1 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 outline-none"
            >
              <option value="restricted">Restricted — only people added</option>
              <option value="link">Anyone with the link can view</option>
            </select>
          </div>

          <!-- One-click copy of the view link when the link is on. -->
          <button
            v-if="share.isPublic.value && share.shareLink.value"
            class="mt-2 flex w-full items-center gap-2 rounded-md border border-outline-gray-2 px-3 py-2 text-left hover:border-outline-gray-3 hover:bg-surface-gray-1"
            @click="share.copyLink()"
          >
            <LucideIcon name="link" class="h-4 w-4 flex-none text-ink-gray-5" />
            <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-7">{{ share.shareLink.value }}</span>
            <span class="flex flex-none items-center gap-1 text-[12px] font-medium text-ink-gray-6">
              <LucideIcon name="copy" class="h-3.5 w-3.5" /> Copy
            </span>
          </button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
