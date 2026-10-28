// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), reload: vi.fn(), session: { user: { id: "admin" } } as any, demo: false }));
vi.mock("../auth", () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock("../lib/api", () => ({ CLIENT_SLUG: "maria-gasolina", get isDemoMode() { return mocks.demo; } }));
vi.mock("../lib/data-refresh", () => ({ reloadDashboardData: mocks.reload }));
vi.mock("../lib/marketing-sync", async () => ({ ...await vi.importActual("../lib/marketing-sync"), getMarketingSyncStatus: mocks.status, requestMarketingSync: mocks.request }));
import { DataRefreshPanel } from "./DataRefreshPanel";
const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
let state: any;
let client: QueryClient;
const sourceNames = ["meta_ads", "google_ads", "ga4"];
function show() { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const today = vi.fn(); return { today, ...render(<QueryClientProvider client={client}><DataRefreshPanel range={{ start: "2026-10-01", end: "2026-10-26" }} onShowToday={today} /></QueryClientProvider>) }; }
beforeEach(() => {
  mocks.demo = false; mocks.session = { user: { id: "admin" } }; vi.clearAllMocks();
  state = { role: "admin", can_request: true, today: "2026-10-27", server_time: new Date().toISOString(), requested_runs: [], sources: sourceNames.map(source => ({ source, enabled: true, latest_run: null, last_success_at: null, available_through: "2026-10-26", missing_accounts: 0, next_manual_at: null })) };
  mocks.status.mockImplementation(async () => structuredClone(state)); mocks.reload.mockResolvedValue(undefined);
  mocks.request.mockImplementation(async () => {
    state.sources.forEach((source: any, i: number) => { source.latest_run = { id: ids[i], source: source.source, status: "running", range_start: "2026-10-20", range_end: "2026-10-27", period_mode: "including_today", requested_at: new Date().toISOString(), started_at: new Date().toISOString(), overdue: false }; });
    state.requested_runs = state.sources.map((source: any) => source.latest_run);
    return { ok: true, results: sourceNames.map((source, i) => ({ source, state: "accepted", run_id: ids[i] })) };
  });
});
afterEach(() => { cleanup(); client?.clear(); });
describe("real synchronization control", () => {
  it("requests all collectors once, waits for actual outcomes and then refetches", async () => {
    show(); const button = await screen.findByRole("button", { name: "Atualizar agora" });
    fireEvent.click(button); fireEvent.click(button);
    await screen.findByRole("button", { name: "Sincronizando..." });
    expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.request.mock.calls[0][0].sort()).toEqual(sourceNames.sort()); expect(mocks.reload).not.toHaveBeenCalled();
    for (const run of state.requested_runs) { run.status = run.source === "ga4" ? "failed" : "success"; run.database_write_status = run.status === "success" ? "success" : null; }
    await act(async () => { await client.refetchQueries({ queryKey: ["marketing-sync"] }); });
    await screen.findByRole("button", { name: "Parcialmente concluído" });
    expect(mocks.reload).toHaveBeenCalledOnce(); expect(screen.getByText(/Falha da última tentativa/)).toBeTruthy();
  });
  it("allows viewing Hoje without pretending the previous period contains today", async () => {
    const { today } = show(); await screen.findByRole("button", { name: "Atualizar agora" });
    fireEvent.click(screen.getByRole("button", { name: "Ver atualização das fontes" }));
    expect(screen.getByText(/termina em 26\/10\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver Hoje · parcial" })); expect(today).toHaveBeenCalledWith("2026-10-27"); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("keeps viewer read access and does not trust an editor flag", async () => {
    for (const role of ["viewer", "editor"]) {
      state.role = role; state.can_request = role === "editor";
      show(); await waitFor(() => expect(mocks.status).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Atualizar agora" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Ver atualização das fontes" })); await screen.findByText(/Somente administradores/); cleanup(); client.clear();
    }
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not expose a trigger without login or in demo", () => {
    mocks.session = null; show(); expect(screen.queryByRole("button")).toBeNull(); cleanup(); client.clear(); mocks.demo = true; show(); expect(screen.getByText(/coleta desativada/)).toBeTruthy(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves the request key after an unconfirmed response and does not claim success", async () => {
    mocks.request.mockRejectedValue(new Error("network")); show(); fireEvent.click(await screen.findByRole("button", { name: "Atualizar agora" }));
    await screen.findByText(/Não foi possível confirmar/); expect(screen.queryByRole("button", { name: "Concluído" })).toBeNull(); expect(mocks.reload).not.toHaveBeenCalled();
  });
});
