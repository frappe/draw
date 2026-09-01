<script setup>
// App shell. FrappeUIProvider mounts the toast provider + viewport portal once
// at the root, so toast.success/error (export, copy, save errors) actually
// render (spec 16.1). Without it, toast.create() updated state nobody displayed.
// ConfirmHost renders Draw's own confirm dialog — frappe-ui's `dialog.confirm()`
// paints a redundant × that its API cannot switch off (#403). Mounted here, once,
// for the same reason the toast provider is.
import { FrappeUIProvider, TooltipProvider } from 'frappe-ui'
import ConfirmHost from '@/components/ConfirmHost.vue'
</script>

<template>
  <FrappeUIProvider>
    <TooltipProvider :hover-delay="2" :skip-delay="0">
      <div class="h-screen bg-surface-base text-ink-gray-9">
        <router-view />
      </div>
      <ConfirmHost />
    </TooltipProvider>
  </FrappeUIProvider>
</template>
