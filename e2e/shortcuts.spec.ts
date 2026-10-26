import { test, expect, type Page } from '@playwright/test'

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

test('H opens history and ? opens the rules', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)

  await page.keyboard.press('h')
  await expect(page.locator('.history-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.history-modal')).toBeHidden()

  await page.keyboard.press('?')
  await expect(page.getByText(/How to play Bharata/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText(/How to play Bharata/)).toBeHidden()
})
