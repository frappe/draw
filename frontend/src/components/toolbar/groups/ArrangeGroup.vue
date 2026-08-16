<script setup>
// Arrange, align, distribute and transform for the current block selection
// (#361), in ONE menu.
//
// They were four separate menu triggers, and four triggers is 128px of a bar
// that does not have it: with two shapes selected the bar wanted 155px more than
// a 1280px screen gives. These are the cheapest four to fold — every one was
// already a menu, so nothing lost a click that did not already cost one, and
// they are occasional work next to the formatting beside them.
//
// Each section still gates itself on the selection (align and distribute need
// two shapes), and PaletteSection carries its own heading and hairline, so
// stacking them needs nothing added between.
import { Popover } from 'frappe-ui'
import ArrangeSection from '@/components/palette-right/ArrangeSection.vue'
import AlignSection from '@/components/palette-right/AlignSection.vue'
import DistributeSizeSection from '@/components/palette-right/DistributeSizeSection.vue'
import TransformSection from '@/components/palette-right/TransformSection.vue'
import ToolbarButton from '../ToolbarButton.vue'
</script>

<template>
  <Popover>
    <template #trigger><ToolbarButton label="Arrange" icon="lucide-layers" /></template>
    <template #default>
      <div class="max-h-[70vh] w-[200px] overflow-y-auto">
        <ArrangeSection />
        <AlignSection />
        <DistributeSizeSection />
        <TransformSection />
      </div>
    </template>
  </Popover>
</template>
