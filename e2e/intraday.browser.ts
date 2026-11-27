import { test, expect, type Page } from "@playwright/test";
import { apiOrigin, install } from "./fixtures/ui-audit.mjs";

const runId = "10000000-0000-4000-8000-000000000011";
const failureId = "10000000-0000-4000-8000-000000000012";
const day = "2026-10-28";
const dashboard = "/dashboard/maria-gasolina";
const period = (page: Page) => page.getByRole("button", { name: /Período/ });
const picker = (page: Page) => page.getByRole("dialog", { name: "Escolher período" });

test("updates only confirmed data in the Site tab and keeps the selected period and filters", async ({ page, context, baseURL }) => {
  const audit = await install(context, { appOrigin: baseURL, role: "viewer" });
  await page.clock.setFixedTime(new Date("2026-10-28T15:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  let persisted = false;
  let checks = 0;
  const overviewReads: Record<string, string>[] = [];
  const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "content-type": "application/json" };
  await context.route(`${apiOrigin}/functions/v1/request-dashboard-sync`, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const input = route.request().postDataJSON();
    if (input.action === "intraday") {
      checks++;
      expect(input).toEqual({ action: "intraday", client_slug: "maria-gasolina" });
      return route.fulfill({ status: 202, headers, json: { range_start: day, range_end: day, results: [
        { source: "ga4", state: persisted ? "fresh" : "active", run_id: runId },
        { source: "meta_ads", state: persisted ? "backoff" : "active", run_id: failureId },
        { source: "google_ads", state: "unavailable" },
      ] } });
    }
    const runs = [runId, failureId].map((id, i) => ({
      id, source: i === 0 ? "ga4" : "meta_ads", trigger: "intraday", operation: "metrics",
      status: persisted ? i === 0 ? "success" : "failed" : "running",
      range_start: day, range_end: day, requested_at: "2026-10-28T14:56:00Z", period_mode: "today_only",
      database_write_status: persisted && i === 0 ? "success" : null,
    }));
    return route.fulfill({ headers, json: {
      role: "viewer", can_request: false, client_id: 1, today: day, server_time: "2026-10-28T15:00:00Z",
      requested_runs: runs.filter(run => (input.run_ids ?? []).includes(run.id)),
      sources: runs.map((run, i) => ({
        source: run.source, enabled: true, latest_run: run,
        last_today_success_at: persisted && i === 0 ? "2026-10-28T14:59:00Z" : null,
        last_success_at: persisted && i === 0 ? "2026-10-28T14:59:00Z" : "2026-10-27T04:00:00Z",
        available_through: persisted && i === 0 ? day : "2026-10-27", missing_accounts: 0, accounts: [],
      })),
    } });
  });
  await context.route(`${apiOrigin}/rest/v1/rpc/get_dashboard_overview`, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    overviewReads.push(route.request().postDataJSON());
    const current = { has_data: true, sessions: persisted ? 234 : 123, engaged_sessions: 100, new_users: 40, generate_leads: 3 };
    await route.fulfill({ headers, json: { analytics: { current, previous: current, daily: [{ ...current, date: "2026-10-15" }] } } });
  });

  await page.goto(`${dashboard}?view=site`);
  await expect(page.getByText("123", { exact: true })).toBeVisible();
  await expect(page.getByText("Sincronizando dados...", { exact: true })).toBeVisible();
  expect(overviewReads[0]).toMatchObject({
    p_start_date: "2026-10-01", p_end_date: day, p_comparison_start_date: "2026-09-01", p_comparison_end_date: "2026-09-28",
  });
  await expect(page.getByRole("button", { name: "Atualizar agora" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Atualização das fontes" })).toHaveCount(0);
  await period(page).click();
  await picker(page).getByLabel("De", { exact: true }).fill("2026-10-09");
  await picker(page).getByLabel("Até", { exact: true }).fill("2026-10-20");
  await picker(page).getByRole("button", { name: "Aplicar período" }).click();
  await expect.poll(() => overviewReads.at(-1)).toMatchObject({
    p_start_date: "2026-10-09", p_end_date: "2026-10-20", p_comparison_start_date: "2026-09-27", p_comparison_end_date: "2026-10-08",
  });

  await page.getByRole("tab", { name: "Semanal" }).click();
  await page.getByRole("tab", { name: "Por leads" }).click();
  await expect(page.getByText("123", { exact: true })).toBeVisible();
  persisted = true;
  await expect(page.getByText("234", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Atualização parcial", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Semanal" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Por leads" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/view=site/);
  await period(page).click();
  await expect(picker(page).getByLabel("De", { exact: true })).toHaveValue("2026-10-09");
  await expect(picker(page).getByLabel("Até", { exact: true })).toHaveValue("2026-10-20");
  expect(checks).toBeGreaterThan(0);
  expect(audit.blocked).toEqual([]);
});

test("rolls MTD at Brasília midnight, keeps a fixed period and never calls synchronization in demo", async ({ page, context, baseURL }) => {
  const audit = await install(context, { appOrigin: baseURL, auth: false });
  await page.clock.install({ time: new Date("2027-01-01T02:59:20Z") });
  await page.goto(`${dashboard}?demo=1&view=site`);
  await period(page).click();
  await expect(picker(page).getByLabel("De", { exact: true })).toHaveValue("2026-12-01");
  await expect(picker(page).getByLabel("Até", { exact: true })).toHaveValue("2026-12-31");
  await expect(picker(page).getByText(/durações diferentes/)).toBeVisible();
  await page.clock.fastForward(60_000);
  await expect(picker(page).getByLabel("De", { exact: true })).toHaveValue("2027-01-01");
  await expect(picker(page).getByLabel("Até", { exact: true })).toHaveValue("2027-01-01");
  await picker(page).getByLabel("De", { exact: true }).fill("2026-12-15");
  await picker(page).getByRole("button", { name: "Aplicar período" }).click();
  await page.clock.fastForward(24 * 60 * 60_000);
  await period(page).click();
  await expect(picker(page).getByLabel("De", { exact: true })).toHaveValue("2026-12-15");
  await expect(picker(page).getByLabel("Até", { exact: true })).toHaveValue("2027-01-01");
  expect(audit.calls.filter(({ path }) => path.includes("/functions/v1/"))).toEqual([]);
});
