// Correctness linting for the frontend (#367).
//
// This exists because of one specific failure. Removing an import that looked
// unused left a live reference behind, the component threw
// `ReferenceError: computed is not defined` at setup, and the whole bottom-left
// zoom group stopped rendering — while `yarn build` and all 858 tests passed.
// Vite does not fail on an undefined identifier inside `<script setup>`: it is
// valid JavaScript that only throws when the setup function runs, and the unit
// tests are browser-free and mount nothing.
//
// So the rules here are deliberately narrow: the mistakes a machine can catch
// and this repo's existing checks structurally cannot.
//
// NO formatting rules, and no Prettier. The frontend is hand-formatted with no
// config; `vue3-recommended` would rewrite most of it and bury real diffs in
// noise. `flat/essential` is the plugin's "prevent errors" tier only.

import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

// `<script setup>` compiler macros are not imported, so no-undef flags every
// component without them.
const compilerMacros = {
  defineProps: 'readonly',
  defineEmits: 'readonly',
  defineExpose: 'readonly',
  defineOptions: 'readonly',
  defineModel: 'readonly',
  defineSlots: 'readonly',
  withDefaults: 'readonly',
}

export default [
  {
    // vite.config.ts needs typescript-eslint to parse; the generated .d.ts files
    // are not ours to lint. Neither carries the class of bug this is here for.
    ignores: ['dist/**', 'node_modules/**', '**/*.ts', '**/*.d.ts'],
  },

  ...pluginVue.configs['flat/essential'],

  {
    files: ['**/*.js', '**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...compilerMacros },
    },
    rules: {
      // The two that would have caught the regression above, and the ones most
      // likely to recur while components are being moved around.
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
      // A component imported and never placed in the template is dead weight
      // that survives every other check.
      'vue/no-unused-components': 'error',
      // OFF: a naming convention, not a correctness check. Logomark, Minimap and
      // Rulers are established names used across the codebase and the specs;
      // renaming them to satisfy a style rule is churn with nothing behind it.
      'vue/multi-word-component-names': 'off',
    },
  },

  {
    // Build and test config run in Node, not the browser.
    files: ['*.js', 'src/**/*.test.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
