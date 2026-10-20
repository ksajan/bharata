import { test, expect, type Page } from '@playwright/test'

/** Keyboard play and screen-reader affordances for the map. */

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
    await page.waitForTimeout(150)
  }
}

test('the board is keyboard navigable and announces regions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)

  const board = page.locator('.board-frame')
  await board.focus()
  const announce = page.locator('.board-stage .sr-only')
  await expect(announce).toContainText(/Value \d+/)

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.region.kbd-focus')).toHaveCount(1)
  const announced = (await announce.innerText()).trim()
  expect(announced).toMatch(/^[A-Z][a-zA-Z ]+\./)

  await page.keyboard.press('Enter')
  const panel = page.locator('.controls .col.region')
  const firstName = announced.split('.')[0]
  await expect(panel).toContainText(firstName)

  await page.keyboard.press('Escape')
  await expect(panel).toContainText(/Pick a region/i)

  await expect(page.locator('.log-feed')).toHaveAttribute('role', 'log')
  expect(errors).toEqual([])
})
