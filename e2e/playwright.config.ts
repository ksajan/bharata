import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  // exploratory capture scripts are run manually, not in the regression suite
  testIgnore: ['**/flow-capture.spec.ts', '**/late-capture.spec.ts', '**/visual-audit.spec.ts'],
  timeout: 90_000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: './artifacts',
})
