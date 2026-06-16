<script setup>
// Share control: global-access toggle + copy link (spec §9). Stub: a button
// opening a popover with the toggle. The feature agent wires useShare.
import { Button, FeatherIcon } from 'frappe-ui'
</script>

<template>
  <Button variant="outline">
    <template #prefix><FeatherIcon name="share-2" class="h-4 w-4" /></template>
    Share
  </Button>
</template>
