import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #475: the canvas font menu against Espresso. Browser-free node env, so the list is
// asserted by source inspection, the house pattern for these components.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'groups/TextGroup.vue'), 'utf8')

// design/colors_and_type.css lines 190-192. Restated here so a drift in either
// direction fails: Espresso's stack is the contract, not whatever TextGroup holds.
const ESPRESSO_SANS = "'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
const ESPRESSO_MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace"

// The FONTS array alone, so an assertion about which options exist cannot be
// satisfied — or broken — by the prose around it.
const fontList = source.slice(source.indexOf('const FONTS = ['), source.indexOf(']', source.indexOf('const FONTS = [')))

describe('the canvas font menu (#475)', () => {
  it('matches Espresso exactly on the two typefaces Espresso defines', () => {
    expect(source).toContain(`const ESPRESSO_SANS = "${ESPRESSO_SANS}"`)
    expect(source).toContain(`const ESPRESSO_MONO = "${ESPRESSO_MONO}"`)
    expect(source).toContain("{ label: 'Inter', value: ESPRESSO_SANS }")
    expect(source).toContain("{ label: 'Mono', value: ESPRESSO_MONO }")
  })

  // Inter was `value: ''`, so a shape inherited whatever the canvas happened to be
  // set in rather than naming the stack it claims to use.
  it('names Inter a real stack instead of inheriting one', () => {
    expect(source).not.toContain("{ label: 'Inter', value: '' }")
  })

  // Espresso's mono list is the same as the one Draw had, plus JetBrains Mono in
  // second place. That one entry was the whole difference.
  it('keeps JetBrains Mono in the mono stack', () => {
    expect(ESPRESSO_MONO).toContain("'JetBrains Mono'")
  })

  // Nunito was never loaded anywhere in the app — no @font-face, no import — so
  // "Rounded" fell back to Segoe UI or system-ui and had never rendered as anything
  // rounded. An option that does nothing is worse than one fewer option.
  // Bound to the list, not the file: the comment above it records why Rounded went,
  // and naming the option it removed must not fail the check that it is gone.
  it('drops Rounded, which never had a font to render with', () => {
    expect(fontList).not.toContain('Rounded')
    expect(fontList).not.toContain('Nunito')
    expect(fontList.match(/label:/g)).toHaveLength(4)
  })

  // The canvas is the explicit exception to chrome tokens (cardinal rule 2), so the
  // two faces Espresso has no opinion on stay as canvas-only extras.
  it('keeps the faces Espresso does not define', () => {
    expect(source).toContain("label: 'Serif'")
    expect(source).toContain("label: 'Handwritten'")
  })

  // With Inter naming a stack, an unset font no longer matches any option. Left as
  // '', the Select would render blank on every shape that has never had a font
  // picked — which is most of them.
  it('resolves an unset font to Inter so the Select still shows a value', () => {
    expect(source).toContain('textStyle.value.font || ESPRESSO_SANS')
  })
})

describe('the text colour picker (#581)', () => {
  it('uses Writer’s compact quick-colour row with an arbitrary-colour picker', () => {
    expect(source).toContain("const WRITER_TEXT_COLORS = ['#FFB3E6', '#00B3E6', '#E6B333', '#3366E6', '#999966', '#99FF99', '#B34D4D', '#80B300']")
    expect(source).toContain('class="w-[176px] p-3"')
    expect(source).toContain('<ColorPickerBody :show-quick-colors="false"')
  })

  it('initializes from the active range color when editing', () => {
    expect(source).toContain('import { richCommands, isMarkActive, activeTextColor }')
    expect(source).toContain('if (editing.value && activeTextColor.value)')
  })
})
