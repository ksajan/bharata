import { test, expect, Page } from '@playwright/test'
import { dismissReveal } from './helpers'

let pageErrors: string[] = []

function watch(page: Page) {
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e.message}`))
}

async function draft(page: Page, personality: string, abilities: string[]) {
  await expect(page.locator('.modal').getByText('Shape your Ruler')).toBeVisible()
  // scope to modal draft items — the chronicle log can echo earlier picks
  await page.locator('.modal .draft-item', { hasText: personality }).click()
  for (const ab of abilities) {
    await page.locator('.modal .draft-item', { hasText: ab }).click()
  }
  await page.locator('.modal').getByText('Take the Throne').click()
}

async function resolveBattleIfAny(page: Page) {
  // hot-seat: the same commit modal passes the device from attacker to defender
  for (let i = 0; i < 4; i++) {
    const commitBtn = page.getByText(/Commit \d+ cards? in Secret/)
    if (!(await commitBtn.isVisible().catch(() => false))) return
    await commitBtn.click()
    const verdict = page.getByText('So it is written')
    if (await verdict.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.screenshot({ path: 'e2e/artifacts/battle-reveal.png' })
      await verdict.click()
      return
    }
  }
}

async function conquerIfPossible(page: Page) {
  const conquer = page.getByText(/🏳 Conquer/)
  if (await conquer.isVisible().catch(() => false)) {
    await conquer.click()
    // Mahajanapada → card picker: click cards until the payment is legal
    const pay = page.getByRole('button', { name: 'Pay & Conquer' })
    if (await pay.isVisible().catch(() => false)) {
      const cards = page.locator('.modal .bcard')
      const total = await cards.count()
      for (let i = 0; i < total; i++) {
        if (await pay.isEnabled().catch(() => false)) break
        await cards.nth(i).click()
        await page.waitForTimeout(80)
      }
      if (await pay.isEnabled().catch(() => false)) {
        await pay.click()
      } else {
        // not enough cards in hand for this region — leave it for next turn
        const notYet = page.getByRole('button', { name: 'Not yet' })
        if (await notYet.count()) await notYet.click()
      }
    }
    await page.waitForTimeout(300)
    await resolveBattleIfAny(page) // conquering near enemies can chain
  }
}

async function resolvePrizesIfAny(page: Page) {
  // a VP condition met at end of turn draws a prize card — choose until cleared
  for (let i = 0; i < 3; i++) {
    const choice = page.locator('.modal .choice-card').first()
    if (!(await choice.isVisible({ timeout: 1500 }).catch(() => false))) return
    await page.screenshot({ path: 'e2e/artifacts/prize.png' })
    await choice.click()
  }
}

async function placeEventOrSkip(page: Page) {
  // events may demand multiple targets (e.g. Great Flood ×2) — keep placing until cleared
  for (let i = 0; i < 4; i++) {
    const modal = page.getByText(/Choose where it strikes/)
    if (!(await modal.isVisible({ timeout: 6000 }).catch(() => false))) return
    const skip = page.getByText('finds no foothold — Continue')
    const targetBtns = page.locator('.modal .actions-row button')
    if ((await targetBtns.count()) > 0 && !(await skip.isVisible().catch(() => false))) {
      await targetBtns.first().click()
      await page.waitForTimeout(250)
    } else if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      return
    } else {
      return
    }
  }
}

test.describe('Bharata hot-seat journey', () => {
  test.beforeEach(() => {
    pageErrors = []
  })

  test.afterEach(async ({ page }, info) => {
    if (info.status !== 'passed') {
      await page.screenshot({ path: `e2e/artifacts/failure-${info.title.replace(/\W+/g, '-')}.png` })
    }
    expect(pageErrors, 'no console page errors').toEqual([])
  })

  test('menu → setup → drafts → resource → actions → conquest → events → turn passes', async ({ page }) => {
    watch(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'BHARATA 600 BC' })).toBeVisible()
    await page.screenshot({ path: 'e2e/artifacts/menu.png' })

    // same-screen setup
    await page.getByRole('button', { name: /Same Screen/ }).click()
    await expect(page.getByText('Same-Screen Thrones')).toBeVisible()
    await page.selectOption('select', { label: '2 rulers' })
    await page.selectOption('select >> nth=1', { label: '10 VP' })
    await page.getByText('Begin the Age').click()

    // drafts (device passes between rulers)
    await draft(page, 'Iron Raja', ['Vaidya', 'Seer'])
    await draft(page, 'Merchant Prince', ['Strategist', 'Shipwright'])

    // game screen — first ruler on resource phase (device passes back after the last draft)
    await expect(page.locator('.phase-step.on')).toHaveText('Resource')
    await expect(page.locator('.turn-banner')).toContainText('Bimbisara')
    await page.getByRole('button', { name: 'I am Bimbisara' }).click()
    await page.screenshot({ path: 'e2e/artifacts/board.png' })
    await expect(page.locator('g.region').count()).resolves.toBeGreaterThan(30)

    // resource phase
    await page.getByText(/Draw Resource Card/).click()
    await dismissReveal(page)
    await expect(page.locator('.resource-card')).toBeVisible()
    await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
    await expect(page.locator('.phase-step.on')).toHaveText('Actions')

    // move army I to a highlighted neighbor, then conquer / battle
    await page.locator('.army-box').first().click()
    const targets = page.locator('g.region.moveable')
    await expect(targets).not.toHaveCount(0)
    await targets.first().click()
    await page.waitForTimeout(400)
    await resolveBattleIfAny(page)
    await conquerIfPossible(page)

    // end turn → advanced event phase → prize if a condition was met → next ruler
    await page.getByText('End Turn →').click()
    const endAnyway = page.getByRole('button', { name: 'End with actions left?' })
    if (await endAnyway.isVisible().catch(() => false)) await endAnyway.click()
    await placeEventOrSkip(page)
    await resolvePrizesIfAny(page)
    await expect(page.locator('.turn-banner')).toContainText('Prasenajit', { timeout: 15_000 })
    await page.screenshot({ path: 'e2e/artifacts/turn-two.png' })

    // pass the device to the second ruler, then their resource phase
    await page.getByRole('button', { name: 'I am Prasenajit' }).click()
    await page.getByText(/Draw Resource Card/).click()
    await dismissReveal(page)
    await expect(page.locator('.resource-card')).toBeVisible()
  })
})
