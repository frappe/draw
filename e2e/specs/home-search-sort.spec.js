import { test, expect } from '../helpers/fixtures.js'
import { createDiagram, deleteDiagram, gotoHome } from '../helpers/api.js'
import { documents } from '../fixtures/documents.js'

// #449 items 4/5 reported that Home's search and sort do nothing. The rules are
// unit-tested in homeViews.test.js; these drive the real page, because the report
// was about the CONTROLS, and a filter that works behind a field nobody can reach
// is the same bug to the person using it.
//
// The library on a dev site holds whatever earlier runs left behind, so every
// assertion is about THESE three rows: seeded with a shared marker in the title,
// found by that marker, and deleted afterwards.

const MARKER = 'zzsearchcase'
const TITLES = [`${MARKER} alpha kite`, `${MARKER} bravo lantern`, `${MARKER} charlie kite`]

const rows = (page) => page.locator('[data-diagram-row]')
const searchField = (page) => page.getByRole('textbox', { name: 'Search diagrams' })
const seededRows = (page) => rows(page).filter({ hasText: MARKER })

test.describe('Home search and sort (#449)', () => {
  let created = []

  test.beforeEach(async ({ page }) => {
    await gotoHome(page)
    created = []
    for (const title of TITLES) {
      created.push(await createDiagram(page, { type: 'unified', title, document: documents.unified({}) }))
    }
    await gotoHome(page)
  })

  test.afterEach(async ({ page }) => {
    for (const name of created) await deleteDiagram(page, name)
  })

  test('searching narrows the list, and clearing it restores what was there', async ({ page }) => {
    await expect(seededRows(page)).toHaveCount(3)
    const before = await rows(page).count()

    await searchField(page).fill('lantern')
    await expect(rows(page), 'the search did not filter the list').toHaveCount(1)
    await expect(rows(page).first()).toContainText('lantern')

    // Case and stray spaces must not matter.
    await searchField(page).fill('  KITE ')
    await expect(rows(page)).toHaveCount(2)

    await searchField(page).fill('')
    await expect(rows(page), 'clearing the search did not restore the list').toHaveCount(before)
  })

  test('a search that matches nothing says so', async ({ page }) => {
    await searchField(page).fill('nothingmatchesthisatall')

    await expect(rows(page)).toHaveCount(0)
    await expect(page.getByText('No diagrams match')).toBeVisible()
  })

  test('sorting by name reorders the list and says which sort is on', async ({ page }) => {
    const sort = page.getByRole('button', { name: /^Sort by/ })
    await expect(sort, 'the bar does not name the active sort').toContainText('Last edited')

    // Narrow to the seeded rows first, so the order asserted is only theirs.
    await searchField(page).fill(MARKER)
    await sort.click()
    await page.getByRole('menuitem', { name: 'Name (A–Z)' }).click()

    await expect(sort).toContainText('Name')
    await expect(rows(page).nth(0)).toContainText('alpha')
    await expect(rows(page).nth(1)).toContainText('bravo')
    await expect(rows(page).nth(2)).toContainText('charlie')
  })

  test('search and sort work together', async ({ page }) => {
    await searchField(page).fill('kite')
    await page.getByRole('button', { name: /^Sort by/ }).click()
    await page.getByRole('menuitem', { name: 'Name (A–Z)' }).click()

    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).nth(0)).toContainText('alpha')
    await expect(rows(page).nth(1)).toContainText('charlie')
  })
})
