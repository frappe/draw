<script setup>
// Share dialog (SPEC §9), Writer-style: "General access" first (Restricted vs
// Anyone with the link), then "People" — invite specific users by email as
// viewer / commenter / editor, backed by Frappe DocShare. A persistent "Copy
// link" CTA sits at the bottom with inline "Link copied" feedback (#106/#107).
// Native <select>s for roles so the change event is reliable.
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

const dialogTitle = computed(() => `Sharing "${diagram.doc?.title || 'diagram'}"`)
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
  await share.addMember(user, inviteRole.value)
  query.value = ''
  results.value = []
}

// Set the state the user picked, rather than toggling whatever the current value is:
// a toggle fired while a previous change is still in flight flips the wrong way, and
// the change used to be dropped outright. setGlobalAccess queues instead.
const accessLevel = computed({
  get: () => (share.isPublic.value ? 'link' : 'restricted'),
  set: (value) => share.setGlobalAccess(value === 'link'),
})

// Copy link is always available (the link respects access — invited-only until you
// open general access up). Inline "Link copied" that fades after a couple seconds.
const copied = ref(false)
let copiedTimer = null
async function doCopy() {
  await share.copyLink()
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 2500)
}
</script>

<template>
  <Button variant="outline" @click="open = true">
    <template #prefix><LucideIcon name="share-2" class="h-4 w-4" /></template>
    Share
  </Button>

  <Dialog v-model="open" :options="{ title: dialogTitle, size: 'lg' }">
    <template #body-content>
      <div class="space-y-5">
        <!-- General access (first, Writer order) -->
        <div>
          <p class="mb-2 text-sm font-medium text-ink-gray-7">General access</p>
          <div class="flex items-center gap-2">
            <LucideIcon :name="share.isPublic.value ? 'globe' : 'lock'" class="h-4 w-4 text-ink-gray-6" />
            <select
              v-model="accessLevel"
              aria-label="General access"
              class="h-9 flex-1 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 outline-none"
            >
              <option value="restricted">Accessible to invited members</option>
              <option value="link">Accessible to anyone with the link</option>
            </select>
          </div>
        </div>

        <!-- People -->
        <div class="border-t border-outline-gray-1 pt-4">
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
              aria-label="Access level for the person being added"
              class="h-9 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 outline-none"
            >
              <option value="view">Can view</option>
              <option value="comment">Can comment</option>
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
                :value="m.level || (m.can_edit ? 'edit' : 'view')"
                :aria-label="`Access level for ${m.user}`"
                class="h-8 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-[13px] text-ink-gray-8 outline-none"
                @change="share.setMemberRole(m.user, $event.target.value)"
              >
                <option value="view">Can view</option>
                <option value="comment">Can comment</option>
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

        <!-- Copy link: persistent CTA with inline "Link copied" feedback. -->
        <div class="flex items-center justify-end gap-2 border-t border-outline-gray-1 pt-4">
          <span
            v-if="copied"
            class="flex items-center gap-1 text-[13px] font-medium text-ink-gray-6"
          >
            <LucideIcon name="check" class="h-4 w-4 text-green-600" /> Link copied
          </span>
          <Button variant="subtle" @click="doCopy">
            <template #prefix><LucideIcon name="link" class="h-4 w-4" /></template>
            Copy link
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
