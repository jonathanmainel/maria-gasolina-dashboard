import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:5198";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "intraday.browser.ts",
  use: {
    baseURL, browserName: "chromium", timezoneId: "Pacific/Auckland",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5198 --strictPort",
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:55498",
      VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-local-only",
      VITE_ENABLE_INTRADAY_SYNC: "1",
    },
    url: baseURL,
    reuseExistingServer: false,
  },
});
