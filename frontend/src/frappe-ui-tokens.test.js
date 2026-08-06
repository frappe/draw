// Regression guard for #287. `bg-surface-white` / `text-ink-white` have CSS
// variables in frappe-ui/tailwind/colors.js, but the preset never emits the
// matching utility classes — so in our build they compile to *nothing* and the
// element renders transparent / its text invisible. (frappe-ui's own Tree.vue
// has the same latent bug.) Use `bg-surface-elevation-1` / `text-white`.
// This test fails if either dead class reappears anywhere in the source.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('.', import.meta.url))
const DEAD = ['bg-surface-white', 'text-ink-white']

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(vue|js|ts)$/.test(entry) && !/\.(test|spec|cy)\.[jt]s$/.test(entry)) out.push(p)
  }
  return out
}

describe('frappe-ui token hygiene (#287)', () => {
  const files = sourceFiles(SRC)

  it.each(DEAD)('no source file uses the dead class "%s"', (cls) => {
    const offenders = files
      .filter((f) => readFileSync(f, 'utf8').includes(cls))
      .map((f) => f.slice(SRC.length))
    expect(
      offenders,
      `"${cls}" emits no CSS in this build — use a real surface/ink token (e.g. bg-surface-elevation-1 / text-white)`,
    ).toEqual([])
  })
})
