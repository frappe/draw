<script setup>
// Share dialog (SPEC §9). Laid out like Drive's, which is the dialog Slides and
// Writer both use (#422): "General access" — one VIEW-ONLY tier (restricted / all
// site users / anyone with the link) — then "Members", inviting specific users as
// viewer / commenter / editor, backed by Frappe DocShare, then Copy link.
//
// It is Drive's LAYOUT, not Drive's implementation. Slides shares by wrapping its
// document in a Drive File and handing the whole dialog to suite.drive; Draw has no
// Drive dependency (see the module note in draw/api/share.py) and shares through
// core DocShare instead. Adopting Drive's backend is the parked Suite work, #105.
//
// The tier list and per-member roles come from useShare so the dialog and its tests
// agree.
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Avatar, Button, Dialog, Select, TextInput } from 'frappe-ui'
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

// A member's row carries ONE control: the three roles plus Remove, the way Drive's
// share dialog does it (#422). Removal used to be a separate ✕ beside the role
// select, which put two controls in every row's trailing lane and left them
// drifting against each other; folding it in makes the lane a fixed width and the
// row read as "this person's access is …".
const MEMBER_ROW_OPTIONS = [...MEMBER_ROLE_OPTIONS, { value: 'remove', label: 'Remove' }]
function setMemberAccess(user, value) {
  if (value === 'remove') return share.removeMember(user)
  return share.setMemberRole(user, value)
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
  <!-- Icon only (#229). `label` is the accessible name, not visible text. -->
  <Button variant="ghost" icon="lucide-share-2" label="Share" tooltip="Share" @click="open = true" />

  <Dialog v-model:open="open" :title="dialogTitle" size="lg">
    <template #default>
      <div>
        <!-- General access: the audience on the left, what it grants on the right,
             on one row (#422). It was a full-width two-line field with an avatar-
             sized icon, which read as a disabled input rather than a control. -->
        <div class="mb-5 border-b border-outline-gray-2 pb-5">
          <p class="mb-2 text-sm text-ink-gray-5">General access</p>
          <div class="flex items-center justify-between gap-2">
            <!-- The two hooks ride on the control itself: e2e waits on the testid to
                 know the dialog is open, and reads data-value to know a tier change
                 has round-tripped to the server. They were on a custom #trigger
                 before; the default trigger is what makes the control compact. -->
            <Select
              :model-value="share.generalAccess.value"
              :options="accessSelectOptions"
              variant="outline"
              aria-label="General access"
              data-testid="general-access-trigger"
              :data-value="currentAccess.value"
              @update:model-value="chooseAccess"
            >
              <template #prefix>
                <span :class="currentAccess.icon" class="size-4 text-ink-gray-7" aria-hidden="true" />
              </template>
            </Select>
            <!-- Deliberately text, not a second dropdown. Drive shows a permission
                 picker here, but general access in Draw is VIEW-ONLY by design
                 (#106) — a select holding one option is a control that cannot be
                 used. -->
            <span
              v-if="share.generalAccess.value !== 'restricted'"
              class="shrink-0 pr-2 text-base text-ink-gray-6"
              >Can view</span
            >
          </div>
          <p class="mt-2 text-sm text-ink-gray-5">{{ currentAccess.description }}</p>
        </div>

        <!-- Members -->
        <p class="mb-2 text-sm text-ink-gray-5">Members</p>

        <!-- Invite: the field and the role it grants are ONE control, so the role
             reads as part of the invite rather than a setting floating beside it. -->
        <div
          class="relative mb-4 flex items-start gap-2 rounded bg-surface-base p-1.5 ring-1 ring-outline-gray-2"
        >
          <TextInput
            v-model="query"
            class="min-w-0 flex-1"
            type="text"
            variant="ghost"
            placeholder="Add people or groups"
            aria-label="Add people by email"
            @keydown.enter="query.trim() && invite(query.trim())"
          />
          <Select
            v-model="inviteRole"
            :options="memberRoleOptions"
            variant="ghost"
            aria-label="Access level for the person being added"
          />

          <!-- Search results. -->
          <div
            v-if="results.length"
            class="absolute left-0 right-0 top-12 z-10 max-h-56 overflow-auto rounded-md border border-outline-gray-2 bg-surface-base py-1 shadow-lg"
          >
            <button
              v-for="u in results"
              :key="u.name"
              type="button"
              class="flex w-full items-center gap-2.5 px-2 py-1.5 text-left hover:bg-surface-gray-2"
              @click="invite(u.name)"
            >
              <Avatar size="sm" :image="u.user_image" :label="u.full_name || u.name" />
              <span class="min-w-0">
                <span class="block truncate text-base text-ink-gray-8">{{ u.full_name || u.name }}</span>
                <span class="block truncate text-sm text-ink-gray-5">{{ u.name }}</span>
              </span>
            </button>
          </div>
        </div>

        <!-- Member list: owner first, then everyone shared with. Every row ends in
             the same fixed-width lane so the controls line up down the column. -->
        <div class="flex max-h-64 flex-col gap-3 overflow-y-auto py-1">
          <div class="flex items-center gap-3 pr-1">
            <Avatar size="xl" :label="ownerEmail" />
            <span class="min-w-0 flex-1 truncate text-base-medium text-ink-gray-9">{{ ownerEmail }}</span>
            <span class="ml-auto flex w-28 shrink-0 justify-end text-base text-ink-gray-5">Owner</span>
          </div>

          <div v-for="m in share.members.value" :key="m.user" class="flex items-center gap-3 pr-1">
            <Avatar size="xl" :image="m.user_image" :label="m.full_name || m.user" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-base-medium text-ink-gray-9">{{ m.full_name || m.user }}</span>
              <span v-if="m.full_name" class="truncate text-sm text-ink-gray-7">{{ m.user }}</span>
            </span>
            <span class="ml-auto flex w-28 shrink-0 justify-end">
              <Select
                :model-value="m.level || (m.can_edit ? 'edit' : 'view')"
                :options="MEMBER_ROW_OPTIONS"
                variant="ghost"
                :aria-label="`Access level for ${m.user}`"
                @update:model-value="setMemberAccess(m.user, $event)"
              />
            </span>
          </div>
        </div>

        <div class="mt-8 flex w-full items-center justify-end gap-2">
          <span v-if="copied" class="flex items-center gap-1 text-sm text-ink-gray-6">
            <span class="lucide-check h-4 w-4 text-ink-green-2" aria-hidden="true" /> Link copied
          </span>
          <Button variant="outline" icon-left="lucide-link-2" label="Copy link" @click="doCopy" />
        </div>
      </div>
    </template>
  </Dialog>
</template>
