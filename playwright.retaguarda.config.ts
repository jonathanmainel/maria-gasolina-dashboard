import { defineConfig } from "@playwright/test";

const appOrigin = "http://127.0.0.1:5219";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "retaguarda.browser.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: appOrigin,
    channel: "chrome",
    reducedMotion: "reduce",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js build --configLoader runner --outDir .preview/retaguarda && node node_modules/vite/bin/vite.js preview --configLoader runner --outDir .preview/retaguarda --host 127.0.0.1 --port 5219 --strictPort",
    url: `${appOrigin}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:55498",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_AUDIT_SYNTHETIC_ONLY",
    },
  },
});
