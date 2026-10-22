import { test, expect, type Page } from '@playwright/test'

/** The board must not resize when text, buttons or panels change around it. */

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

async function start(page: Page) {
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)
}

async function boardSize(page: Page) {
  const box = await page.locator('.board-frame').boundingBox()
  if (!box) throw new Error('no board')
  return `${Math.round(box.width)}x${Math.round(box.height)}`
}

for (const vp of [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'phone' },
]) {
  test(`board geometry is stable while the table changes (${vp.label})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    await start(page)
    const base = await boardSize(page)

    // resource draw + reveal
    await page.locator('.next-step button').first().click()
    await page.waitForTimeout(250)
    const take = page.getByRole('button', { name: 'Take the bounty' })
    if (await take.isVisible().catch(() => false)) await take.click()
    expect(await boardSize(page)).toBe(base)

    // sale (ledger appears)
    const sell = page.getByRole('button', { name: /Sell all/ })
    if (await sell.isEnabled().catch(() => false)) await sell.click()
    await page.waitForTimeout(200)
    expect(await boardSize(page)).toBe(base)

    // phase change (different coach text and controls)
    await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
    await page.waitForTimeout(300)
    expect(await boardSize(page)).toBe(base)

    // army selected + region inspector
    await page.locator('.army-box').first().click()
    await page.waitForTimeout(200)
    expect(await boardSize(page)).toBe(base)
    await page.locator('g.region').nth(6).click()
    await page.waitForTimeout(200)
    expect(await boardSize(page)).toBe(base)

    // mobile rulers drawer must overlay, not reflow
    if (vp.width < 900) {
      await page.getByRole('button', { name: /Rulers/ }).click()
      await page.waitForTimeout(300)
      expect(await boardSize(page)).toBe(base)
      await page.getByRole('button', { name: 'Close' }).click()
      await page.waitForTimeout(300)
      expect(await boardSize(page)).toBe(base)
    }
  })
}
