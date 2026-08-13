<script setup>
// The single renderer for `confirm()` (see composables/useConfirm.js, #403).
// Mounted once at the app root, like frappe-ui's own <Dialogs /> host.
//
// The point of it is `:show-close-button="false"` alongside the default
// `dismissible` — a confirm carries its question, its two answers, and nothing
// else, while Esc and outside-click keep working.
//
// `sm`, not `md` (#424): a one-line question in a dialog sized for a form reads as
// a much bigger interruption than it is, which is what the delete-comment prompt
// was called out for. Every confirm in the app is the same two-answer question.
import { computed } from 'vue'
import { Button, Dialog, ErrorMessage } from 'frappe-ui'
import { useConfirmState, runConfirm, closeConfirm } from '@/composables/useConfirm.js'

const state = useConfirmState()

const THEME_ICON = {
  red: { name: 'lucide-triangle-alert', theme: 'red' },
  yellow: { name: 'lucide-triangle-alert', theme: 'yellow' },
  blue: { name: 'lucide-info', theme: 'blue' },
  green: { name: 'lucide-circle-check', theme: 'green' },
}

const request = computed(() => state.request || {})
const icon = computed(() => THEME_ICON[request.value.theme] || null)
// Button has no yellow, and an untinted solid reads as the neutral default.
const buttonTheme = computed(() =>
  request.value.theme === 'yellow' ? undefined : request.value.theme,
)

// Esc, outside-click and Cancel all land here. A dismissal while the action is
// in flight would strand the user with no view of how it ended.
function onOpenChange(open) {
  if (!open && !state.loading) closeConfirm()
}
</script>

<template>
  <Dialog
    :open="state.open"
    :title="request.title"
    :icon="icon"
    size="sm"
    :show-close-button="false"
    @update:open="onOpenChange"
  >
    <template #default>
      <div class="space-y-2">
        <p v-if="request.message" class="text-base text-ink-gray-7">{{ request.message }}</p>
        <ErrorMessage v-if="state.error" :message="state.error" />
      </div>
    </template>

    <template #actions>
      <div class="flex flex-row-reverse gap-2">
        <Button
          variant="solid"
          :theme="buttonTheme"
          :loading="state.loading"
          :label="request.confirmLabel || 'Confirm'"
          @click="runConfirm"
        />
        <Button
          variant="outline"
          :disabled="state.loading"
          :label="request.cancelLabel || 'Cancel'"
          @click="closeConfirm"
        />
      </div>
    </template>
  </Dialog>
</template>
