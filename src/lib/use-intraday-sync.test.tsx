// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useIntradaySync } from "./use-intraday-sync";

const mocks = vi.hoisted(() => ({
  demo: false, session: { user: { id: "viewer" } } as { user: { id: string } } | null,
  request: vi.fn(), status: vi.fn(), reload: vi.fn(),
}));
vi.mock("../auth", () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock("./api", () => ({ CLIENT_SLUG: "maria-gasolina", get isDemoMode() { return mocks.demo; } }));
vi.mock("./marketing-sync", () => ({ requestIntradaySync: mocks.request, getMarketingSyncStatus: mocks.status }));
vi.mock("./data-refresh", () => ({ reloadDashboardData: mocks.reload }));

let visible: boolean;
let client: QueryClient;
const today = "2026-12-15";
const run = (id: string, source: string, status: string, rangeEnd = today) => ({
  id, source, status, database_write_status: status === "success" ? "success" : null,
  range_start: rangeEnd, range_end: rangeEnd,
});
const ticks = (ms = 1) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const show = () => renderHook(({ view }) => useIntradaySync(view, today), {
  initialProps: { view: "executive" },
  wrapper: ({ children }: PropsWithChildren) => <StrictMode><QueryClientProvider client={client}>{children}</QueryClientProvider></StrictMode>,
});
function visibility(next: boolean) {
  visible = next;
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_ENABLE_INTRADAY_SYNC", "1");
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  visible = true;
  mocks.demo = false;
  mocks.session = { user: { id: "viewer" } };
  mocks.request.mockReset().mockResolvedValue({ results: [] });
  mocks.status.mockReset();
  mocks.reload.mockReset().mockResolvedValue(undefined);
  client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("coalesces StrictMode, navigation and focus while a verification is in flight", async () => {
  let complete!: (value: unknown) => void;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { rerender } = show();
  rerender({ view: "site" });
  act(() => window.dispatchEvent(new Event("focus")));
  expect(mocks.request).toHaveBeenCalledTimes(1);
  complete({ results: [] });
  await ticks(2000);
  rerender({ view: "organic" });
  await ticks();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.reload).not.toHaveBeenCalled();
});

it("skips hidden checks and verifies on return and at the visible interval", async () => {
  visible = false;
  show();
  await ticks(31 * 60_000);
  expect(mocks.request).not.toHaveBeenCalled();
  visibility(true);
  await ticks();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await ticks(30 * 60_000);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  visibility(false);
  await ticks(60 * 60_000);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  visibility(true);
  await ticks();
  expect(mocks.request).toHaveBeenCalledTimes(3);
});

it("waits for persisted success and invalidates only the successful platform on a partial failure", async () => {
  mocks.request.mockResolvedValue({ results: [
    { source: "google_ads", state: "accepted", run_id: "google" }, { source: "ga4", state: "active", run_id: "analytics" },
  ] });
  mocks.status.mockResolvedValueOnce({ requested_runs: [run("google", "google_ads", "running"), run("analytics", "ga4", "running")] })
    .mockResolvedValue({ requested_runs: [run("google", "google_ads", "success"), run("analytics", "ga4", "failed")] });
  show();
  await ticks(20);
  expect(mocks.status).toHaveBeenCalledExactlyOnceWith(["google", "analytics"]);
  expect(mocks.reload).not.toHaveBeenCalled();
  await ticks(3100);
  expect(mocks.reload).toHaveBeenCalledExactlyOnceWith(client, new Set(["google_ads"]));
});

it("checks D0 again when the reservation held by the historical collector clears", async () => {
  mocks.request.mockResolvedValueOnce({ results: [{ source: "ga4", state: "active", run_id: "cron" }] })
    .mockResolvedValue({ results: [] });
  mocks.status.mockResolvedValue({ requested_runs: [run("cron", "ga4", "success", "2026-12-14")] });
  show();
  await ticks(100);
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it.each(["demo", "guest", "mock-build"])("does not collect for %s", async mode => {
  if (mode === "demo") mocks.demo = true;
  if (mode === "guest") mocks.session = null;
  if (mode === "mock-build") vi.stubEnv("VITE_ENABLE_INTRADAY_SYNC", "0");
  show();
  await ticks(31 * 60_000);
  expect(mocks.request).not.toHaveBeenCalled();
});
