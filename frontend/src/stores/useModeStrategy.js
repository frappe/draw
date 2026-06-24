// Provide/inject for the active mode strategy, mirroring provideDiagramStore /
// provideEditorUi. EditorShell computes the strategy from the document's
// diagramType and provides it; canvas/palette components inject it.

import { provide, inject } from 'vue'
import { getModeStrategy } from '@/diagram/modeStrategies.js'

const STRATEGY_KEY = 'modeStrategy'

export function provideModeStrategy(strategyRef) {
  provide(STRATEGY_KEY, strategyRef)
  return strategyRef
}

export function useModeStrategy() {
  return inject(STRATEGY_KEY)
}

export { getModeStrategy }
