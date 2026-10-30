import { build, preview } from "vite";
const root = process.env.CREATIVE_BASELINE_ROOT || process.cwd();
const outDir = `${process.cwd()}/artifacts/creative-categories/${process.env.CREATIVE_BASELINE_ROOT ? "baseline" : "updated"}-app`;
await build({ root, configLoader: "runner", build: { outDir, emptyOutDir: true }, logLevel: "warn" });
const server = await preview({ root, configLoader: "runner", build: { outDir }, preview: { host: "127.0.0.1", port: 4197, strictPort: true }, logLevel: "warn" });
const stop = () => server.httpServer.close(() => process.exit(0));
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
