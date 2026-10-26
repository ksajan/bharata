import { test, expect, type Page } from '@playwright/test'
import { dismissReveal } from './helpers'

/** Action history: grouped by turn, filterable by ruler and kind, searchable. */

async function draftAll(page: Page) {
  for (const personality of ['Iron Raja', 'Merchant Prince']) {
    await page.waitForSelector('text=Shape your Ruler')
    await page.locator('.modal').getByText(personality).first().click()
    await page.locator('.modal').getByText('Vaidya').first().click()
    await page.locator('.modal').getByText('Shipwright').first().click()
    await page.getByText('Take the Throne').click()
    await page.waitForTimeout(150)
  }
  const handoff = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await handoff.count()) {
    await handoff.click()
    await page.waitForTimeout(150)
  }
}

async function startGame(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)
  await page.locator('.next-step button').first().click()
  await dismissReveal(page)
  await page.getByRole('button', { name: /Sell all/ }).click().catch(() => {})
  await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await page.waitForTimeout(250)
  await page.locator('.army-box').first().click()
  await page.waitForTimeout(200)
  const move = page.locator('g.region.moveable').first()
  if (await move.count()) await move.click()
  await page.waitForTimeout(400)
}

const historyButton = (page: Page) => page.getByRole('button', { name: 'History', exact: true })

test('history groups turns and filters by ruler and kind', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await startGame(page)

  await historyButton(page).click()
  const modal = page.locator('.history-modal')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.hist-turn').first()).toContainText(/Turn 1/i)
  await expect(modal.locator('.hist-entry').filter({ hasText: /draws/i }).first()).toBeVisible()
  await expect(modal.locator('.hist-entry').filter({ hasText: /marches/i }).first()).toBeVisible()

  // My actions
  await modal.getByRole('button', { name: 'My actions' }).click()
  await expect(modal.locator('.hist-entry').first()).toContainText(/Bimbisara/i)

  // A kind filter with no matches shows the empty state
  await modal.getByRole('button', { name: 'Battles' }).click()
  await expect(modal.locator('.history-empty')).toBeVisible()

  // Search
  await modal.getByRole('button', { name: 'All', exact: true }).click()
  await modal.getByRole('textbox', { name: 'Search history' }).fill('draws')
  await expect(modal.locator('.hist-entry')).toHaveCount(1)

  // Ruler filter (the guest's setup choice is still in Setup)
  await modal.getByRole('textbox', { name: 'Search history' }).fill('')
  await modal.getByRole('combobox', { name: 'Filter by ruler' }).selectOption({ label: 'Prasenajit' })
  await expect(modal.locator('.hist-entry').filter({ hasText: /Prasenajit/i }).first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  expect(errors).toEqual([])
})

test('history is reachable and readable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page)
  await historyButton(page).click()
  const modal = page.locator('.history-modal')
  await expect(modal).toBeVisible()
  const box = await modal.boundingBox()
  expect(box?.width ?? 999).toBeLessThanOrEqual(390)
  await expect(modal.locator('.hist-entry').first()).toBeVisible()
  await modal.getByRole('button', { name: 'Close' }).click()
  await expect(modal).toBeHidden()
})
