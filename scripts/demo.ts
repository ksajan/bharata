/**
 * Records a short turn from the live UI and writes docs/screenshots/turn.gif.
 *
 *   npm run dev
 *   npm run demo
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = path.resolve('docs/screenshots/turn-v3.mp4')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bharata-demo-'))

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    recordVideo: { dir: TMP, size: { width: 1280, height: 820 } },
  })
  const page = await ctx.newPage()
  const started = Date.now()

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Same Screen/ }).click()
  await page.locator('select').first().selectOption('2')
  await page.getByText('Begin the Age').click()

  for (let i = 0; i < 2; i++) {
    await page.waitForSelector('text=Shape your Ruler')
    await page.locator('.modal .draft-grid').first().locator('.draft-item').nth(i).click()
    await page.locator('.modal .draft-grid').nth(1).locator('.draft-item').nth(i).click()
    await page.locator('.modal .draft-grid').nth(1).locator('.draft-item').nth(i + 3).click()
    await page.getByText('Take the Throne').click()
    await page.waitForTimeout(220)
  }
  const hand = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await hand.count()) await hand.click()
  await page.waitForTimeout(350)

  // draw, reveal, sell
  const drawMark = Date.now()
  await page.locator('.next-step button').first().click()
  await page.waitForTimeout(900)
  const take = page.getByRole('button', { name: 'Take the bounty' })
  if (await take.isVisible().catch(() => false)) await take.click()
  await page.waitForTimeout(650)
  const sell = page.getByRole('button', { name: /Sell all/ })
  if (await sell.isEnabled().catch(() => false)) await sell.click()
  await page.waitForTimeout(900)

  // march
  await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await page.waitForTimeout(600)
  await page.locator('.army-box').first().click()
  await page.waitForTimeout(600)
  const target = page.locator('g.region.moveable:not(.maha)').first()
  const move = (await target.count()) ? target : page.locator('g.region.moveable').first()
  if (await move.count()) {
    await move.click()
    await page.waitForTimeout(1200)
  }

  // conquer if a province is available
  const conquer = page.getByRole('button', { name: /Conquer/ })
  if (await conquer.isEnabled().catch(() => false)) {
    await conquer.click()
    await page.waitForTimeout(1400)
  }
  await page.waitForTimeout(1600)
  const endMark = Date.now()

  const video = page.video()
  await ctx.close()
  await browser.close()

  const src = await video?.path()
  if (!src) throw new Error('no video recorded')
  const start = Math.max(0, (drawMark - started) / 1000 - 0.2)
  const seconds = Math.min(16, (endMark - drawMark) / 1000)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    String(start),
    '-t',
    String(seconds.toFixed(2)),
    '-i',
    src,
    '-vf',
    'fps=30,scale=1280:-2:flags=lanczos',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    OUT,
  ])
  fs.rmSync(TMP, { recursive: true, force: true })
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2)
  console.log(`✓ turn-v3.mp4 (${mb} MB, ${seconds.toFixed(1)} s)`)
}

main().catch((e) => {
  console.error(e)
  fs.rmSync(TMP, { recursive: true, force: true })
  process.exit(1)
})
