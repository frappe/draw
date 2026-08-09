import { test, expect } from '../helpers/fixtures.js'

// Every icon in the app is a lucide CSS class (#311). That has one silent
// failure mode: if Tailwind's JIT never sees the class — a name built at runtime,
// or a safelist that fell out of step with the data — the element still renders,
// still has its other classes, and simply measures ZERO. Nothing throws and
// nothing looks broken in the DOM.
//
// So this asserts the BOX of every lucide element on each surface, rather than
// its presence. A unit test cannot catch it: the class has to reach real CSS.

const collect = () =>
  [...document.querySelectorAll('[class*="lucide-"]')].map((el) => {
    const r = el.getBoundingClientRect()
    const cls = [...el.classList].find((c) => c.startsWith('lucide-'))
    const style = getComputedStyle(el)
    return { cls, w: r.width, h: r.height, hidden: style.display === 'none' || style.visibility === 'hidden' }
  })

for (const type of ['block', 'mindmap', 'flowchart', 'whiteboard', 'unified']) {
  test(`icons render on a ${type} document`, async ({ page, diagram }) => {
    await diagram.open(type, {})
    await page.waitForTimeout(1200)
    const icons = await page.evaluate(collect)
    const broken = icons.filter((i) => !i.hidden && (i.w === 0 || i.h === 0))
    expect(icons.length, 'no lucide icons found at all — selector or build is wrong').toBeGreaterThan(3)
    expect(broken, `zero-sized icons on ${type}`).toEqual([])
  })
}

test('icons render on Home', async ({ page }) => {
  await page.goto('/draw')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  const icons = await page.evaluate(collect)
  const broken = icons.filter((i) => !i.hidden && (i.w === 0 || i.h === 0))
  expect(icons.length).toBeGreaterThan(3)
  expect(broken, 'zero-sized icons on Home').toEqual([])
})
