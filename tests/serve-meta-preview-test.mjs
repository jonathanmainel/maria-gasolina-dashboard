// Local bundled app, synthetic env supplied by Playwright; never a deployment.
import { build, preview } from "vite";

const outDir = "artifacts/meta-preview-quality/bundled-app";
await build({
  configLoader: "runner",
  build: { outDir },
  logLevel: "warn",
});
const server = await preview({
  configLoader: "runner",
  build: { outDir },
  preview: { host: "127.0.0.1", port: 4196, strictPort: true },
  logLevel: "warn",
});
const stop = () => server.httpServer.close(() => process.exit(0));
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
