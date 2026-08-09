<script setup>
// Share dialog (SPEC §9), Writer-style: "General access" first — one VIEW-ONLY
// tier (restricted / all site users / anyone with the link), each shown with its
// icon in a small popover — then "People", inviting specific users by email as
// viewer / commenter / editor, backed by Frappe DocShare. A persistent "Copy link"
// CTA sits at the bottom with inline "Link copied" feedback (#106/#107). The tier
// list and per-member roles come from useShare so the dialog and its tests agree.
// Native <select>s for the per-user roles so the change event is reliable.
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Avatar, Button, Dialog, ItemListRow, Select, TextInput } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { loadDiagram } from '@/data/diagrams.js'
import { GENERAL_ACCESS_OPTIONS, MEMBER_ROLE_OPTIONS, useShare } from '@/composables/useShare.js'

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

// General access is a single VIEW-ONLY tier (issue #106): restricted / all site
// users / anyone with the link. A Select shows each tier with its icon and
// helper line; setGeneralAccess queues the change so a rapid re-pick is never
// dropped.
const generalAccessOptions = GENERAL_ACCESS_OPTIONS
const memberRoleOptions = MEMBER_ROLE_OPTIONS
// The tier list already stores each icon's complete lucide class.
const accessSelectOptions = generalAccessOptions.map((option) => ({
  value: option.value,
  label: option.label,
  description: option.description,
  icon: option.icon,
}))
const currentAccess = computed(
  () =>
    generalAccessOptions.find((o) => o.value === share.generalAccess.value) ||
    generalAccessOptions[0],
)
function chooseAccess(level) {
  share.setGeneralAccess(level)
}

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

  <Dialog v-model:open="open" :title="dialogTitle" size="lg">
    <template #default>
      <div class="space-y-5">
        <!-- General access (first, Writer order): one VIEW-ONLY tier for everyone. -->
        <div>
          <p class="mb-2 text-sm font-medium text-ink-gray-7">General access</p>
          <Select
            :model-value="share.generalAccess.value"
            :options="accessSelectOptions"
            size="lg"
            variant="outline"
            aria-label="General access"
            @update:model-value="chooseAccess"
          >
            <template #prefix>
              <span
                class="flex size-8 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
              >
                <span :class="currentAccess.icon" class="size-4" aria-hidden="true" />
              </span>
            </template>
            <template #trigger="{ label }">
              <span
                data-testid="general-access-trigger"
                :data-value="currentAccess.value"
                class="min-w-0 flex-1 text-left"
              >
                <span class="block truncate text-base font-medium text-ink-gray-8">{{ label }}</span>
                <span class="block truncate text-sm text-ink-gray-5">{{ currentAccess.description }}</span>
              </span>
            </template>
          </Select>
        </div>

        <!-- People -->
        <div class="border-t border-outline-gray-1 pt-4">
          <p class="mb-2 text-sm font-medium text-ink-gray-7">People</p>

          <!-- Invite by email + role. -->
          <div class="relative flex gap-2">
            <div class="relative flex-1">
              <TextInput
                v-model="query"
                class="w-full"
                type="text"
                size="lg"
                variant="outline"
                placeholder="Add people by email…"
                label="Add people by email"
                @keydown.enter="query.trim() && invite(query.trim())"
              />
              <!-- Search results dropdown. -->
              <div
                v-if="results.length"
                class="absolute left-0 right-0 top-10 z-10 max-h-56 overflow-auto rounded-md border border-outline-gray-2 bg-surface-base py-1 shadow-lg"
              >
                <ItemListRow
                  v-for="u in results"
                  :key="u.name"
                  as="button"
                  size="lg"
                  class="w-full"
                  @click="invite(u.name)"
                >
                  <template #prefix>
                    <Avatar size="sm" :image="u.user_image" :label="u.full_name || u.name" />
                  </template>
                  <template #label>
                    <span class="min-w-0 text-left">
                      <span class="block truncate text-base text-ink-gray-8">{{ u.full_name || u.name }}</span>
                      <span class="block truncate text-sm text-ink-gray-5">{{ u.name }}</span>
                    </span>
                  </template>
                </ItemListRow>
              </div>
            </div>
            <Select
              v-model="inviteRole"
              :options="memberRoleOptions"
              size="lg"
              variant="outline"
              aria-label="Access level for the person being added"
            />
          </div>

          <!-- Members list (owner first, then shared users). -->
          <div class="mt-3 space-y-1.5">
            <div class="flex items-center gap-2.5">
              <Avatar size="md" :label="ownerEmail" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm text-ink-gray-8">{{ ownerEmail }}</div>
              </div>
              <span class="text-[12px] text-ink-gray-5">Owner</span>
            </div>

            <div v-for="m in share.members.value" :key="m.user" class="flex items-center gap-2.5">
              <Avatar size="md" :image="m.user_image" :label="m.full_name || m.user" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm text-ink-gray-8">{{ m.full_name || m.user }}</div>
                <div class="truncate text-2xs text-ink-gray-5">{{ m.user }}</div>
              </div>
              <Select
                :model-value="m.level || (m.can_edit ? 'edit' : 'view')"
                :options="memberRoleOptions"
                size="md"
                variant="outline"
                :aria-label="`Access level for ${m.user}`"
                @update:model-value="share.setMemberRole(m.user, $event)"
              />
              <Button
                variant="ghost"
                theme="gray"
                size="md"
                icon="lucide-x"
                tooltip="Remove"
                :label="`Remove ${m.user}`"
                @click="share.removeMember(m.user)"
              />
            </div>
          </div>
        </div>

        <!-- Copy link: persistent CTA with inline "Link copied" feedback. -->
        <div class="flex items-center justify-end gap-2 border-t border-outline-gray-1 pt-4">
          <span
            v-if="copied"
            class="flex items-center gap-1 text-sm font-medium text-ink-gray-6"
          >
            <LucideIcon name="check" class="h-4 w-4 text-ink-green-2" /> Link copied
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
