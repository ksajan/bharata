import { test, expect, type Page } from '@playwright/test'
import { dismissReveal } from './helpers'

/** The coach strip and the end-turn guard are the game's primary onboarding. */

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

test('the coach names the next step and guards a premature end turn', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)

  const coach = page.locator('.next-step .ns-text')
  await expect(coach).toContainText(/Draw the land/i)

  await page.locator('.next-step button').click()
  await dismissReveal(page)
  await expect(coach).toContainText(/Sell surplus/i)

  await page.locator('.next-step button').click()
  await expect(coach).toContainText(/Select an army/i)

  await page.getByRole('button', { name: 'End Turn →' }).click()
  await expect(page.getByRole('button', { name: 'End with actions left?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await expect(page.getByRole('button', { name: 'End Turn →' })).toBeVisible()

  expect(errors).toEqual([])
})
