<script setup>
// App settings, opened from the Home top bar. Holds the document DEFAULTS for new
// diagrams — the theme preset that colours their shapes, the canvas background,
// and the mind-map child style — written straight to the persisted settings
// singleton (useAppSettings), so a choice survives reloads and applies to the next
// diagram created. No dark mode (removed in #91).
//
// Built on frappe-ui's SettingsDialog family (#301): a sidebar of grouped tabs, a
// pinned panel header, and one SettingsRow per setting. There is one tab today;
// the structure is what makes adding a second one a two-line change.
import { ref } from 'vue'
import {
  Button,
  SettingsBody,
  SettingsContent,
  SettingsDialog,
  SettingsHeader,
  SettingsNavGroup,
  SettingsNavItem,
  SettingsPanel,
  SettingsRow,
  SettingsSidebar,
  TabButtons,
} from 'frappe-ui'
import { useAppSettings } from '@/composables/useAppSettings.js'
import { THEME_PRESETS, DEFAULT_THEME_PRESET } from '@/diagram/theme.js'

const open = defineModel('open', { type: Boolean, default: false })
const { settings } = useAppSettings()

const tab = ref('diagram-defaults')

// Presets in display order — the neutral default (slate) first, then the rest as
// declared in theme.js. Each tile previews its triad's three stroke colours,
// which are the distinctive part (fills are all pale).
const themeOrder = [DEFAULT_THEME_PRESET, ...Object.keys(THEME_PRESETS).filter((name) => name !== DEFAULT_THEME_PRESET)]
const themePresets = themeOrder.map((name) => ({
  name,
  label: THEME_PRESETS[name].label,
  bands: [THEME_PRESETS[name].t.stroke, THEME_PRESETS[name].t2.stroke, THEME_PRESETS[name].t3.stroke],
}))

// Canvas background options. null = "None" — renders white in the editor but
// exports transparent (schema.js NO_COLOR); the checkerboard swatch signals that.
const backgroundOptions = [
  { value: null, label: 'None' },
  { value: '#FFFFFF', label: 'White' },
  { value: '#F5F5F5', label: 'Light grey' },
]
const CHECKER = 'repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

// Default look of a new mind-map child node (#126). 'text' keeps the current
// Whimsical-style transparent text (#125); 'shape' boxes children like the root.
const childStyleOptions = [
  { value: 'text', label: 'Text' },
  { value: 'shape', label: 'Shape' },
]
</script>

<template>
  <SettingsDialog v-model="open" v-model:tab="tab" size="4xl">
    <SettingsSidebar>
      <SettingsNavGroup>
        <SettingsNavItem value="diagram-defaults">
          <template #prefix>
            <span class="lucide-palette size-4 text-ink-gray-6" aria-hidden="true" />
          </template>
          Diagram defaults
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>

    <SettingsContent>
      <SettingsPanel value="diagram-defaults">
        <SettingsHeader
          title="Diagram defaults"
          description="Applied to diagrams you create from now on. Existing diagrams keep their own settings."
        />
        <SettingsBody>
          <SettingsRow title="Default color theme" description="Colours the shapes in diagrams you create.">
            <div class="flex flex-wrap justify-end gap-2">
              <Button
                v-for="preset in themePresets"
                :key="preset.name"
                class="!h-auto !w-auto !p-2"
                theme="gray"
                size="md"
                :variant="settings.defaultThemePreset === preset.name ? 'subtle' : 'outline'"
                :label="preset.label"
                :tooltip="preset.label"
                @click="settings.defaultThemePreset = preset.name"
              >
                <template #icon>
                  <span class="flex h-8 w-12 overflow-hidden rounded-[5px] border border-outline-gray-2">
                    <span v-for="band in preset.bands" :key="band" class="flex-1" :style="{ background: band }" />
                  </span>
                </template>
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow
            title="Default canvas background"
            description="The page colour behind new diagrams. None exports transparent."
          >
            <div class="flex flex-wrap justify-end gap-2">
              <Button
                v-for="option in backgroundOptions"
                :key="option.label"
                class="!h-auto !w-auto !p-2"
                theme="gray"
                size="md"
                :variant="settings.defaultCanvasBackground === option.value ? 'subtle' : 'outline'"
                :label="option.label"
                :tooltip="option.label"
                @click="settings.defaultCanvasBackground = option.value"
              >
                <template #icon>
                  <span
                    class="h-8 w-12 rounded-[5px] border border-outline-gray-2"
                    :style="{ background: option.value || CHECKER }"
                  />
                </template>
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow
            title="Mind map child nodes"
            description="How a new child node looks by default. Text is Whimsical-style; Shape draws a box like the root."
          >
            <TabButtons v-model="settings.mindmapChildStyle" size="sm" :options="childStyleOptions" />
          </SettingsRow>
        </SettingsBody>
      </SettingsPanel>
    </SettingsContent>
  </SettingsDialog>
</template>
