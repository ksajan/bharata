import { test, expect, type Page } from '@playwright/test'
import { dismissReveal } from './helpers'

/**
 * Regression: neutral regions must offer the Conquer order.
 * The UI once shipped an inverted predicate that hid it on every unclaimed region.
 */

async function draftAll(page: Page) {
  for (const personality of ['Iron Raja', 'Merchant Prince']) {
    await page.waitForSelector('text=Shape your Ruler')
    await page.locator('.modal').getByText(personality).first().click()
    await page.locator('.modal').getByText('Vaidya').first().click()
    await page.locator('.modal').getByText('Shipwright').first().click()
    await page.getByText('Take the Throne').click()
    await page.waitForTimeout(200)
  }
  const handoff = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await handoff.count()) {
    await handoff.click()
    await page.waitForTimeout(200)
  }
}

test('a neutral region with an army offers Conquer', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)

  await page.getByText('Step 1 — Draw Resource Card').click()
  await dismissReveal(page)
  await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await page.waitForTimeout(300)

  await page.locator('.army-box').first().click()
  const target = page.locator('g.region.moveable').first()
  await expect(target).toBeVisible()
  await target.click()
  await page.waitForTimeout(400)

  const panelText = await page.locator('.controls').innerText()
  // old region panel says "Ruled by: no one", the compact inspector says "unclaimed"
  const neutral = /unclaimed|no one/i.test(panelText)
  expect(panelText).toMatch(/province|Great Kingdom/i)
  if (neutral) {
    await expect(page.getByRole('button', { name: /Conquer/ })).toBeVisible()
  }

  expect(errors).toEqual([])
})
