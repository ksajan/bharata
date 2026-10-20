import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
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
