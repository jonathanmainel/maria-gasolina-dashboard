import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "commercial-release.spec.ts",
  outputDir: "artifacts/commercial-release/e2e", workers: 1,
  timeout: 60_000, expect: { timeout: 12_000 },
  use: { baseURL: "http://127.0.0.1:4196", browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --configLoader runner --mode test --host 127.0.0.1 --port 4196 --strictPort",
    url: "http://127.0.0.1:4196/login", reuseExistingServer: false, timeout: 120_000,
    env: { VITE_SUPABASE_URL: "https://commercial-release-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key-for-isolated-tests", VITE_ENABLE_DEMO: "0" },
  },
});
