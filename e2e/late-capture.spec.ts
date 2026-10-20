import { test, Page } from '@playwright/test'
import { mkdirSync } from 'fs'
import { REGIONS } from '../shared/data'

mkdirSync('/tmp/vis2', { recursive: true })
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function regionIn(text: string): string | null {
  for (const r of Object.values(REGIONS)) if (text.includes(r.name)) return r.id
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

async function capitalOfCard(page: Page, idx: number): Promise<string | null> {
  const t = (await page.locator('.player-card').nth(idx).textContent().catch(() => '')) ?? ''
  const m = t.match(/capital ([A-Za-z]+(?: [A-Za-z]+)?)/) // NB: SVG <title> text glues onto the name ("Mallacoins")
  if (!m) return null
  const cands = Object.values(REGIONS)
    .filter((r) => m[1].startsWith(r.name))
    .sort((a, b) => b.name.length - a.name.length)
  return cands[0]?.id ?? null // region ID — neighbors/bfs speak ids, not names
}

async function activeSeatIdx(page: Page): Promise<number> {
  return (await page.locator('.player-card').evaluateAll((els) => els.findIndex((e) => e.classList.contains('active'))).catch(() => -1)) ?? -1
}

async function coinsOf(page: Page, idx: number): Promise<number> {
  const t = await page.locator('.player-card').nth(idx).locator('.pc-stats b').first().textContent().catch(() => '0')
  return Number(t ?? 0)
}

async function clearModals(page: Page, pref: string | null, myCapName: string | null, caps: { c33: boolean; afflict: boolean }): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    const prize = page.locator('.modal .choice-card')
    if (await prize.first().isVisible().catch(() => false)) {
      if (!caps.c33) { await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/vis2/33-prize-modal.png' }); caps.c33 = true }
      const n = await prize.count()
      let idx = 0
      for (let j = 0; j < n; j++) if (/victory point/i.test((await prize.nth(j).textContent()) ?? '')) { idx = j; break }
      await prize.nth(idx).click({ timeout: 6000 }).catch(() => {})
      await page.waitForTimeout(350)
      continue
    }
    const skip = page.getByRole('button', { name: /finds no foothold/ })
    const btns = page.locator('.modal .actions-row button')
    if ((await btns.count()) > 0 && (await btns.first().isVisible().catch(() => false)) && !(await skip.isVisible().catch(() => false))) {
      let idx = 0
      if (pref) for (let j = 0; j < (await btns.count()); j++) if (new RegExp(esc(pref), 'i').test((await btns.nth(j).textContent()) ?? '')) { idx = j; break }
      const placed = ((await btns.nth(idx).textContent()) ?? '').trim()
      if (myCapName && placed === myCapName) caps.afflict = true // token on MY capital → I will be afflicted
      await btns.nth(idx).click({ timeout: 6000 }).catch(() => {})
      await page.waitForTimeout(200)
      continue
    }
    if (await skip.isVisible().catch(() => false)) { await skip.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(180); continue }
    const gate = page.getByRole('button', { name: /^I am / })
    if (await gate.isVisible().catch(() => false)) { await gate.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(300); return true }
    return false
  }
  return false
}

test('late-game captures 31-35 (2p hot-seat)', async ({ page }) => {
  test.setTimeout(300_000)
  page.on('pageerror', (e) => console.log('>>> PAGEERROR:', e.message.slice(0, 160)))
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.selectOption('select', { label: '3 rulers' })
  await page.selectOption('.cfg-grid select >> nth=2', 'every') // disasters every turn
  // inject a 5 VP option into the Victory select (engine clamps >=5; UI select floor is 10)
  await page.evaluate(() => {
    const sel = document.querySelector('.cfg-grid select') as HTMLSelectElement
    if (![...sel.options].some((o) => o.value === '5')) sel.appendChild(new Option('5 VP', '5'))
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, '5')
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.getByText('Begin the Age').click()
  const draft = async (p: string, a1: string, a2: string) => {
    await page.locator('.modal .draft-item', { hasText: p }).click()
    await page.locator('.modal .draft-item', { hasText: a1 }).click()
    await page.locator('.modal .draft-item', { hasText: a2 }).click()
    await page.getByText('Take the Throne').click()
  }
  await draft('Merchant Prince', 'Vaidya', 'Seer')
  await draft('Granary Keeper', 'Strategist', 'Quartermaster')
  await draft('Iron Raja', 'Rainmaker', 'Shipwright')
  await page.getByRole('button', { name: /^I am / }).click()
  await page.waitForTimeout(350)

  // 35 — legend popover
  await page.locator('.legend-strip summary').click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(350)
  await page.screenshot({ path: '/tmp/vis2/35-legend-open.png' })
  await page.locator('.legend-strip summary').click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(150)

  const myCap = await capitalOfCard(page, 0)
  const enemyCaps = [await capitalOfCard(page, 1), await capitalOfCard(page, 2)].filter((x): x is string => !!x)
  const caps = { c33: false, afflict: false }
  let c32 = false
  let cap31 = false
  const myCapName = myCap ? REGIONS[myCap].name : null
  const hexDist = (a: string, b: string) => {
    const p = REGIONS[a].pos, q2 = REGIONS[b].pos
    const dq = p.q - q2.q, dr = p.r - q2.r
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2
  }
  let warTarget = enemyCaps.slice().sort((a, b) => hexDist(myCap!, a) - hexDist(myCap!, b))[0] ?? null
  const myVp = async () => Number((((await page.locator('.player-card').first().textContent()) ?? '').match(/(\d+)\s*\//) ?? [])[1] ?? 0)
  console.log(`>>> myCap=${myCapName} enemies=${enemyCaps.map((c) => REGIONS[c].name)} target=${warTarget ? REGIONS[warTarget].name : null} vpTarget=${((await page.locator('.player-card').first().textContent()) ?? '').match(/\/(\d+)/)?.[1]}`)

  const sellAll = async () => {
    const stat = async (i: number) => Number(await page.locator('.player-card').nth(0).locator('.pc-stats b').nth(i).textContent().catch(() => '0'))
    for (let k = 0; k < 10; k++) {
      const pills = page.locator('.actions-row .pill')
      const capsN = [99, Math.max(0, (await stat(2)) - 2), Math.max(0, (await stat(3)) - 2), 99] // keep 2 wood + 2 food for free event clears
      for (let i = 0; i < await pills.count(); i++) {
        const plus = pills.nth(i).getByRole('button', { name: '+' })
        for (let j = 0; j < capsN[i]; j++) await plus.click({ timeout: 2500 }).catch(() => {})
      }
      const sell = page.getByRole('button', { name: /Sell/ })
      if (!(await sell.isEnabled().catch(() => false))) break
      await sell.click({ timeout: 2500 }).catch(() => {})
      await page.waitForTimeout(90)
    }
    for (let k = 0; k < 4; k++) {
      const buy = page.getByRole('button', { name: /Reinforce Army I/ })
      if (!(await buy.isEnabled().catch(() => false)) || (await coinsOf(page, 0)) < 10) break
      await buy.click({ timeout: 2500 }).catch(() => {})
      await page.waitForTimeout(110)
    }
    const forge = page.getByRole('button', { name: /Forge/ }).first()
    if ((await forge.isEnabled().catch(() => false)) && (await coinsOf(page, 0)) >= 6) {
      await forge.click({ timeout: 2500 }).catch(() => {})
      await page.waitForTimeout(130)
    }
  }

  const resolveBattle = async () => {
    const commit = page.getByText(/Commit \d+ cards? in Secret/)
    if (!(await commit.isVisible().catch(() => false))) { console.log('>>> battle: no commit modal'); return }
    const cs = page.locator('.modal .bcard')
    for (let i = 0; i < Math.min(6, await cs.count()); i++) await cs.nth(i).click({ timeout: 4000 }).catch(() => {})
    await commit.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(400)
    const commit2 = page.getByText(/Commit \d+ cards? in Secret/)
    if (await commit2.isVisible().catch(() => false)) {
      await commit2.click({ timeout: 8000 }).catch(() => {})
      if (await commit2.isVisible().catch(() => false)) { await page.locator('.modal .bcard').first().click({ timeout: 4000 }).catch(() => {}); await commit2.click({ timeout: 8000 }).catch(() => {}) }
      await page.waitForTimeout(400)
    }
    const verdict = page.getByText('So it is written')
    await verdict.waitFor({ timeout: 8000 }).catch(() => {})
    await verdict.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(450)
    console.log('>>> battle resolved')
  }

  const doConquer = async () => {
    await page.getByRole('button', { name: /🏳 Conquer/ }).click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(300)
    const pay = page.getByRole('button', { name: 'Pay & Conquer' })
    if (await pay.isVisible().catch(() => false)) {
      const need = Number(((await page.getByText(/Selected \d+/).textContent()) ?? '0').match(/\d+/)?.[0] ?? 0)
      for (let i = 0; i < need + 2; i++) {
        const sel = Number(((await page.getByText(/Selected \d+/).textContent()) ?? '0').match(/\d+/)?.[0] ?? 0)
        if (sel >= need) break
        await page.locator('.modal .bcard:not(.picked)').first().click({ timeout: 4000 }).catch(() => {})
        await page.waitForTimeout(100)
      }
      if (await pay.isEnabled()) await pay.click({ timeout: 8000 }).catch(() => {})
      else { console.log('>>> conquer: not enough cards to pay'); await page.getByRole('button', { name: 'Not yet' }).click({ timeout: 5000 }).catch(() => {}) }
    }
    await page.waitForTimeout(400)
    console.log('>>> conquer attempted')
  }

  const warStep = async () => {
    if (!warTarget) return
    await page.locator('.army-box').first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(200)
    if (await page.getByRole('button', { name: /🏳 Conquer/ }).isVisible().catch(() => false)) { await doConquer(); return maybeRetarget() }
    if (await page.getByRole('button', { name: /⚔ Attack/ }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /⚔ Attack/ }).click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(350)
      return resolveBattle()
    }
    const from = regionIn((await page.locator('.army-box').first().textContent()) ?? '')
    if (!from) { console.log('>>> war: army region unparsed'); return }
    if (from === warTarget) { // army stands in the target region — select it for orders
      await page.locator('g.region', { hasText: new RegExp(esc(REGIONS[warTarget].name), 'i') }).first().click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(250)
      if (await page.getByRole('button', { name: /🏳 Conquer/ }).isVisible().catch(() => false)) { await doConquer(); return maybeRetarget() }
      if (await page.getByRole('button', { name: /⚔ Attack/ }).isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /⚔ Attack/ }).click({ timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(350)
        return resolveBattle()
      }
      console.log('>>> war: in target region but no orders')
      return
    }
    const target = REGIONS[from].neighbors.includes(warTarget) ? warTarget : bfsStep(from, warTarget)
    if (!target) return
    const loc = page.locator('g.region.moveable', { hasText: new RegExp(esc(REGIONS[target].name), 'i') })
    if ((await loc.count()) === 0) { console.log(`>>> war: ${REGIONS[target].name} not moveable`); return }
    await loc.first().click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(400)
    console.log(`>>> war: marched ${REGIONS[from].name} -> ${REGIONS[target].name}`)
    if (target === warTarget) await resolveBattle()
  }

  const maybeRetarget = async () => {
    const vp = await myVp()
    console.log(`>>> vp after conquest: ${vp}`)
    if (vp < 5) {
      const rest = enemyCaps.filter((c) => c !== warTarget)
      if (rest.length > 0) { warTarget = rest[0]; console.log(`>>> retarget -> ${REGIONS[warTarget].name}`) }
    }
  }

  const checkBanner = async () => {
    const banner = page.locator('.pill', { hasText: 'no other action is possible' })
    if (!(await banner.isVisible().catch(() => false))) return false
    if (!c32) { await page.waitForTimeout(250); await page.screenshot({ path: '/tmp/vis2/32-event-affliction.png' }); c32 = true }
    const m = ((await banner.textContent()) ?? '').match(/afflicts (.+?) —/)
    if (m) {
      await page.locator('g.region', { hasText: new RegExp(esc(m[1].trim()), 'i') }).first().click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(250)
      const rm = page.getByRole('button', { name: /🛠 Remove event/ })
      if (await rm.isVisible().catch(() => false)) {
        await page.locator('.toast').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {}) // toast (z100) intercepts clicks
        await rm.click({ timeout: 5000 }).catch((e) => console.log('>>> remove failed:', String(e).slice(0, 90)))
        await page.waitForTimeout(350)
        if (await banner.isVisible().catch(() => false)) {
          await page.getByRole('button', { name: /Clear with coins/ }).click({ timeout: 5000 }).catch(() => {})
          await page.waitForTimeout(350)
        }
      }
    }
    caps.afflict = false
    return true
  }

  let turnIdx = 0
  for (let turn = 0; turn < 34; turn++) {
    if (await page.getByText(/Rules Bharata/).isVisible().catch(() => false)) break
    if (await clearModals(page, c32 ? (warTarget ? REGIONS[warTarget].name : null) : myCapName, myCapName, caps)) turnIdx++
    if (await page.getByText(/Rules Bharata/).isVisible().catch(() => false)) break

    if (!cap31 && (await page.locator('g.event-token').count()) > 0) {
      await page.waitForTimeout(250)
      await page.screenshot({ path: '/tmp/vis2/31-fort-and-events.png' })
      cap31 = true
    }

    const myTurn = (await activeSeatIdx(page)) === 0
    await page.getByText(/Draw Resource Card/).click({ timeout: 8000 }).catch(() => {}) // throws toast when afflicted — fine
    await page.waitForTimeout(220)
    if (myTurn && !caps.afflict) await sellAll()
    await page.getByText('To Actions →').click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(220)
    await checkBanner()
    if (await page.getByText(/Rules Bharata/).isVisible().catch(() => false)) break
    if (myTurn && caps.c33) await warStep()
    await page.getByText('End Turn →').click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(300)
    console.log(`>>> turn=${turnIdx} active=${await activeSeatIdx(page)} coins=${await coinsOf(page, 0)} c33=${caps.c33}`)
  }

  await page.getByText(/Rules Bharata/).waitFor({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(350)
  if (await page.getByText(/Rules Bharata/).isVisible().catch(() => false)) {
    await page.screenshot({ path: '/tmp/vis2/34-gameover.png' })
  } else console.log('>>> gameover NOT reached — 34 not captured')
})

test('36 four-player mid-game', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.selectOption('select', { label: '4 rulers' })
  await page.selectOption('.cfg-grid select >> nth=2', 'off')
  await page.getByText('Begin the Age').click()
  const pers = ['Iron Raja', 'Merchant Prince', 'Granary Keeper', 'War Elephants']
  const abs = [['Vaidya', 'Seer'], ['Strategist', 'Quartermaster'], ['Peacemaker', 'Shipwright'], ['Rainmaker', 'Vaidya']]
  for (let i = 0; i < 4; i++) {
    await page.locator('.modal .draft-item', { hasText: pers[i] }).click()
    await page.locator('.modal .draft-item', { hasText: abs[i][0] }).click()
    await page.locator('.modal .draft-item', { hasText: abs[i][1] }).click()
    await page.getByText('Take the Throne').click()
  }
  await page.getByRole('button', { name: /^I am / }).click()
  for (let t = 0; t < 4; t++) {
    await page.getByText(/Draw Resource Card/).click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(250)
    await page.getByText('To Actions →').click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(250)
    await page.getByText('End Turn →').click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(350)
    const prize = page.locator('.modal .choice-card').first()
    if (await prize.isVisible().catch(() => false)) { await prize.click(); await page.waitForTimeout(250) }
    const gate = page.getByRole('button', { name: /^I am / })
    if (await gate.isVisible().catch(() => false)) { await gate.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(280) }
  }
  await page.getByText(/Draw Resource Card/).click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(300)
  await page.getByText('To Actions →').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(450)
  await page.screenshot({ path: '/tmp/vis2/36-fourplayer.png' })
})
