import { defineConfig } from "vitest/config";

// Only the external Edge Runtime wrapper is substituted. Tests invoke the actual
// collector with a synthetic admin client; they do not validate deployed auth/RLS.
const wrapper = new URL("./test-edge-runtime.ts", import.meta.url).pathname;
export default defineConfig({
  resolve: { alias: {
    "@supabase/server": wrapper,
    "@supabase/functions-js/edge-runtime.d.ts": wrapper,
  } },
  test: {
    environment: "node",
    maxWorkers: 2,
    include: [
      "supabase/functions/sync-google-ads/*.test.ts",
      "supabase/functions/sync-dashboard-daily/scheduler.test.ts",
    ],
  },
});
