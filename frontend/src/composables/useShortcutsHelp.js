// Shared toggle for the keyboard-shortcuts cheat-sheet. A module-level ref so the
// `?` key handler (in useKeyboard) and the dialog (in EditorShell) share one
// source without prop plumbing.
import { ref } from 'vue'

export const shortcutsOpen = ref(false)

export function toggleShortcutsHelp() {
  shortcutsOpen.value = !shortcutsOpen.value
}
