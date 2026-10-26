import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", outputDir: "artifacts/incremento05-integracao/e2e", workers: 1,
  timeout: 60_000, expect: { timeout: 10_000 },
  use: { baseURL: "http://127.0.0.1:4185", browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
  webServer: { command: "node node_modules/vite/bin/vite.js preview --configLoader runner --outDir .preview --host 127.0.0.1 --port 4185 --strictPort", url: "http://127.0.0.1:4185/login", reuseExistingServer: false, timeout: 120_000 },
});
