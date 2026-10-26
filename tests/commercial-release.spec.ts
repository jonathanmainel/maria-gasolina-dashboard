import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

// All identities, tokens and stored records are synthetic. Every backend request
// is intercepted; the production project is never contacted by this suite.
async function operationalFixture(page: Page, role: "admin" | "viewer", session = true) {
  const state = { role, userValid: true, roleReads: 0, writes: [] as string[], imports: 0, external: [] as string[], errors: [] as string[] };
  const rows = new Map<string, any>();
  const user = { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", user_metadata: { role: "admin" } };
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = [encode({ alg: "HS256", typ: "JWT" }), encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 }), "synthetic-signature"].join(".");
  if (session) await page.addInitScript(({ token, user }) => {
    localStorage.setItem("sb-commercial-release-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now()/1000)+7200, expires_in: 7200, token_type: "bearer", user }));
  }, { token, user });
  page.on("pageerror", error => state.errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    if (url.hostname !== "commercial-release-test.supabase.co") { state.external.push(url.origin); return route.abort(); }
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,DELETE,OPTIONS" };
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname.includes("/auth/")) return state.userValid ? reply(user) : reply({ message: "Sessão sintética inválida", code: "bad_jwt" }, 401);
    if (url.pathname.includes("/functions/")) { state.imports++; return reply({ message: "Importação não deve ser chamada" }, 403); }
    const table = url.pathname.split("/").pop();
    if (table === "dashboard_clients") return reply({ id: 1, slug: "maria-gasolina" });
    if (table === "dashboard_client_users") { state.roleReads++; return reply({ client_id: 1, role: state.role }); }
    if (table === "dashboard_manual_inputs") {
      const scope = url.searchParams.get("scope")?.replace(/^eq\./, "");
      if (request.method() === "POST") {
        if (state.role !== "admin") return reply({ code: "42501", message: "Escrita sintética negada" }, 403);
        const row = request.postDataJSON(); expect(row.client_id).toBe(1);
        state.writes.push(rows.has(row.scope) ? "update" : "create");
        rows.set(row.scope, { ...row, updated_at: new Date().toISOString() });
        return reply([rows.get(row.scope)], 201);
      }
      if (request.method() === "DELETE") {
        if (state.role !== "admin" || !scope?.startsWith("crm_")) return reply({ code: "42501" }, 403);
        const existed = rows.delete(scope); state.writes.push("delete"); return reply(existed ? [{ scope }] : []);
      }
      if (role === "viewer" && scope?.startsWith("in.(") && rows.size === 0) {
        const match = scope.match(/crm_res_franchise_(\d{8})_(\d{8})/);
        if (match) {
          const date = (value: string) => value.slice(0, 4) + "-" + value.slice(4, 6) + "-" + value.slice(6, 8);
          const key = match[0];
          rows.set(key, { client_id: 1, scope: key, updated_at: new Date().toISOString(), payload: { version: 1, origin: "manual", front: "franchise", kind: "result", period: { start: date(match[1]), end: date(match[2]) }, values: { contracts_closed: 2, revenue: 300 } } });
        }
      }
      return reply(scope && !scope.startsWith("in.(") ? rows.get(scope) ?? null : [...rows.values()]);
    }
    if (table === "dashboard_sync_runs") return reply({ completed_at: "2026-10-24T04:00:00Z" });
    if (table === "dashboard_daily_metrics") return reply({ metric_date: "2026-10-23" });
    if (url.pathname.includes("/rpc/")) return reply({ items: [], total_count: 0, next_cursor: null });
    return reply([]);
  });
  return { state, rows };
}
async function salesReady(page: Page) {
  await page.goto("/dashboard/maria-gasolina?view=crm");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pipeline de hoje");
}
async function checkFronts(page: Page) {
  await expect(page.getByRole("heading", { name: "Pipeline por etapa · Franquias", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Places", exact: true }).click();
  const selector = page.getByLabel("Frente comercial");
  await expect(selector.locator("option")).toHaveCount(4);
  for (const [value, label] of [["condominium", "Condomínios"], ["company", "Empresas"], ["gym", "Academias"], ["hospital", "Hospitais"]]) {
    await selector.selectOption(value);
    await expect(page.getByRole("heading", { name: "Pipeline por etapa · " + label, exact: true })).toBeVisible();
  }
}
test("sem sessão, o dashboard operacional exige autenticação", async ({ page }) => {
  const fixture = await operationalFixture(page, "viewer", false);
  await page.goto("/dashboard/maria-gasolina?view=crm");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Continuar com Google" })).toBeVisible();
  expect(fixture.state.writes).toEqual([]);
});
for (const width of [1280, 390]) {
  test("admin: cinco frentes, criar/atualizar/excluir e Metas persistem em transporte isolado " + width, async ({ page }, info) => {
    const fixture = await operationalFixture(page, "admin");
    await page.setViewportSize({ width, height: 900 }); await salesReady(page);
    await expect(page.getByRole("button", { name: "Editar dados", exact: true })).toHaveCount(2);
    await checkFronts(page);
    const panel = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Resultado do período · Hospitais", exact: true }) });
    for (const count of [3, 4]) {
      await panel.getByRole("button", { name: "Editar dados", exact: true }).click();
      await page.getByLabel("Contratos fechados no período").fill(String(count));
      await page.getByLabel("Receita do período", { exact: true }).fill(String(count * 15000));
      await page.getByRole("button", { name: "Salvar resultado", exact: true }).click();
      await expect(panel.getByText("Valores salvos. As telas já refletem os novos números.")).toBeVisible();
    }
    expect(fixture.state.writes).toEqual(["create", "update"]);
    await page.reload(); await page.getByRole("tab", { name: "Places", exact: true }).click();
    await page.getByLabel("Frente comercial").selectOption("hospital");
    await expect(page.getByRole("button", { name: "Excluir resultado do período", exact: true })).toBeVisible();
    await expect(page.locator(".kpi").filter({ has: page.getByText("Contratos no período", { exact: true }) }).locator(".kpi-value strong")).toHaveText("4");
    expect([...fixture.rows.values()].find(row => row.payload.front === "hospital").payload.values.contracts_closed).toBe(4);
    await page.screenshot({ path: info.outputPath("admin-vendas.png"), fullPage: true });
    await page.getByRole("button", { name: "Excluir resultado do período", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
    await expect(page.getByRole("button", { name: "Excluir resultado do período", exact: true })).toHaveCount(0);
    expect(fixture.state.writes).toEqual(["create", "update", "delete"]);
    await page.goto("/dashboard/maria-gasolina?view=settings");
    await page.getByRole("button", { name: "Editar dados", exact: true }).first().click();
    await page.getByLabel("Verba de mídia mensal", { exact: true }).fill("12345.67");
    await page.getByRole("button", { name: "Salvar metas", exact: true }).click();
    await expect(page.getByText("Valores salvos. As telas já refletem os novos números.")).toBeVisible();
    await page.reload(); await expect(page.getByText(/12\.345,67/).first()).toBeVisible();
    await expect(page.getByLabel("Selecionar planilha", { exact: true })).toBeDisabled();
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Unidade / Condomínio", "Bairro", "Cidade", "UF", "CEP"], ["Unidade sintética", "Centro", "Vitória", "ES", "29000000"]]), "Teste");
    await page.getByRole("group", { name: "Importação da base de unidades" }).evaluate(element => { (element as HTMLFieldSetElement).disabled = false; });
    await page.getByLabel("Selecionar planilha", { exact: true }).setInputFiles({ name: "fixture.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) });
    await expect(page.getByText("Importação de unidades indisponível até a homologação específica deste serviço.", { exact: true })).toHaveCount(2);
    expect(fixture.state.imports).toBe(0);
    expect(fixture.state.external).toEqual([]); expect(fixture.state.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("admin-metas-importacao-bloqueada.png"), fullPage: true });
  });
  test("viewer: consulta sem edição e chamadas diretas não elevam acesso " + width, async ({ page }, info) => {
    const fixture = await operationalFixture(page, "viewer");
    await page.setViewportSize({ width, height: 900 }); await salesReady(page);
    await expect(page.getByText("Seu perfil permite somente leitura dos dados comerciais.")).toBeVisible();
    await expect(page.locator(".kpi").filter({ has: page.getByText("Contratos no período", { exact: true }) }).locator(".kpi-value strong")).toHaveText("2");
    await checkFronts(page);
    await expect(page.getByRole("button", { name: "Editar dados", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Excluir/ })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("viewer-vendas.png"), fullPage: true });
    await page.goto("/dashboard/maria-gasolina?view=settings");
    await expect(page.getByText("Seu perfil permite somente leitura de metas e configurações.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar dados", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Selecionar planilha", { exact: true })).toBeDisabled();
    const denied = await page.evaluate(async () => {
      const path = "/src/lib/";
      const commercial = await import(path + "commercial-data.ts"), manual = await import(path + "manual-inputs.ts"), network = await import(path + "network-import.ts");
      const command = { front: "company", kind: "result", range: { start: "2026-10-01", end: "2026-10-23" }, values: { contracts_closed: 1, revenue: 100 } };
      const actions = [() => commercial.saveCommercialRecord(command), () => commercial.deleteCommercialRecord(command), () => manual.saveManualData(manual.defaultManualData), () => network.importNetworkUnits({ filename: "synthetic.xlsx", rows: [], dryRun: false })];
      const messages = [];
      for (const action of actions) { try { await action(); messages.push("UNEXPECTED_SUCCESS"); } catch (error) { messages.push((error as Error).message); } }
      return messages;
    });
    expect(denied[0]).toContain("somente leitura"); expect(denied[1]).toContain("Somente admin"); expect(denied[2]).toContain("somente leitura"); expect(denied[3]).toContain("indisponível");
    expect(fixture.state.writes).toEqual([]); expect(fixture.state.imports).toBe(0);
    expect(fixture.state.external).toEqual([]); expect(fixture.state.errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("viewer-metas.png"), fullPage: true });
  });
}
test("papel atualizado fecha a edição aberta sem recarregar a sessão", async ({ page }) => {
  await page.clock.install();
  const fixture = await operationalFixture(page, "admin"); await salesReady(page);
  await page.getByRole("button", { name: "Editar dados", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Salvar pipeline", exact: true })).toBeVisible();
  const previousReads = fixture.state.roleReads; fixture.state.role = "viewer";
  await page.clock.fastForward(31_000);
  await expect(page.getByText("Seu perfil permite somente leitura dos dados comerciais.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar pipeline", exact: true })).toHaveCount(0);
  expect(fixture.state.roleReads).toBeGreaterThan(previousReads); expect(fixture.state.writes).toEqual([]);
});
test("Auth não validado nunca concede edição apesar da sessão local", async ({ page }) => {
  const fixture = await operationalFixture(page, "admin"); fixture.state.userValid = false;
  await page.goto("/dashboard/maria-gasolina?view=crm");
  await expect(page.getByRole("button", { name: "Editar dados", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar resultado", exact: true })).toHaveCount(0);
  await expect(page.getByText("Edição operacional bloqueada até a aprovação e configuração das permissões no Supabase.").or(page.getByRole("button", { name: "Continuar com Google" }))).toBeVisible();
  expect(fixture.state.writes).toEqual([]);
});
test("admin em compartilhamento permanece somente leitura", async ({ page }) => {
  const fixture = await operationalFixture(page, "admin");
  await page.goto("/dashboard/maria-gasolina?view=crm&share=1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pipeline de hoje");
  await expect(page.getByRole("button", { name: "Editar dados", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Excluir/ })).toHaveCount(0);
  expect(fixture.state.writes).toEqual([]);
});
