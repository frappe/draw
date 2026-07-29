import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import path from 'node:path'
import ICON_NODES from './lucideNodes.js'
import { LUCIDE_ALIAS } from './lucideAlias.js'

// lucideNodes.js is GENERATED (`yarn icons`) from the icon names it finds in src/.
// Adding a <LucideIcon name="…"> without regenerating leaves the name unresolved,
// and LucideIcon silently falls back to a plain circle — so a button keeps working
// but shows the wrong glyph. That is invisible to every other test.
//
// This caught four at once: layout-template, git-fork and workflow (the whole
// Insert menu on the unified canvas) plus hard-drive (Add to Drive), all rendering
// as identical generic circles.

const SRC = path.resolve(import.meta.dirname, '..')

// Names that look like icons to the grep but are other `name="…"` attributes.
const NOT_ICONS = new Set(['append', 'icon'])

function referencedIconNames() {
  // Same shape of scan the generator uses, so the two agree on what "referenced" means.
  const out = execSync(`grep -rhoE 'name="[a-z][a-z0-9-]*"' ${SRC}`, { encoding: 'utf8' })
  const names = new Set()
  for (const m of out.matchAll(/name="([a-z][a-z0-9-]*)"/g)) {
    if (!NOT_ICONS.has(m[1])) names.add(m[1])
  }
  return [...names].sort()
}

describe('generated lucide icon set', () => {
  it('resolves every icon name referenced in src/', () => {
    const missing = referencedIconNames().filter((name) => !ICON_NODES[LUCIDE_ALIAS[name] || name])
    expect(
      missing,
      `these icons fall back to a circle — run \`yarn icons\` to regenerate ` +
        `(or add an alias in lucideAlias.js if lucide renamed one)`,
    ).toEqual([])
  })

  it('has a circle to fall back to', () => {
    // LucideIcon depends on this existing for unknown names.
    expect(ICON_NODES.circle).toBeTruthy()
  })
})
