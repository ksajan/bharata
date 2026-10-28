import { test, expect, type Page } from '@playwright/test'
import { acknowledgeHandoff } from './helpers'

/** A refresh must not throw away a local table. */

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

test('a refreshed hot-seat game resumes where it left off, and abandoning clears it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())

  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)

  await page.locator('.next-step button').click() // draw
  const take = page.getByRole('button', { name: 'Take the bounty' })
  if (await take.isVisible().catch(() => false)) await take.click()
  await expect(page.locator('.log-feed')).toContainText(/draws/i)

  const snapshot = await page.evaluate(() => {
    const raw = localStorage.getItem('bharata-hotseat-v1')
    const state = raw ? JSON.parse(raw).state : null
    return { present: !!raw, deck: state?.resourceDeck?.length ?? 0, rng: typeof state?.rngState }
  })
  expect(snapshot.present).toBe(true)
  expect(snapshot.deck).toBeGreaterThan(0)
  expect(snapshot.rng).toBe('number')

  await page.reload()
  const banner = page.locator('.resume-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/Bimbisara/)
  await banner.click()
  await acknowledgeHandoff(page)

  const takeAgain = page.getByRole('button', { name: 'Take the bounty' })
  if (await takeAgain.isVisible().catch(() => false)) await takeAgain.click()
  const pass = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await pass.count()) await pass.click()

  await expect(page.locator('.turn-banner')).toContainText(/holds court/i)
  await expect(page.locator('.log-feed')).toContainText(/draws/i)

  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.locator('.resume-banner')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('bharata-hotseat-v1'))).toBeNull()

  expect(errors).toEqual([])
})
