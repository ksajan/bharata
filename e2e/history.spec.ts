import { test, expect, type Page } from '@playwright/test'
import { dismissReveal } from './helpers'
import { REGIONS } from '../shared/data'
import { acknowledgeHandoff } from './helpers'

/** Action history: grouped by turn, filterable by ruler and kind, searchable. */

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

async function startGame(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  await draftAll(page)
  await page.locator('.next-step button').first().click()
  await dismissReveal(page)
  await page.getByRole('button', { name: /Sell all/ }).click().catch(() => {})
  await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await page.waitForTimeout(250)
  await page.locator('.army-box').first().click()
  await page.waitForTimeout(200)
  const move = page.locator('g.region.moveable').first()
  if (await move.count()) await move.click()
  await page.waitForTimeout(400)
}

const historyButton = (page: Page) => page.getByRole('button', { name: 'History', exact: true })

test('history groups turns and filters by ruler and kind', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await startGame(page)

  await historyButton(page).click()
  const modal = page.locator('.history-modal')
  await expect(modal).toBeVisible()
  await expect(modal.locator('.hist-turn').first()).toContainText(/Turn 1/i)
  await expect(modal.locator('.hist-entry').filter({ hasText: /draws/i }).first()).toBeVisible()
  await expect(modal.locator('.hist-entry').filter({ hasText: /marches/i }).first()).toBeVisible()
  // the drawn resource card is archived as a card face, not just prose
  await expect(modal.locator('.hist-card-face').first()).toBeVisible()

  // Round filter
  await modal.getByRole('combobox', { name: 'Filter by round' }).selectOption('1')
  await expect(modal.locator('.hist-entry').first()).toBeVisible()

  // My actions
  await modal.getByRole('button', { name: 'My actions' }).click()
  await expect(modal.locator('.hist-entry').first()).toContainText(/Bimbisara/i)

  // A kind filter with no matches shows the empty state
  await modal.getByRole('button', { name: 'Battles' }).click()
  await expect(modal.locator('.history-empty')).toBeVisible()

  // Search
  await modal.getByRole('button', { name: 'All', exact: true }).click()
  await modal.getByRole('textbox', { name: 'Search history' }).fill('draws')
  await expect(modal.locator('.hist-entry')).toHaveCount(1)

  // Ruler filter (the guest's setup choice is still in Setup)
  await modal.getByRole('textbox', { name: 'Search history' }).fill('')
  await modal.getByRole('combobox', { name: 'Filter by round' }).selectOption('all')
  await modal.getByRole('combobox', { name: 'Filter by ruler' }).selectOption({ label: 'Prasenajit' })
  await expect(modal.locator('.hist-entry').filter({ hasText: /Prasenajit/i }).first()).toBeVisible()

  // One-click jump to my latest action
  await modal.getByRole('button', { name: 'My last action' }).click()
  await expect(modal.locator('.hist-entry').first()).toContainText(/Bimbisara/i)

  // Jump to the map: closes History and selects the named region
  const mapButton = modal.locator('.hist-map').first()
  await expect(mapButton).toBeVisible()
  await mapButton.click()
  await expect(modal).toBeHidden()
  await expect(page.locator('g.region.selected')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('history is reachable and readable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page)
  await historyButton(page).click()
  const modal = page.locator('.history-modal')
  await expect(modal).toBeVisible()
  const box = await modal.boundingBox()
  expect(box?.width ?? 999).toBeLessThanOrEqual(390)
  await expect(modal.locator('.hist-entry').first()).toBeVisible()
  await modal.getByRole('button', { name: 'Close' }).click()
  await expect(modal).toBeHidden()
})


test('battle records expand and replay from history', async ({ page }) => {
  await startGame(page)
  const regionId = await page.evaluate(
    ({ regionNames }) => {
      const raw = localStorage.getItem('bharata-hotseat-v1')
      if (!raw) throw new Error('no snapshot')
      const snap = JSON.parse(raw)
      const st = snap.state
      const ids = Object.keys(st.seats).sort()
      const atk = ids[0]
      const def = ids[1]
      const rid = st.kingdoms[st.seats[atk].kingdomId].capital
      const regionName = regionNames[rid] ?? rid
      const cards = [
        { seatId: atk, armyId: 1, value: 6 },
        { seatId: atk, armyId: 1, value: 5 },
        { seatId: def, armyId: 1, value: 4 },
        { seatId: def, armyId: 1, value: 3 },
      ]
      st.battleHistory = [
        {
          id: 'test-battle',
          round: 1,
          regionId: rid,
          attackerSeat: atk,
          defenderSeat: def,
          attackerTotal: 11,
          defenderTotal: 9,
          defenderBonus: 2,
          winnerSeat: atk,
          cards,
        },
      ]
      st.log.push({
        id: st.logSeq++,
        text: `⚔ ${st.seats[atk].name} wins the Battle of ${regionName} (11 vs 9 incl. +2 terrain)!`,
        kind: 'battle',
        round: 1,
        battleId: 'test-battle',
      })
      localStorage.setItem('bharata-hotseat-v1', JSON.stringify(snap))
      return rid
    },
    { regionNames: Object.fromEntries(Object.entries(REGIONS).map(([id, r]) => [id, r.name])) },
  )
  expect(regionId).toBeTruthy()
  await page.reload()
  await page.waitForTimeout(500)
  await page.locator('.resume-banner').click()
  await page.waitForTimeout(500)
  await acknowledgeHandoff(page)
  const take = page.getByRole('button', { name: 'Take the bounty' })
  if (await take.isVisible().catch(() => false)) await take.click()
  await page.waitForTimeout(200)
  const hand = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await hand.count()) await hand.click()
  await historyButton(page).click()
  const modal = page.locator('.history-modal')
  await modal.getByRole('button', { name: 'Battles' }).click()
  const battle = modal.locator('.hist-battle')
  await expect(battle).toBeVisible()
  await battle.locator('summary').click()
  await expect(battle.locator('.hist-mini-card')).toHaveCount(4)
  await battle.getByRole('button', { name: /Replay battle/ }).click()
  await expect(page.locator('.battle-replay')).toBeVisible()
  await expect(page.locator('.battle-replay .hist-mini-card')).toHaveCount(4)
  await page.getByRole('button', { name: 'Close replay' }).click()
  await modal.getByRole('button', { name: 'Close' }).click()
  await expect(modal).toBeHidden()
})
