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
