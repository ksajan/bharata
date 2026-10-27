import { test, expect, type Browser, type Page } from '@playwright/test'

async function open(browser: Browser, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByPlaceholder('e.g. Bimbisara').fill(name)
  return { ctx, page }
}

async function draft(page: Page, personality: string) {
  await page.waitForSelector('text=Shape your Ruler')
  await page.locator('.modal').getByText(personality).first().click()
  await page.locator('.modal').getByText('Vaidya').first().click()
  await page.locator('.modal').getByText('Shipwright').first().click()
  await page.getByText('Take the Throne').click()
  await page.waitForTimeout(250)
}

test('a watcher sees the table without a seat, and emotes reach every client', async ({ browser }) => {
  const host = await open(browser, 'Asoka')
  const guest = await open(browser, 'Chandra')
  await host.page.getByRole('button', { name: /Host Online Room/ }).click()
  await host.page.waitForTimeout(600)
  const code = (await host.page.locator('.room-code').textContent()).trim()
  await guest.page.locator('input[placeholder="CODE"]').fill(code)
  await guest.page.getByRole('button', { name: 'Join' }).click()
  await guest.page.waitForTimeout(500)
  await host.page.getByText(/Sound the Conch/).click()
  await draft(host.page, 'Iron Raja')
  await draft(guest.page, 'Merchant Prince')
  await host.page.waitForTimeout(500)

  // spectator enters with the same room code
  const watcher = await open(browser, 'Watcher')
  await watcher.page.locator('input[placeholder="CODE"]').fill(code)
  await watcher.page.getByRole('button', { name: 'Watch', exact: true }).click()
  await watcher.page.waitForTimeout(900)
  await expect(watcher.page.locator('.next-step .ns-text')).toContainText(/Watching the court/i)
  await expect(watcher.page.locator('.pc-you')).toHaveCount(0)
  await expect(watcher.page.locator('.emote-btn')).toHaveCount(0)
  await expect(watcher.page.locator('.draft-modal')).toHaveCount(0)
  await expect(watcher.page.getByRole('button', { name: 'History', exact: true })).toBeVisible()

  // emotes broadcast to the other ruler and the watcher
  await host.page.locator('.emote-btn').click()
  await expect(host.page.locator('.emote-menu')).toBeVisible()
  await host.page.getByRole('menuitem', { name: '👋' }).click()
  await expect(guest.page.locator('.emote-toast').filter({ hasText: 'Asoka' })).toBeVisible()
  await expect(watcher.page.locator('.emote-toast').filter({ hasText: 'Asoka' })).toBeVisible()

  await host.ctx.close()
  await guest.ctx.close()
  await watcher.ctx.close()
})
