import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "presentation-release.spec.ts", timeout: 90_000,
  expect: { timeout: 10_000 }, workers: 2,
  use: { baseURL: "http://127.0.0.1:4180", browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
  webServer: { command: "node node_modules/vite/bin/vite.js --configLoader runner --mode demo --host 127.0.0.1 --port 4180 --strictPort", url: "http://127.0.0.1:4180", reuseExistingServer: true, timeout: 120_000 },
});
