import { test, expect } from '@playwright/test'
import { REGIONS } from '../shared/data'

function regionIn(text: string): string | null {
  for (const r of Object.values(REGIONS)) {
    if (text.includes(r.name)) return r.id
  }
  return null
}

function bfsStep(from: string, goal: string): string | null {
  if (from === goal) return null
  const prev = new Map<string, string | null>([[from, null]])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    for (const n of REGIONS[cur].neighbors) {
      if (!prev.has(n)) {
        prev.set(n, cur)
        if (n === goal) {
          let step = n
          let p = prev.get(n) ?? null
          while (p !== from && p) { step = p; p = prev.get(p) ?? null }
          return step
        }
        q.push(n)
      }
    }
  }
  return null
}

test('capture battle flow + mid-game states', async ({ page }) => {
  test.setTimeout(150_000)
  page.on('crash', () => console.log('>>> PAGE CRASHED'))
  page.on('pageerror', (e) => console.log('>>> PAGEERROR:', e.message.slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') console.log('>>> CONSOLE ERR:', m.text().slice(0, 200)) })
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.selectOption('select', { label: '2 rulers' })
  await page.getByText('Begin the Age').click()

  const draft = async (p: string, a1: string, a2: string) => {
    await page.locator('.modal .draft-item', { hasText: p }).click()
    await page.locator('.modal .draft-item', { hasText: a1 }).click()
    await page.locator('.modal .draft-item', { hasText: a2 }).click()
    await page.getByText('Take the Throne').click()
  }
  await draft('Iron Raja', 'Vaidya', 'Seer')
  await draft('War Elephants', 'Strategist', 'Shipwright')
  await page.getByRole('button', { name: /^I am / }).click()

  const clearEndTurn = async () => {
    // event placement / prizes / handoffs after ending a turn
    for (let i = 0; i < 6; i++) {
      const choose = page.getByText(/Choose where it strikes/)
      const skip = page.getByText('finds no foothold — Continue')
      if (await choose.isVisible().catch(() => false)) {
        const btns = page.locator('.modal .actions-row button')
        if ((await btns.count()) > 0 && !(await skip.isVisible().catch(() => false))) await btns.first().click({ timeout: 4000 }).catch(() => {})
        else if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 2500 }).catch(() => {})
        await page.waitForTimeout(250)
        continue
      }
      const prize = page.locator('.modal .choice-card').first()
      if (await prize.isVisible().catch(() => false)) { await prize.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(250); continue }
      const gate = page.getByRole('button', { name: /^I am / })
      if (await gate.isVisible().catch(() => false)) { await gate.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(250); continue }
      return
    }
  }

  const enemyCapital = async (): Promise<string> => {
    // the enemy is the player-card whose ruler is NOT the active one (hot-seat shifts seats)
    const banner = (await page.locator('.turn-banner').textContent().catch(() => '')) ?? ''
    const activeName = /Turn — (.+?) of/.exec(banner)?.[1] ?? ''
    const cards = page.locator('.player-card')
    for (let i = 0; i < (await cards.count()); i++) {
      const t = (await cards.nth(i).textContent().catch(() => '')) ?? ''
      if (t.startsWith(activeName)) continue
      // prefer the enemy army's CURRENT position so the two drivers collide
      const am = t.match(/Army I:?\s*\d+ @ ([A-Za-z]+?)(?=Army II|$)/) ?? t.match(/capital ([A-Za-z]+?)(?=coins|\s*\d|$)/)
      if (am) for (const r of Object.values(REGIONS)) if (r.name === am[1]) return r.id
    }
    throw new Error('enemy target not found (active=' + activeName + ') cards=[' + (await cards.allTextContents().catch(() => [] as string[])).map((t) => t.slice(0, 150)).join(' ## ') + ']')
  }

  let battleSeen = false
  for (let turn = 0; turn < 12 && !battleSeen; turn++) {
    console.log(`>>> turn ${turn} | banner: ${(await page.locator('.turn-banner').textContent().catch(() => '')) ?? ''}`)
    // whose army box is mine? first army-box belongs to active ruler in hotseat
    await page.getByText(/Draw Resource Card/).click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(150)
    await page.getByText('To Actions →').click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(150)

    // strict affliction: clear events before anything else (draw/march are blocked meanwhile)
    const affBanner = page.locator('.board-pane .pill', { hasText: 'afflicts' })
    for (let i = 0; i < 3; i++) {
      if (!(await affBanner.isVisible().catch(() => false))) break
      const m = ((await affBanner.textContent()) ?? '').match(/afflicts ([A-Za-z]+)/)
      if (!m) break
      await page.locator('g.region', { hasText: m[1] }).first().click({ timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(200)
      const rm = page.getByText('🛠 Remove event')
      const coins = page.getByText(/Clear with coins/)
      const cure = page.getByText('🌿 Cure with Medicine')
      if (await rm.isVisible().catch(() => false)) await rm.click()
      else if (await coins.isVisible().catch(() => false)) await coins.click()
      else if (await cure.isVisible().catch(() => false)) await cure.click()
      else break
      await page.waitForTimeout(350)
    }

    const armyText = await page.locator('.army-box').first().textContent().catch(() => '')
    const myRegion = regionIn(armyText ?? '')
    console.log(`>>> army="${(armyText ?? '').slice(0, 60)}" myRegion=${myRegion} goal=${await enemyCapital().catch((e) => 'ERR ' + e.message)}`)
    const goal = await enemyCapital()
    if (!myRegion) break

    await page.locator('.army-box').first().click({ timeout: 4000 }).catch(() => {})
    if (myRegion === goal) {
      // march in — battle triggers
      await page.locator('g.region.moveable', { hasText: REGIONS[goal].name }).first().click({ timeout: 4000 }).catch(() => {})
    } else {
      const step = bfsStep(myRegion, goal)
      const adjacent = REGIONS[myRegion].neighbors.includes(goal)
      const target = adjacent ? goal : step
      if (target) {
        await page
          .locator('g.region.moveable', { hasText: REGIONS[target].name })
          .first()
          .click()
          .catch(() => {})
      }
    }
    await page.waitForTimeout(260)
    await page.screenshot({ path: '/tmp/flow/19-mid-glide.png' })
    await page.waitForTimeout(650)

    const commitBtn = page.getByText(/Commit \d+ cards? in Secret/)
    if (await commitBtn.isVisible().catch(() => false)) {
      await page.screenshot({ path: '/tmp/flow/20-battle-commit-attacker.png' })
      // pick a couple of cards for a real commit
      const cards = page.locator('.bcard')
      await cards.nth(0).click({ timeout: 4000 }).catch(() => {})
      await cards.nth(1).click({ timeout: 4000 }).catch(() => {})
      await page.screenshot({ path: '/tmp/flow/21-battle-commit-picked.png' })
      await commitBtn.click()
      // defender's turn to commit (device pass)
      const commit2 = page.getByText(/Commit \d+ cards? in Secret/)
      if (await commit2.isVisible().catch(() => false)) {
        await page.screenshot({ path: '/tmp/flow/22-battle-commit-defender.png' })
        await commit2.click()
      }
      const verdict = page.getByText('So it is written')
      await verdict.waitFor({ timeout: 8000 })
      await page.waitForTimeout(450) // let the modal-in animation settle
      await page.screenshot({ path: '/tmp/flow/23-battle-reveal.png' })
      await verdict.click()
      battleSeen = true
      break
    }
    // conquer if possible (cheap visual)
    const conquer = page.getByText(/🏳 Conquer/)
    if (await conquer.isVisible().catch(() => false)) {
      await conquer.click()
      const pay = page.getByText('Pay & Conquer')
      if (await pay.isVisible().catch(() => false)) {
        const need = Number((await page.getByText(/Selected \d+/).textContent())!.match(/\d+/)![0])
        const cs = page.locator('.bcard')
        for (let i = 0; i < Math.min(need, await cs.count()); i++) await cs.nth(i).click()
        await pay.click()
        await page.waitForTimeout(400)
        const commitBtn2 = page.getByText(/Commit \d+ cards? in Secret/)
        if (await commitBtn2.isVisible().catch(() => false)) {
          await page.screenshot({ path: '/tmp/flow/20-battle-commit.png' })
          await commitBtn2.click()
          const commit2b = page.getByText(/Commit \d+ cards? in Secret/)
          if (await commit2b.isVisible().catch(() => false)) await commit2b.click()
          const verdict = page.getByText('So it is written')
          await verdict.waitFor({ timeout: 8000 })
          await page.screenshot({ path: '/tmp/flow/23-battle-reveal.png' })
          await verdict.click()
          battleSeen = true
          break
        }
      }
    }
    if (await page.getByText('End Turn →').isVisible().catch(() => false)) {
      await page.getByText('End Turn →').click()
      await clearEndTurn()
    }
  }
  await page.screenshot({ path: '/tmp/flow/30-final.png' })
})
