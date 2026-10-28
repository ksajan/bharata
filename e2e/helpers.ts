import type { Page } from '@playwright/test'

/** The resource reveal is modal by design — dismiss it when a flow just needs the card applied. */
export async function dismissReveal(page: Page) {
  const take = page.getByRole('button', { name: 'Take the bounty' })
  try {
    await take.waitFor({ state: 'visible', timeout: 2000 })
    await take.click()
    await page.waitForTimeout(150)
  } catch {
    // no reveal in this flow
  }
}

/** Hot-seat privacy gate that can now sit above a pending battle or prize. */
export async function acknowledgeHandoff(page: Page) {
  const handoff = page.locator('.handoff-backdrop .primary')
  if (await handoff.count()) {
    await handoff.first().click()
    await page.waitForTimeout(120)
  }
}
