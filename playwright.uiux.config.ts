import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'uiux-navigation.spec.ts', workers: 1,
  timeout: 90000, expect: {timeout: 15000},
  outputDir: 'artifacts/uiux-01/playwright',
  reporter: [['list'], ['json', {outputFile:'artifacts/uiux-01/results.json'}]],
  use: {
    baseURL: 'http://127.0.0.1:5196', browserName:'chromium', channel:'chrome',
    reducedMotion:'reduce', timezoneId:'America/Sao_Paulo', serviceWorkers:'block', trace:'retain-on-failure',
  },
  webServer: {
    command:'node node_modules/vite/bin/vite.js --configLoader runner --host 127.0.0.1 --port 5196 --strictPort',
    url:'http://127.0.0.1:5196/login', reuseExistingServer:true, timeout:120000,
    env:{VITE_SUPABASE_URL:'http://127.0.0.1:55498',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_AUDIT_SYNTHETIC_ONLY',VITE_DEMO_MODE:'false'},
  },
});
