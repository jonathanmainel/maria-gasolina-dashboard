import { test as base, expect } from "@playwright/test";

export { expect };
export type { Page, Locator } from "@playwright/test";

// Homologação isolada: somente o preview local e os dados de demonstração
// existentes. A fixture vale para todos os cenários, inclusive os legados.
export const test = base.extend<{ browserAudit: void }>({
  browserAudit: [async ({ page }, use, info) => {
    const audit = { runtimeErrors: [] as string[], consoleErrors: [] as string[], consoleWarnings: [] as string[], blockedExternalRequests: [] as string[] };
    page.on("pageerror", (error) => audit.runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") audit.consoleErrors.push(message.text());
      if (message.type() === "warning") audit.consoleWarnings.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
      audit.blockedExternalRequests.push(url.origin);
      return route.abort();
    });
    await use();
    await info.attach("browser-audit", { body: JSON.stringify(audit, null, 2), contentType: "application/json" });
    expect(audit.runtimeErrors, "Erros de execução no navegador").toEqual([]);
    expect(audit.consoleErrors, "Erros de console no navegador").toEqual([]);
  }, { auto: true }],
});
