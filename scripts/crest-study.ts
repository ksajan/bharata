/**
 * Renders the crest + terrain study used in the README's art-direction section.
 * The same React art components as the game are rendered at 96, 40 and 18 px.
 *
 *   npx tsx scripts/crest-study.ts
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { KingdomCrest, TerrainMotif } from '../client/ui/art'

const OUT = path.resolve('docs/screenshots/crest-study.webp')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bharata-crest-'))

const seeds = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']
const names = ['Trident', 'Lotus', 'Elephant', 'Horse', 'Bull', 'Sun', 'Bow', 'Chakra']
const colors = ['#b03a2e', '#1f618d', '#1e8449', '#6c3483', '#ca6f1e', '#148f77', '#a04000', '#5d6d7e']

function crest(seed: string, name: string, size: number, color: string) {
  return renderToStaticMarkup(React.createElement(KingdomCrest, { seed, label: name, size, color }))
}

function terrain(kind: 'forest' | 'hills' | 'fields' | 'dunes', size: number) {
  return `<svg width="${size}" height="${size * 0.75}" viewBox="-24 -20 48 36" xmlns="http://www.w3.org/2000/svg">${renderToStaticMarkup(
    React.createElement(TerrainMotif, { kind, x: 0, y: 2 }),
  )}</svg>`
}

const big = seeds
  .map(
    (s, i) =>
      `<figure class="big"><div class="disc">${crest(s, names[i], 96, '#e6bd63')}</div><figcaption>${names[i]}</figcaption></figure>`,
  )
  .join('')
const mid = seeds
  .map(
    (s, i) =>
      `<figure><div class="card">${crest(s, names[i], 40, colors[i])}<span>${names[i]}</span></div><figcaption>40 px</figcaption></figure>`,
  )
  .join('')
const small = seeds
  .map(
    (s, i) =>
      `<figure><div class="card mini">${crest(s, names[i], 18, colors[i])}<span>${names[i]}</span></div><figcaption>18 px</figcaption></figure>`,
  )
  .join('')
const terrains = (['forest', 'hills', 'fields', 'dunes'] as const)
  .map(
    (k) => `<figure><div class="terr-card">${terrain(k, 140)}</div><figcaption>${k}</figcaption></figure>`,
  )
  .join('')

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin:0; width:1400px; padding:44px 54px 34px; background:radial-gradient(1100px 650px at 50% -80px,#2a1d12,#17100b 62%); color:#efe3c8; font-family:'Cormorant Garamond',Georgia,serif; }
  .kicker { font-size:13px; letter-spacing:.32em; text-transform:uppercase; color:#b3a480; }
  h1 { font-family:'Rozha One',serif; font-weight:400; color:#e6bd63; font-size:42px; margin:4px 0 2px; }
  .sub { color:#cbbb95; font-size:19px; font-style:italic; margin:0 0 24px; }
  h2 { font-family:'Rozha One',serif; font-weight:400; color:#e6bd63; font-size:22px; margin:24px 0 10px; padding-bottom:5px; border-bottom:1px solid #4d3a22; }
  .row { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end; }
  figure { margin:0; text-align:center; }
  figcaption { font-size:12px; color:#b3a480; margin-top:5px; letter-spacing:.04em; }
  .big .disc { width:118px; height:118px; display:grid; place-items:center; border:1px solid #6d5427; border-radius:50%; background:radial-gradient(circle at 50% 36%,#2d2115,#1b130d); }
  .card { display:flex; align-items:center; gap:7px; min-width:168px; padding:9px 13px; border:1px solid #c99b3f; border-radius:8px; background:#efdcb4; color:#2b1c10; font-size:15px; }
  .card.mini { min-width:132px; padding:6px 9px; font-size:13px; }
  .terr-card { display:grid; place-items:center; padding:6px; border:1px solid #c99b3f; border-radius:10px; background:#efdcb4; }
  .foot { margin-top:24px; color:#8f8062; font-size:12.5px; font-style:italic; border-top:1px solid #3a2a18; padding-top:10px; }
</style></head><body>
<div class="kicker">Bharata · crest &amp; terrain study</div>
<h1>Marks of the Mahajanapadas</h1>
<div class="sub">Line-built crests that still read in an 18 px ruler card — lotus, elephant, horse, bull and bow, plus paddy fields and dune country.</div>
<h2>Large crests · 96 px</h2><div class="row">${big}</div>
<h2>Artifact row · 40 px</h2><div class="row">${mid}</div>
<h2>Ruler-card size · 18 px</h2><div class="row">${small}</div>
<h2>Terrain</h2><div class="row">${terrains}</div>
<div class="foot">Studied from Indian lotus, Elephas maximus, Marwari horse, zebu bull, recurve archery, Thar dunes and paddy-field references. No third-party artwork is copied.</div>
</body></html>`

async function main() {
  fs.writeFileSync(path.join(TMP, 'study.html'), html)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`file://${path.join(TMP, 'study.html')}`)
  await page.waitForTimeout(900)
  const png = path.join(TMP, 'study.png')
  await page.screenshot({ path: png, fullPage: true })
  await browser.close()
  execFileSync('cwebp', ['-quiet', '-q', '88', png, OUT])
  fs.rmSync(TMP, { recursive: true, force: true })
  console.log(`✓ ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} kB)`)
}

main().catch((err) => {
  fs.rmSync(TMP, { recursive: true, force: true })
  console.error(err)
  process.exit(1)
})
