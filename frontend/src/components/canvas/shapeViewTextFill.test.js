import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #579: Setting Fill and Border on a text box must paint a background and border
// rectangle behind the text in ShapeView.vue on the canvas.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'ShapeView.vue'), 'utf8')

describe('ShapeView renders fill and border for text box shapes (#579)', () => {
  it('includes shape.type === "text" in the body rect rendering branch', () => {
    expect(source).toContain("shape.type === 'text'")
    expect(source).toMatch(
      /<rect[^>]*v-else-if="[^"]*shape\.type === 'text'[^"]*"[^>]*:fill="fill"[^>]*:stroke="border\.color"/,
    )
  })
})
