import { test, expect, type Page } from '@playwright/test'

/** Deterministic visual smoke for the two screens that carry the art direction. */

async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
}

test('menu and board visual snapshots', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'BHARATA 600 BC' })).toBeVisible()
  await waitForFonts(page)
  await expect(page).toHaveScreenshot('menu-desktop.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })

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
  await waitForFonts(page)
  await expect(page).toHaveScreenshot('board-desktop.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
})
