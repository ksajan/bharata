import { test, expect } from '@playwright/test'

/** Cross-browser smoke: the menu, draft flow and board render in Chromium, Firefox and WebKit. */
test('menu, two drafts and a readable board', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'BHARATA 600 BC' })).toBeVisible()
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  for (const personality of ['Iron Raja', 'Merchant Prince']) {
    await page.waitForSelector('text=Shape your Ruler')
    await page.locator('.modal').getByText(personality).first().click()
    await page.locator('.modal').getByText('Vaidya').first().click()
    await page.locator('.modal').getByText('Shipwright').first().click()
    await page.getByText('Take the Throne').click()
    await page.waitForTimeout(150)
  }
  const handoff = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await handoff.count()) await handoff.click()
  await expect(page.locator('.turn-banner')).toContainText(/holds court/i)
  await expect(page.locator('g.region').count()).resolves.toBeGreaterThan(30)
})
