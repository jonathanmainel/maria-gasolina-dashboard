import {defineConfig} from '@playwright/test';
process.env.UIUX_APP_ORIGIN='http://127.0.0.1:5197';
export default defineConfig({
 testDir:'./e2e',testMatch:['uiux-branding.spec.ts','uiux-navigation.spec.ts'],workers:1,timeout:90000,expect:{timeout:20000},
 outputDir:process.env.UIUX_BRANDING_OUTPUT??'artifacts/uiux-06/playwright',reporter:[['list'],['json',{outputFile:process.env.UIUX_BRANDING_REPORT??'artifacts/uiux-06/results.json'}]],
 use:{baseURL:process.env.UIUX_APP_ORIGIN,browserName:'chromium',channel:'chrome',reducedMotion:'reduce',timezoneId:'America/Sao_Paulo',serviceWorkers:'block',trace:'retain-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --configLoader runner --outDir dist/client --host 127.0.0.1 --port 5197 --strictPort',url:'http://127.0.0.1:5197/login',reuseExistingServer:false,timeout:30000},
});
