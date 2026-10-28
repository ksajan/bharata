import { test, expect, type Page } from '@playwright/test'
import { acknowledgeHandoff, dismissReveal } from './helpers'

/** Regression probes for the tablet layout, hot-seat battle handoff, prize hover and final table. */

async function startHotseat(page: Page) {
  await page.goto('/')
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
  await acknowledgeHandoff(page)
}

async function toActions(page: Page) {
  await page.locator('.next-step button').first().click()
  await dismissReveal(page)
  await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await page.waitForTimeout(250)
}

async function topmost(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { top: top === el || el.contains(top), box: { y: r.y, h: r.height } }
  })
}

test('tablet portrait and phone landscape keep the command controls reachable', async ({ page }) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    await startHotseat(page)
    await toActions(page)
    const army = await topmost(page, '.army-box')
    const endTurn = await topmost(page, '.controls .col.main button.primary')
    expect(army.top, `${viewport.width}x${viewport.height} army box`).toBe(true)
    expect(endTurn.top, `${viewport.width}x${viewport.height} end turn`).toBe(true)
  }
})

test('hot-seat battle resets the card count and gates the defender with the handoff', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await startHotseat(page)
  await toActions(page)
  await page.evaluate(() => {
    const snap = JSON.parse(localStorage.getItem('bharata-hotseat-v1')!)
    const st = snap.state
    const atk = st.turnOrder[0]
    const def = st.turnOrder[1]
    const rid = st.kingdoms[st.seats[def].kingdomId].capital
    const a = st.armies.find((x: any) => x.ownerId === atk && x.armyId === 1)
    const d = st.armies.find((x: any) => x.ownerId === def && x.armyId === 1)
    a.regionId = rid
    a.cards = [
      { id: 'edge-a1', value: 6 },
      { id: 'edge-a2', value: 6 },
      { id: 'edge-a3', value: 6 },
    ]
    d.regionId = rid
    d.cards = [{ id: 'edge-d1', value: 1 }]
    st.regions[rid].armies = [
      { seatId: atk, armyId: 1, armyRef: a.id },
      { seatId: def, armyId: 1, armyRef: d.id },
    ]
    st.regionControl[rid] = st.seats[def].kingdomId
    st.pendingBattle = { id: 'edge-battle', regionId: rid, attackerSeat: atk, defenderSeat: def, commitments: {}, awaiting: [atk, def], phase: 'commit' }
    st.phase = 'action'
    st.activeSeat = atk
    st.actionsLeft = 2
    localStorage.setItem('bharata-hotseat-v1', JSON.stringify(snap))
  })
  await page.reload()
  await page.locator('.resume-banner').click()
  await acknowledgeHandoff(page)
  await dismissReveal(page)
  for (let i = 0; i < 3; i++) await page.locator('.modal .bcard').nth(i).click()
  await page.getByText(/Commit 3 cards in Secret/).click()
  await acknowledgeHandoff(page)
  await page.locator('.modal .bcard').first().click()
  await expect(page.locator('.modal .verdict-btn')).toHaveText('Commit 1 card in Secret')
})

test('prize option text stays readable on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await startHotseat(page)
  await page.evaluate(() => {
    const snap = JSON.parse(localStorage.getItem('bharata-hotseat-v1')!)
    snap.state.pendingPrize = {
      seatId: 's0',
      reason: 'Magnate',
      queue: [],
      card: {
        id: 'edge-prize',
        title: 'Royal Treasury',
        options: [
          { text: '+2 coins', effect: { kind: 'coins', n: 2 } },
          { text: '+1 victory point', effect: { kind: 'vp', n: 1 } },
        ],
      },
    }
    localStorage.setItem('bharata-hotseat-v1', JSON.stringify(snap))
  })
  await page.reload()
  await page.locator('.resume-banner').click()
  await acknowledgeHandoff(page)
  const choice = page.locator('.modal .choice-card').first()
  await expect(choice).toBeVisible()
  await choice.hover()
  await page.waitForTimeout(250)
  const colors = await choice.evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    text: getComputedStyle(el.querySelector('h4')!).color,
  }))
  expect(colors.text).not.toBe(colors.bg)
})

test('390px final standings fit inside the modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startHotseat(page)
  await page.evaluate(() => {
    const snap = JSON.parse(localStorage.getItem('bharata-hotseat-v1')!)
    snap.state.phase = 'gameover'
    snap.state.winner = 's0'
    snap.state.pendingBattle = null
    snap.state.pendingPrize = null
    snap.state.seats.s0.vp = 25
    localStorage.setItem('bharata-hotseat-v1', JSON.stringify(snap))
  })
  await page.reload()
  await page.locator('.resume-banner').click()
  await acknowledgeHandoff(page)
  await expect(page.getByRole('heading', { name: /Rules Bharata/ })).toBeVisible()
  const sizes = await page.locator('.final-table').evaluate((el) => {
    const modal = el.closest('.modal') as HTMLElement
    return { scroll: modal.scrollWidth, client: modal.clientWidth }
  })
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client)
})
