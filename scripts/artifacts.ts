/**
 * Regenerates every image in docs/screenshots.
 *
 *   npm run dev            # client on :5173
 *   npm run artifacts
 *
 * Captures the real UI at 2× and converts to WebP, then renders a static
 * "visual language" sheet from the same art components the game uses.
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { KingdomCrest, Pawn, Ship, TerrainMotif, VpTrack } from '../client/ui/art'
import { Ico } from '../client/ui/icons'

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = path.resolve('docs/screenshots')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bharata-art-'))
fs.mkdirSync(OUT, { recursive: true })

let browser: Browser

async function save(page: Page, name: string, quality = 88) {
  const png = path.join(TMP, `${name}.png`)
  await page.screenshot({ path: png })
  execFileSync('cwebp', ['-quiet', '-q', String(quality), png, '-o', path.join(OUT, `${name}.webp`)])
  fs.unlinkSync(png)
  const kb = Math.round(fs.statSync(path.join(OUT, `${name}.webp`)).size / 1024)
  console.log(`· ${name}.webp (${kb} kB)`)
}

async function open(viewport: { width: number; height: number }, dpr = 2) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr })
  return ctx.newPage()
}

async function draft(page: Page, index: number, count: number) {
  await page.waitForSelector('text=Shape your Ruler')
  const personalities = page.locator('.modal .draft-grid').first().locator('.draft-item')
  await personalities.nth(index % count).click()
  const abilities = page.locator('.modal .draft-grid').nth(1).locator('.draft-item')
  const total = await abilities.count()
  await abilities.nth(index % total).click()
  await abilities.nth((index + 3) % total).click()
  await page.getByText('Take the Throne').click()
  await page.waitForTimeout(320)
}

async function dismissReveal(page: Page) {
  const take = page.getByRole('button', { name: 'Take the bounty' })
  try {
    await take.waitFor({ state: 'visible', timeout: 1500 })
    await take.click()
    await page.waitForTimeout(250)
  } catch {
    /* no reveal */
  }
}

async function dismissHandoff(page: Page) {
  const hand = page.locator('.modal-backdrop .primary', { hasText: 'I am ' })
  if (await hand.count()) {
    await hand.click()
    await page.waitForTimeout(250)
  }
}

async function startHotseat(page: Page, rulers: number, startAt = 0) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  if (startAt === 0) {
    await page.getByRole('button', { name: /Same Screen/ }).click()
    await page.locator('select').first().selectOption(String(rulers))
    await page.waitForTimeout(300)
    await page.getByText('Begin the Age').click()
  }
  for (let i = startAt; i < rulers; i++) await draft(page, i, 6)
  await dismissHandoff(page)
}

async function toActions(page: Page) {
  await page.locator('.next-step button').first().click()
  await page.waitForTimeout(300)
  await dismissReveal(page)
  await page.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await page.waitForTimeout(350)
}

async function main() {
  browser = await chromium.launch()

  // ---------- menu / setup / draft ----------
  const menu = await open({ width: 1440, height: 900 })
  await menu.goto(BASE, { waitUntil: 'domcontentloaded' })
  await menu.waitForTimeout(700)
  await save(menu, 'menu')

  await menu.getByRole('button', { name: /Same Screen/ }).click()
  await menu.locator('select').first().selectOption('2')
  await menu.waitForTimeout(350)
  await save(menu, 'setup')
  await menu.getByText('Begin the Age').click()
  await menu.waitForSelector('text=Shape your Ruler')
  await menu.mouse.move(10, 10)
  await menu.waitForTimeout(600)
  await save(menu, 'draft')

  // ---------- a played board ----------
  await draft(menu, 0, 6)
  await draft(menu, 1, 6)
  await dismissHandoff(menu)
  await menu.locator('.next-step button').first().click()
  await menu.waitForTimeout(600)
  await save(menu, 'resource-reveal')
  await dismissReveal(menu)
  // sell a little, then march army I into a neighbour
  const add = menu.locator('.sell-pill .sell-add').first()
  for (let i = 0; i < 2; i++) await add.click().catch(() => {})
  await menu.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
  await menu.waitForTimeout(400)
  await menu.locator('.army-box').first().click()
  await menu.waitForTimeout(250)
  const move = menu.locator('g.region.moveable').first()
  if (await move.count()) {
    await move.click()
    await menu.waitForTimeout(650)
  }
  await menu.mouse.move(700, 420)
  await menu.waitForTimeout(300)
  await save(menu, 'board')
  await menu.locator('g.region').nth(6).click()
  await menu.waitForTimeout(350)
  await save(menu, 'region')

  // ---------- focus (clean hero board) ----------
  await menu.getByRole('button', { name: /full board/i }).click()
  await menu.waitForTimeout(600)
  await save(menu, 'focus')
  await menu.keyboard.press('Escape')

  // ---------- online lobby ----------
  const host = await open({ width: 1440, height: 900 })
  await host.goto(BASE, { waitUntil: 'domcontentloaded' })
  await host.waitForTimeout(400)
  await host.getByPlaceholder('e.g. Bimbisara').fill('Asoka')
  await host.getByRole('button', { name: /Host Online Room/ }).click()
  await host.waitForTimeout(700)
  const code = (await host.locator('.room-code').textContent())?.trim() ?? ''
  const guest = await open({ width: 1440, height: 900 })
  await guest.goto(BASE, { waitUntil: 'domcontentloaded' })
  await guest.waitForTimeout(300)
  await guest.getByPlaceholder('e.g. Bimbisara').fill('Chandragupta')
  await guest.locator('input[placeholder="CODE"]').fill(code)
  await guest.getByRole('button', { name: 'Join' }).click()
  await guest.waitForTimeout(900)
  await host.waitForTimeout(400)
  await save(host, 'lobby')
  await host.context().close()
  await guest.context().close()

  // ---------- eight rulers ----------
  const eight = await open({ width: 1440, height: 900 })
  await startHotseat(eight, 8)
  await eight.waitForTimeout(500)
  await save(eight, 'eight-players')
  await eight.context().close()

  // ---------- phone ----------
  const phone = await open({ width: 390, height: 844 }, 2)
  await startHotseat(phone, 2)
  await phone.waitForTimeout(500)
  await save(phone, 'mobile')
  await phone.context().close()

  await menu.context().close()

  // ---------- visual language sheet ----------
  await renderVisualSheet()
  await browser.close()
  removeTmp()
  console.log('✓ artifacts written to docs/screenshots')
}

function svgWrap(inner: string, viewBox: string, w: number, h: number) {
  return `<svg width="${w}" height="${h}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
}

async function renderVisualSheet() {
  const colors = ['#b03a2e', '#1f618d', '#1e8449', '#6c3483', '#ca6f1e', '#148f77', '#a04000', '#5d6d7e']
  const crests = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']
  const crestNames = ['Trident · Kashi', 'Lotus · Kosala', 'Elephant · Magadha', 'Horse · Avanti', 'Bull · Vatsa', 'Sun · Shurasena', 'Bow · Panchala', 'Chakra · Kuru']

  const pawns = colors
    .map((c, i) =>
      svgWrap(renderToStaticMarkup(React.createElement(Pawn, { color: c, label: i < 4 ? 'I' : 'II', power: 4 + i })), '-20 -18 40 36', 64, 58),
    )
    .join('')

  const terrains = (['forest', 'hills', 'fields', 'dunes'] as const)
    .map((k) => svgWrap(renderToStaticMarkup(React.createElement(TerrainMotif, { kind: k, x: 0, y: 2 })), '-24 -20 48 36', 82, 62))
    .join('')

  const crestRow = crests
    .map((seed, i) =>
      `<figure class="crest">${renderToStaticMarkup(React.createElement(KingdomCrest, { seed, label: crestNames[i], size: 40, color: '#e6bd63' }))}<figcaption>${crestNames[i]}</figcaption></figure>`,
    )
    .join('')

  const pawnRow = colors
    .map((c, i) => `<figure class="pawn"><div class="pawn-art">${svgWrap(renderToStaticMarkup(React.createElement(Pawn, { color: c, label: i % 2 ? 'II' : 'I', power: 5 })), '-20 -18 40 36', 74, 64)}</div><figcaption>Seat ${i + 1}</figcaption></figure>`)
    .join('')

  const terrainRow = (['forest', 'hills', 'fields', 'dunes'] as const)
    .map((k) => `<figure class="pawn"><div class="terrain-art">${svgWrap(renderToStaticMarkup(React.createElement(TerrainMotif, { kind: k, x: 0, y: 2 })), '-24 -20 48 36', 82, 62)}</div><figcaption>${k}</figcaption></figure>`)
    .join('')

  const track = renderToStaticMarkup(React.createElement(VpTrack, { vp: 7, target: 25, color: '#c99b3f' }))
  const trackerCrest = renderToStaticMarkup(React.createElement(KingdomCrest, { seed: 'k0', label: 'Kashi', size: 18, color: '#b03a2e' }))
  const tracker = `<div class="tracker-mock">
      <div class="tm-head">${trackerCrest}<span class="tm-name">Bimbisara</span><span class="tm-playing">playing</span><span class="tm-vp">7<span>/25</span></span></div>
      <div class="tm-sub">Kashi · 1 fort · Varanasi</div>
      ${track}
    </div>`
  const ship = svgWrap(renderToStaticMarkup(React.createElement(Ship, { x: 0, y: 0, scale: 1 })), '-40 -28 80 58', 150, 108)
  const swordMark = renderToStaticMarkup(React.createElement(Ico, { kind: 'sword', size: 20 }))

  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>
  :root { --ink:#2b1c10; --parch:#efdcb4; --parch2:#e3c795; --chrome:#17100b; --gold:#c99b3f; --gold2:#e6bd63; --maroon:#7b2d26; }
  * { box-sizing: border-box; }
  body { margin:0; width:1600px; height:1180px; background: radial-gradient(1200px 700px at 50% -100px, #2a1d12, #17100b 60%); color:#f0e6cf; font-family:'Cormorant Garamond', Georgia, serif; }
  .sheet { position:relative; padding:54px 64px; }
  .sheet::before { content:''; position:absolute; inset:18px; border:1px solid rgba(201,155,63,.45); border-radius:14px; pointer-events:none; }
  h1 { font-family:'Rozha One', serif; font-weight:400; font-size:46px; margin:0; color:var(--gold2); letter-spacing:.04em; }
  .kicker { font-size:14px; letter-spacing:.34em; color:#b3a480; text-transform:uppercase; margin-bottom:8px; }
  .sub { font-style:italic; color:#cbbb95; font-size:19px; margin:6px 0 30px; }
  .grid { display:grid; grid-template-columns: 1.15fr .85fr; gap:26px; }
  .card { background: linear-gradient(165deg, rgba(239,220,180,.96), rgba(227,199,149,.96)); color:var(--ink); border:1.5px solid var(--gold); border-radius:16px; padding:22px 24px; box-shadow: 0 22px 50px rgba(0,0,0,.45); }
  .card h2 { font-family:'Rozha One', serif; font-weight:400; color:var(--maroon); margin:0 0 4px; font-size:23px; }
  .card .note { font-style:italic; color:#6b5638; font-size:14px; margin:0 0 14px; }
  .row { display:flex; gap:16px; flex-wrap:wrap; }
  figure { margin:0; text-align:center; }
  figcaption { font-size:12.5px; color:#6b5638; margin-top:4px; text-transform:capitalize; letter-spacing:.03em; }
  .pawn-art, .terrain-art { display:flex; align-items:flex-end; justify-content:center; height:70px; }
  .crest { width:158px; padding:8px 4px; border:1px solid rgba(123,45,38,.28); border-radius:10px; background:rgba(255,250,235,.45); }
  .crest figcaption { color:var(--ink); font-size:12px; }
  .divider { height:1px; background: rgba(123,45,38,.28); margin:18px 0 14px; }
  .dark { background: linear-gradient(165deg,#241a11,#17100b); color:#f0e6cf; border-color:#6b5325; }
  .dark h2 { color:var(--gold2); }
  .dark .note, .dark figcaption { color:#b3a480; }
  .track-wrap { margin-top:8px; padding:10px 12px; border:1px solid #4d3a22; border-radius:10px; background:#0e0a06; display:flex; align-items:center; gap:14px; }
  .track-wrap .lbl { font-size:13px; color:#b3a480; font-style:italic; }
  .vp-track { display:flex; align-items:center; gap:4px; }
  .vp-hole { width:12px; height:12px; border-radius:50%; background:#0e0a06; border:1px solid #4d3a22; box-shadow: inset 0 1px 2px rgba(0,0,0,.65); }
  .vp-hole.filled { background: var(--peg); border-color: rgba(255,239,200,.55); }
  .vp-hole.peg { width:16px; height:16px; box-shadow: 0 0 0 2px rgba(255,233,184,.85); }
  .bcard { position:relative; width:84px; height:116px; border-radius:10px; border:1.5px solid #5a4125; background: linear-gradient(165deg,#fffdf4,#e8d2a0); box-shadow: 0 6px 14px rgba(0,0,0,.35); display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:'Rozha One',serif; font-size:34px; color:var(--ink); }
  .bcard small { font-size:11px; font-family:'Cormorant Garamond',serif; color:#6b5638; }
  .bmark { position:absolute; top:8px; left:9px; opacity:.25; }
  .tag { display:inline-flex; align-items:center; gap:8px; padding:5px 12px; border-radius:999px; border:1px solid #6b5325; background:#0e0a06; color:#e8dcc2; font-size:13px; margin:3px 4px 3px 0; }
  .disc { width:34px; height:34px; border-radius:50%; background:#241a11; border:2px solid #f4e7c8; display:inline-flex; align-items:center; justify-content:center; color:#f8eed6; font-family:Georgia,serif; font-weight:700; }
  .disc.blue { background:#1f618d; }
  .disc.red { background:#7b1d12; color:#ffe9b8; }
  .disc.gold { background:#f3e2b3; color:#7a5a1c; }
  .sealwrap { display:inline-flex; align-items:center; gap:8px; }
  .tracker-mock { margin-top:14px; border:1px solid rgba(123,45,38,.35); border-radius:12px; padding:10px 12px; background:rgba(255,250,235,.45); }
  .tm-head { display:flex; align-items:center; gap:8px; font-family:'Rozha One',serif; font-size:18px; color:#2b1c10; }
  .tm-playing { font-family:'Cormorant Garamond',serif; font-size:9px; letter-spacing:.1em; text-transform:uppercase; border:1px solid #a03c32; color:#a03c32; border-radius:999px; padding:0 6px; }
  .tm-vp { margin-left:auto; font-family:Georgia,serif; font-weight:700; color:#2b1c10; }
  .tm-vp span { font-size:11px; color:#6b5638; }
  .tm-sub { font-style:italic; color:#6b5638; font-size:12.5px; margin:2px 0 6px; }
  .seal { width:46px; height:46px; border-radius:50%; display:grid; place-items:center; background: radial-gradient(circle at 35% 30%, #a03c32, #6e1f14); color:#ffe9b8; font-family:'Rozha One',serif; font-size:18px; border:1.5px solid var(--gold); transform:rotate(-8deg); }
  .foot { margin-top:22px; text-align:center; color:#95876a; font-size:13px; font-style:italic; }
</style></head><body><div class="sheet">
  <div class="kicker">Bharata 600 BC · online adaptation</div>
  <h1>Visual language</h1>
  <div class="sub">Every cue on the digital table maps back to a physical component: turned wood, painted atlas, black value discs, peg trackers and gold-framed cards.</div>
  <div class="grid">
    <section class="card">
      <h2>Wooden armies &amp; crests</h2>
      <p class="note">A painted pawn body, seat colour, army numeral and a dark power badge — the digital equivalent of a Channapatna stack.</p>
      <div class="row">${pawnRow}</div>
      <div class="divider"></div>
      <div class="row">${crestRow}</div>
      ${tracker}
    </section>
    <section class="card dark">
      <h2>Table cues</h2>
      <p class="note">Region values are black discs; harbours are sea-blue; disasters are oxblood; hidden tokens are gold. The tracker uses drilled holes and a peg.</p>
      <div class="row" style="align-items:center">
        <span class="disc">4</span><span class="tag">value · VP · cost</span>
        <span class="disc blue">3</span><span class="tag">harbour trade</span>
        <span class="disc red">?</span><span class="tag">hidden token</span>
        <span class="sealwrap"><span class="seal">भा</span><span class="tag">prize seal</span></span>
      </div>
      <div class="track-wrap"><span class="lbl">VP tracker</span>${track}<span class="lbl">7 / 25</span></div>
      <div class="divider" style="background:rgba(230,189,99,.25)"></div>
      <div class="row" style="align-items:center">
        <figure style="margin-right:6px">${ship}<figcaption>sea route</figcaption></figure>
        <div>
          <div class="tag">● region value</div>
          <div class="tag">♟ army (I / II)</div>
          <div class="tag">🚩 fort</div>
          <div class="tag">⚓ harbour</div>
          <div class="tag">⭕ disaster</div>
          <div class="tag">❓ hidden token</div>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Painted terrain</h2>
      <p class="note">Terrain is derived from each region's yields: forests for wood, ridges for iron, field rows for food, dunes for arid land.</p>
      <div class="row">${terrainRow}</div>
    </section>
    <section class="card">
      <h2>Cards</h2>
      <p class="note">Battle hands, royal personae and the resource reveal share one frame language: parchment, gold foil, sword watermark and a wax seal.</p>
      <div class="row" style="align-items:center">
        <div class="bcard"><span class="bmark">${swordMark}</span>5<small>commit</small></div>
        <div style="flex:1; min-width:220px; border:1.5px solid #8a6a30; border-radius:10px; padding:12px; background:linear-gradient(165deg,#fffaf0,#efdcb4)">
          <div style="font-family:'Rozha One',serif; color:#7b2d26; font-size:19px">Deep Forests</div>
          <div style="font-style:italic; color:#6b5638; font-size:13px">All rulers gain 1 wood. You gain 2.</div>
          <div style="font-size:12px; color:#6b5638; margin-top:6px">🪵 +1 all · 🪵 +1 you</div>
        </div>
      </div>
    </section>
  </div>
  <div class="foot">Generated from the live components · npm run artifacts</div>
</div></body></html>`

  const file = path.join(TMP, 'visual-language.html')
  fs.writeFileSync(file, html)
  const page = await open({ width: 1600, height: 1180 }, 1)
  await page.goto(`file://${file}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const png = path.join(TMP, 'visual-language.png')
  await page.screenshot({ path: png, fullPage: true })
  execFileSync('cwebp', ['-quiet', '-q', '90', png, '-o', path.join(OUT, 'visual-language.webp')])
  const kb = Math.round(fs.statSync(path.join(OUT, 'visual-language.webp')).size / 1024)
  console.log(`· visual-language.webp (${kb} kB)`)
  await page.context().close()
}

function removeTmp() {
  try {
    fs.rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e)
  removeTmp()
  process.exit(1)
})
