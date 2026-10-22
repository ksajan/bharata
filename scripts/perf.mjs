/**
 * Rendering budget check.
 *
 *   npm run dev            # in another shell (client on :5173)
 *   node scripts/perf.mjs
 *
 * Asserts that:
 *  - local UI state (selling) does not re-render the 38-region board
 *  - selecting a region does re-render it (props legitimately changed)
 *  - no long task exceeds 50ms during the flow
 *  - the initial JS payload is under the 200KB gzip budget
 */
import { chromium } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BASE = process.env.BASE || 'http://localhost:5173'
const budget = { mainGzipKB: 200, longTaskMs: 50 }

async function main() {
  // bundle budget
  const assets = `${process.cwd()}/dist/assets`
  let mainKB = 0
  try {
    const js = readdirSync(assets).filter((f) => f.endsWith('.js') && f.startsWith('index-'))
    for (const f of js) mainKB += gzipSync(readFileSync(`${assets}/${f}`)).length / 1024
  } catch {
    console.log('· dist not built — skipping bundle budget (npm run build)')
  }
  if (mainKB) {
    console.log(`· initial JS ${mainKB.toFixed(1)} kB gzip (budget ${budget.mainGzipKB})`)
    if (mainKB > budget.mainGzipKB) throw new Error('bundle budget exceeded')
  }

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__longTasks = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(Math.round(e.duration))
    }).observe({ type: 'longtask', buffered: true })
  })

  await page.goto(BASE)
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()
  for (const name of ['Iron Raja', 'Merchant Prince']) {
    await page.waitForSelector('text=Shape your Ruler')
    await page.locator('.modal').getByText(name).first().click()
    await page.locator('.modal').getByText('Vaidya').first().click()
    await page.locator('.modal').getByText('Shipwright').first().click()
    await page.getByText('Take the Throne').click()
    await page.waitForTimeout(150)
  }
  const hand = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await hand.count()) await hand.click()
  await page.locator('.next-step button').click() // draw
  const take = page.getByRole('button', { name: 'Take the bounty' })
  if (await take.isVisible().catch(() => false)) await take.click()
  await page.waitForTimeout(300)

  // measure interaction cost from here — first paint/font work is a separate budget
  await page.evaluate(() => {
    window.__longTasks = []
  })
  const base = await page.evaluate(() => window.__boardRenders ?? 0)

  // local-only state changes: selling steppers must not touch the board
  const add = page.locator('.sell-pill .sell-add').first()
  for (let i = 0; i < 3; i++) await add.click()
  await page.waitForTimeout(150)
  const afterSell = await page.evaluate(() => window.__boardRenders ?? 0)

  // selecting a region legitimately changes board props
  await page.locator('g.region').nth(6).click()
  await page.waitForTimeout(200)
  const afterSelect = await page.evaluate(() => window.__boardRenders ?? 0)

  const longTasks = await page.evaluate(() => window.__longTasks ?? [])
  const heap = await page.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null))
  const nodes = await page.evaluate(() => document.querySelectorAll('*').length)

  await browser.close()

  console.log(`· board renders: start ${base} · after 3 sells ${afterSell} · after selecting a region ${afterSelect}`)
  console.log(`· interaction long tasks: ${longTasks.length ? longTasks.join(', ') + ' ms' : 'none > 50ms'}`)
  console.log(`· DOM nodes ${nodes}, JS heap ${heap ?? '?'} MB`)

  let failed = false
  if (afterSell !== base) {
    console.error('✗ local selling re-rendered the board')
    failed = true
  }
  if (afterSelect <= afterSell) {
    console.error('✗ selecting a region did not re-render the board')
    failed = true
  }
  if (longTasks.some((d) => d > budget.longTaskMs)) {
    console.error('✗ long task over budget')
    failed = true
  }
  if (failed) process.exit(1)
  console.log('✓ rendering budget met')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
