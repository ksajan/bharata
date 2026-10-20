import { test } from '@playwright/test'

test('capture full visual audit', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 })
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' })
  await page.screenshot({ path: '/tmp/vis/01-menu.png', fullPage: true })

  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.screenshot({ path: '/tmp/vis/02-setup.png', fullPage: true })

  await page.selectOption('select', { label: '4 rulers' })
  await page.getByText('Begin the Age').click()

  // draft x4
  const pers = ['Iron Raja', 'Merchant Prince', 'Granary Keeper', 'War Elephants']
  const abs = [['Vaidya', 'Seer'], ['Shipwright', 'Rainmaker'], ['Peacemaker', 'Vaidya'], ['Strategist', 'Quartermaster']]
  for (let i = 0; i < 4; i++) {
    await page.locator('.modal .draft-item', { hasText: pers[i] }).click()
    await page.locator('.modal .draft-item', { hasText: abs[i][0] }).click()
    await page.locator('.modal .draft-item', { hasText: abs[i][1] }).click()
    await page.screenshot({ path: `/tmp/vis/03-draft-${i}.png` })
    await page.getByText('Take the Throne').click()
  }
  // pass-device gate for first ruler
  await page.getByRole('button', { name: 'I am' }).click()

  await page.screenshot({ path: '/tmp/vis/04-board-fresh.png' })
  // draw + sell state
  await page.getByText(/Draw Resource Card/).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/tmp/vis/05-resource-drawn.png' })
  // raise sell steppers a bit
  const ironPill = page.locator('.actions-row .pill').first()
  await ironPill.getByRole('button', { name: '+' }).click()
  await ironPill.getByRole('button', { name: '+' }).click()
  await page.screenshot({ path: '/tmp/vis/06-sell-preview.png' })
  await page.getByText('To Actions →').click()
  await page.waitForTimeout(200)

  // select army → moveable highlights
  await page.locator('.army-box').first().click()
  await page.screenshot({ path: '/tmp/vis/07-army-selected.png' })
  // march
  await page.locator('g.region.moveable').first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/tmp/vis/08-after-march.png' })
  // region panel on a capital area
  await page.locator('g.region', { hasText: 'KOSALA' }).click().catch(() => {})
  await page.waitForTimeout(200)
  await page.screenshot({ path: '/tmp/vis/09-region-panel.png' })

  // battle attempt: find any region with enemy army & own army via battleInit isn't easy; skip if none
  // end turn → event modal
  await page.getByText('End Turn →').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/vis/10-event-or-next.png' })
  const skip = page.getByText('finds no foothold — Continue')
  const targets = page.locator('.modal .actions-row button')
  if (await skip.isVisible().catch(() => false)) await skip.click()
  else if ((await targets.count()) > 0) { await targets.first().click(); await page.waitForTimeout(300) }
  // second target if great flood
  if (await page.getByText(/Choose where it strikes/).isVisible().catch(() => false)) {
    const t2 = page.locator('.modal .actions-row button')
    if ((await t2.count()) > 0) await t2.first().click()
    else if (await skip.isVisible().catch(() => false)) await skip.click()
  }
  // prize?
  const choice = page.locator('.modal .choice-card').first()
  if (await choice.isVisible().catch(() => false)) { await page.screenshot({ path: '/tmp/vis/11-prize.png' }); await choice.click() }
  // next ruler gate
  const gate = page.getByRole('button', { name: /^I am / })
  if (await gate.isVisible().catch(() => false)) {
    await page.screenshot({ path: '/tmp/vis/12-handoff.png' })
    await gate.click()
  }
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/tmp/vis/13-ruler2.png' })

  // zoomed map crops
  await page.locator('g.region', { hasText: 'KOSALA' }).scrollIntoViewIfNeeded().catch(() => {})
})
