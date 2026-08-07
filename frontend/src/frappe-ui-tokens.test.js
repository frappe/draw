// Regression guard for #287 and the dead-token cleanup. Some frappe-ui token
// classes have CSS *variables* in frappe-ui/tailwind/colors.js but NO generated
// Tailwind utility in our build, so they compile to nothing — the element
// renders transparent / borderless / with a fallback accent. The trap is a
// property↔family mismatch: borders come from the `outline-*` family (never
// `ink-*`); the ring and accent families include neither `surface-*` nor
// `ink-*`. All verified by compiling against the real tailwind.config.js.
// Fail if any dead class reappears anywhere in source.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('.', import.meta.url))

// [pattern, the working replacement]
const FORBIDDEN = [
  [/\bbg-surface-white\b/, 'bg-surface-elevation-1 (bg-surface-white renders transparent)'],
  [/\btext-ink-white\b/, 'text-white (text-ink-white renders invisible)'],
  [/\bborder-ink-gray-\d/, 'border-outline-gray-* (the border family is outline, not ink)'],
  [/\baccent-ink-\w/, 'accent-gray-* (the accent family has no ink tokens)'],
  [/\bring-surface-\w/, 'ring-white / ring-outline-* (the ring family has no surface tokens)'],
]

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
  const files = sourceFiles(SRC).map((f) => [f.slice(SRC.length), readFileSync(f, 'utf8')])

  it.each(FORBIDDEN)('no source uses a dead token class (%s)', (pattern, fix) => {
    const offenders = files.filter(([, txt]) => pattern.test(txt)).map(([rel]) => rel)
    expect(offenders, `dead frappe-ui token class — use ${fix}`).toEqual([])
  })
})
