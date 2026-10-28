import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "meta-preview-quality.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: "artifacts/meta-preview-quality/e2e",
  use: {
    baseURL: "http://127.0.0.1:4196",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/serve-meta-preview-test.mjs",
    url: "http://127.0.0.1:4196/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: "https://preview-quality-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY:
        "synthetic-public-key-for-network-isolated-e2e",
    },
  },
});
