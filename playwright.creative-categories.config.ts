import { defineConfig } from "@playwright/test";
export default defineConfig({
  metadata: { baseline: Boolean(process.env.CREATIVE_BASELINE_ROOT) },
  testDir: "./tests", testMatch: "creative-categories.spec.ts", workers: 1,
  timeout: 90_000, expect: { timeout: 15_000 },
  outputDir: "artifacts/creative-categories/e2e",
  use: { baseURL: "http://127.0.0.1:4197", browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/serve-creative-categories-test.mjs", url: "http://127.0.0.1:4197/login",
    reuseExistingServer: false, timeout: 180_000,
    env: { VITE_SUPABASE_URL: "https://preview-quality-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key-for-network-isolated-e2e" },
  },
});
