import { test, expect, type Page } from '@playwright/test'
import { dismissReveal } from './helpers'

let pageErrors: string[] = []

function watch(page: Page) {
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e.message}`))
}

async function draft(page: Page) {
  await expect(page.locator('.modal').getByText('Shape your Ruler')).toBeVisible({ timeout: 15_000 })
  // scope to modal draft items — the chronicle log can echo card names
  await page.locator('.modal .draft-item', { hasText: 'Granary Keeper' }).click()
  await page.locator('.modal .draft-item', { hasText: 'Rainmaker' }).click()
  await page.locator('.modal .draft-item', { hasText: 'Peacemaker' }).click()
  await page.locator('.modal').getByText('Take the Throne').click()
}

test.describe('Bharata online journey', () => {
  test.beforeEach(() => {
    pageErrors = []
  })

  test.afterEach(async ({ page }, info) => {
    if (info.status !== 'passed') {
      await page.screenshot({ path: `e2e/artifacts/failure-online-${info.title.replace(/\W+/g, '-')}.png` })
    }
    expect(pageErrors, 'no console page errors').toEqual([])
  })

  test('host creates room → guest joins → start → drafts → live sync', async ({ browser }) => {
    const hostCtx = await browser.newContext()
    const guestCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const guest = await guestCtx.newPage()
    watch(host)
    watch(guest)

    // host opens a room
    await host.goto('/', { waitUntil: 'domcontentloaded' })
    await host.getByPlaceholder(/e\.g\./i).fill('Chandragupta')
    await host.getByText('Host Online Room').click()
    await expect(host.locator('.room-code')).toBeVisible({ timeout: 8000 })
    const code = ((await host.locator('.room-code').textContent()) ?? '').trim()
    expect(code).toHaveLength(5)
    await host.screenshot({ path: 'e2e/artifacts/lobby-host.png' })

    // guest joins with the code
    await guest.goto('/', { waitUntil: 'domcontentloaded' })
    await guest.getByPlaceholder(/e\.g\./i).fill('Bindusara')
    await guest.getByPlaceholder(/CODE/i).fill(code)
    await guest.getByRole('button', { name: 'Join' }).click()
    await expect(guest.getByText('Bindusara')).toBeVisible()
    await expect(host.getByText('Bindusara')).toBeVisible({ timeout: 8000 })

    // host tunes the age and starts
    await host.selectOption('select >> nth=0', { label: '10 VP' })
    await host.getByText('Sound the Conch').click()

    // both rulers draft
    await draft(host)
    await draft(guest)

    // host plays the resource phase — guest must see the live turn
    await expect(host.locator('.phase-step.on')).toHaveText('Resource')
    await expect(guest.locator('.turn-banner')).toContainText('Chandragupta')
    await host.getByText(/Draw Resource Card/).click()
    await expect(host.locator('.resource-card')).toBeVisible()
    await expect(host.locator('.resource-reveal')).toBeVisible()
    // the drawer's card and reveal are private; the guest gets live feedback only
    await expect(guest.locator('.resource-card')).toHaveCount(0)
    await expect(guest.locator('.resource-reveal')).toHaveCount(0)
    await expect(guest.locator('.fx-ledger')).toBeVisible({ timeout: 4000 })
    await dismissReveal(host)

    await host.locator('.controls').getByRole('button', { name: 'To Actions →' }).click()
    await expect(guest.locator('.phase-step.on')).toHaveText('Actions', { timeout: 8000 })
    await expect(guest.getByText(/Chandragupta commands their armies…/)).toBeVisible()

    await host.screenshot({ path: 'e2e/artifacts/online-host.png' })
    await guest.screenshot({ path: 'e2e/artifacts/online-guest.png' })

    await hostCtx.close()
    await guestCtx.close()
  })
})
