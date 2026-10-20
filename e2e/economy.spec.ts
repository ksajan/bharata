import { test, expect, type Page } from '@playwright/test'

/** Resource draw must produce an unmissable reveal, and selling must be one click. */

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

test('drawing a resource card reveals it, and selling all is one click', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)

  await page.locator('.next-step button').click() // Draw resource
  const reveal = page.locator('.resource-reveal')
  await expect(reveal).toBeVisible()
  await expect(reveal.locator('.rr-title')).not.toBeEmpty()
  await expect(reveal.locator('.rr-text')).not.toBeEmpty()
  await page.getByRole('button', { name: 'Take the bounty' }).click()
  await expect(reveal).toBeHidden()

  const sellAll = page.getByRole('button', { name: /Sell all/ })
  if (await sellAll.isEnabled()) {
    await sellAll.click()
    await expect(page.locator('.log-feed')).toContainText(/sells goods for \d+ coins/i)
  }

  expect(errors).toEqual([])
})
