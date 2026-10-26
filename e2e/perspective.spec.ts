import { test, expect, type Browser, type Page } from '@playwright/test'

/** What each ruler actually sees in a live room. */

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
  await page.waitForTimeout(200)
}

async function placeEventOrSkip(page: Page) {
  for (let i = 0; i < 4; i++) {
    const evt = page.locator('.event-card-face')
    if (!(await evt.isVisible().catch(() => false))) return
    const targets = page.locator('.modal .actions-row button')
    if (await targets.count()) await targets.first().click()
    else {
      const skip = page.getByText(/finds no foothold/)
      if (await skip.isVisible().catch(() => false)) await skip.click()
      else return
    }
    await page.waitForTimeout(350)
  }
}

test('the drawer’s reveal and card stay private to the active ruler', async ({ browser }) => {
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

  // each client knows which ruler is theirs
  await expect(host.page.locator('.player-card').filter({ hasText: 'Asoka' }).locator('.pc-you')).toHaveCount(1)
  await expect(guest.page.locator('.player-card').filter({ hasText: 'Chandra' }).locator('.pc-you')).toHaveCount(1)
  await expect(guest.page.locator('.player-card').filter({ hasText: 'Asoka' }).locator('.pc-you')).toHaveCount(0)

  // only the active drawer sees the reveal
  await host.page.locator('.next-step button').first().click()
  await expect(host.page.locator('.resource-reveal')).toBeVisible()
  await expect(guest.page.locator('.resource-reveal')).toHaveCount(0)
  await host.page.getByRole('button', { name: 'Take the bounty' }).click()
  await host.page.waitForTimeout(200)

  // the guest sees the ledger feedback without the first-person card
  await expect(guest.page.locator('.fx-ledger')).toBeVisible()
  await host.page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await host.page.waitForTimeout(300)
  await host.page.getByRole('button', { name: 'End Turn →' }).click()
  const anyway = host.page.getByRole('button', { name: 'End with actions left?' })
  if (await anyway.isVisible().catch(() => false)) await anyway.click()
  await host.page.waitForTimeout(400)
  await placeEventOrSkip(host.page)
  await host.page.waitForTimeout(500)

  // next ruler: their old card is gone and it is their turn
  await expect(guest.page.locator('.turn-banner')).toContainText('Chandra')
  await expect(guest.page.locator('.resource-card')).toHaveCount(0)
  await guest.page.locator('.next-step button').first().click()
  await expect(guest.page.locator('.resource-reveal')).toBeVisible()
  await expect(host.page.locator('.resource-reveal')).toHaveCount(0)

  await host.ctx.close()
  await guest.ctx.close()
})
