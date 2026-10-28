import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const wrapper = fileURLToPath(new URL("./sync-google-ads/test-edge-runtime.ts", import.meta.url));
export default defineConfig({ resolve: { alias: { "@supabase/server": wrapper, "@supabase/functions-js/edge-runtime.d.ts": wrapper } }, test: { environment: "node", maxWorkers: 1, include: ["supabase/functions/**/*.test.ts"] } });
