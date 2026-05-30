import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= ".playwright-browsers";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  reporter: "list",
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-13-mini",
      use: { ...devices["iPhone 13 Mini"] },
    },
  ],
});
