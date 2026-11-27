import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:5198";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "intraday.browser.ts",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL, browserName: "chromium", timezoneId: "Pacific/Auckland", trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH },
  },
  webServer: {
    command: [
      "vite build --configLoader runner --mode demo --base / --outDir .preview/intraday",
      "vite preview --configLoader runner --base / --outDir .preview/intraday --host 127.0.0.1 --port 5198 --strictPort",
    ].join(" && "),
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:55498",
      VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-local-only",
      VITE_ENABLE_INTRADAY_SYNC: "1",
    },
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
