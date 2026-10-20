import { test, expect } from '@playwright/test'

test('ruler count sets a sensible VP default without clobbering a manual choice', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByRole('button', { name: /Same Screen/ }).click()
  const rulers = page.locator('select').first()
  const vp = page.locator('.cfg-grid select').first()

  await rulers.selectOption('2')
  await expect(vp).toHaveValue('25')

  await rulers.selectOption('3')
  await expect(vp).toHaveValue('20')

  await rulers.selectOption('5')
  await expect(vp).toHaveValue('25')

  // a manual preset wins until the host changes it again
  await page.getByRole('button', { name: /Quick/ }).click()
  await expect(vp).toHaveValue('15')
  await rulers.selectOption('4')
  await expect(vp).toHaveValue('15')

  expect(errors).toEqual([])
})
