<script setup>
// Save PROBLEM indicator (spec §4.4, §8, README §4a). The healthy path is silent:
// a diagram that is saving normally, or is saved, shows nothing at all — steady
// state needs no chrome, and advertising "Saved" trains people to ignore the one
// place a real problem would appear (#307).
//
// A problem is one of two kinds, and the difference is the whole point (#504):
//
// - RETRYABLE — the save did not land and the next edit tries again. It says so and
//   asks for nothing, because there is nothing to do.
// - NEEDS A RELOAD — this tab cannot save at all. It names the reason, offers the
//   reload, and offers to download the document first: the editor goes on accepting
//   edits either way, so without that the honest warning is "your work is at risk"
//   with no way to act on it.
//
// `message` is autosave's freeze reason and is what marks the second kind. It wins
// over the status label: a frozen editor still accepts every edit, so "Save failed"
// alone left the user with no idea their work had stopped being kept, or what to do
// about it (GitHub #171).
//
// Losing the network is NOT reported here (#417). It is announced once as a toast,
// and saying "Save failed" underneath it would give one problem two voices — the
// louder of which is wrong, since the edits are safe locally and go up on reconnect.
import { computed } from 'vue'
import { Button } from 'frappe-ui'

const props = defineProps({
  status: { type: String, default: 'saved' },
  message: { type: String, default: '' },
  // Whether RELOADING can get this session working again. Downloading is offered
  // for every blocking failure — the document is still in memory either way — but
  // there is no coming back to a diagram that has been deleted.
  recoverable: { type: Boolean, default: true },
  offline: { type: Boolean, default: false },
})
const emit = defineEmits(['download'])

// A freeze reason means this tab cannot save; anything else that surfaces here is
// the retryable kind.
const blocked = computed(() => Boolean(props.message))

function reload() {
  window.location.reload()
}

const problem = computed(() => {
  if (props.message) return props.message
  if (props.offline) return ''
  // Not a bare "Save failed" any more: it did not land, and the next edit sends it
  // again, which is the part the user could not tell before.
  if (props.status === 'error') return 'Save failed — retrying.'
  return ''
})
</script>

<template>
  <div
    v-if="problem"
    class="flex flex-none items-center gap-1 text-sm text-ink-red-6"
    role="status"
  >
    <span class="lucide-circle-alert size-4 shrink-0" aria-hidden="true" />
    <span class="max-w-64 truncate" :title="problem">{{ problem }}</span>

    <!-- Only the blocking kind gets actions. A retry needs none, and offering a
         reload for one would invite people to throw away work over a hiccup that
         resolves itself. -->
    <template v-if="blocked">
      <Button
        variant="ghost"
        size="sm"
        theme="red"
        label="Download a copy"
        @click="emit('download')"
      />
      <Button
        v-if="recoverable"
        variant="ghost"
        size="sm"
        theme="red"
        label="Reload"
        @click="reload"
      />
    </template>
  </div>
</template>
