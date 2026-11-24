import { defineConfig, devices } from '@playwright/test'

const port = 4317
const prebuilt = process.env['NULLPAD_DIST']

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: '150%',
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['./e2e/reporters/require-tests.ts']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1000, height: 600 },
    trace: 'off',
  },
  webServer: {
    command:
      prebuilt === undefined
        ? `pnpm exec vite build && pnpm exec vite preview --port ${port} --strictPort`
        : `pnpm exec vite preview --outDir ${prebuilt} --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
})
