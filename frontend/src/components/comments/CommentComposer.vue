<script setup>
// Compose box for a new comment or a reply, with a lightweight @mention picker.
// Typing "@name" opens a user search (draw.api.share.search_users, the same one the
// Share dialog uses); choosing someone splices a `@[Full Name](id)` token the backend
// parses to notify them. Enter submits (Shift+Enter = newline); Escape cancels —
// unless the mention menu is open, which then owns those keys.
import { ref, nextTick } from 'vue'
import { call, Button, Textarea } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { buildMentionToken } from './commentMarkup.js'

const props = defineProps({
  placeholder: { type: String, default: 'Add a comment…' },
  submitLabel: { type: String, default: 'Comment' },
  autofocus: { type: Boolean, default: false },
  showCancel: { type: Boolean, default: true },
  // Seed text for edit mode (the raw stored content, mention tokens and all).
  initial: { type: String, default: '' },
})
const emit = defineEmits(['submit', 'cancel'])

const text = ref(props.initial || '')
const textarea = ref(null)
const submitting = ref(false)

// @mention menu state.
const mentionOpen = ref(false)
const mentionResults = ref([])
const mentionIndex = ref(0)
let mentionStart = 0
let searchToken = 0

function focus() {
  nextTick(() => textarea.value?.el?.focus())
}
if (props.autofocus) focus()
defineExpose({ focus })

async function submit() {
  const value = text.value.trim()
  if (!value || submitting.value) return
  submitting.value = true
  try {
    await emit('submit', value)
    text.value = ''
  } finally {
    submitting.value = false
  }
}

function cancel() {
  text.value = ''
  closeMention()
  emit('cancel')
}

// ----- @mention detection -----

function onInput() {
  const el = textarea.value?.el
  if (!el) return
  const upto = text.value.slice(0, el.selectionStart)
  // An @ at the start or after whitespace, then a run without whitespace/newline.
  const match = upto.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match) return closeMention()
  mentionStart = el.selectionStart - match[1].length - 1
  searchMentions(match[1])
}

async function searchMentions(query) {
  const token = ++searchToken
  try {
    const users = query.length ? await call('draw.api.share.search_users', { txt: query }) : []
    if (token !== searchToken) return
    mentionResults.value = users || []
    mentionOpen.value = mentionResults.value.length > 0
    mentionIndex.value = 0
  } catch (error) {
    closeMention()
  }
}

function closeMention() {
  mentionOpen.value = false
  mentionResults.value = []
}

function pickMention(user) {
  const el = textarea.value?.el
  const before = text.value.slice(0, mentionStart)
  const after = text.value.slice(el ? el.selectionStart : text.value.length)
  const inserted = `${buildMentionToken({ name: user.name, full_name: user.full_name })} `
  text.value = before + inserted + after
  closeMention()
  nextTick(() => {
    const pos = (before + inserted).length
    el?.setSelectionRange(pos, pos)
    el?.focus()
  })
}

// ----- keys -----

function onKeydown(event) {
  if (mentionOpen.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentionIndex.value = (mentionIndex.value + 1) % mentionResults.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentionIndex.value = (mentionIndex.value - 1 + mentionResults.value.length) % mentionResults.value.length
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      pickMention(mentionResults.value[mentionIndex.value])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      return closeMention()
    }
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    return submit()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    return cancel()
  }
}
</script>

<template>
  <div class="relative">
    <Textarea
      ref="textarea"
      v-model="text"
      class="w-full"
      variant="outline"
      :placeholder="placeholder"
      :rows="2"
      label="Write a comment"
      @input="onInput"
      @keydown="onKeydown"
    />

    <!-- @mention picker -->
    <div
      v-if="mentionOpen"
      class="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-outline-gray-2 bg-surface-elevation-1 py-1 shadow-xl"
    >
      <button
        v-for="(user, i) in mentionResults"
        :key="user.name"
        type="button"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-p-sm"
        :class="i === mentionIndex ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1'"
        @mousedown.prevent="pickMention(user)"
      >
        <span class="truncate font-medium text-ink-gray-8">{{ user.full_name || user.name }}</span>
        <span class="truncate text-p-xs text-ink-gray-5">{{ user.name }}</span>
      </button>
    </div>

    <div class="mt-1.5 flex items-center justify-end gap-2">
      <Button v-if="showCancel" variant="ghost" size="sm" label="Cancel" @click="cancel" />
      <Button variant="solid" size="sm" :loading="submitting" :disabled="!text.trim()" @click="submit">
        <template #prefix><LucideIcon name="message-square" class="h-3.5 w-3.5" /></template>
        {{ submitLabel }}
      </Button>
    </div>
  </div>
</template>
