import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e/",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:5173",
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm dev:server",
      port: 8787,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm dev:web",
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
