<script setup>
// App shell. FrappeUIProvider mounts the toast provider + viewport portal once
// at the root, so toast.success/error (export, copy, save errors) actually
// render (spec 16.1). Without it, toast.create() updated state nobody displayed.
import { FrappeUIProvider } from 'frappe-ui'
</script>

<template>
  <FrappeUIProvider>
    <div class="h-screen bg-surface-base text-ink-gray-9">
      <router-view />
    </div>
  </FrappeUIProvider>
</template>
