// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reload: vi.fn(), demo: false }));
vi.mock("../lib/api", () => ({ get isDemoMode() { return mocks.demo; } }));
vi.mock("../lib/data-refresh", () => ({
  reloadDashboardData: mocks.reload,
  getSourceFreshness: async () => [
    { source: "meta_ads", completedAt: "2026-10-23T04:00:00Z", latestDate: "2026-10-22" },
    { source: "google_ads", completedAt: "2026-09-28T04:00:00Z", latestDate: "2026-09-27" },
    { source: "ga4", completedAt: "2026-10-23T04:00:00Z", latestDate: "2026-10-22" },
  ],
}));
import { DataRefreshPanel } from "./DataRefreshPanel";
afterEach(cleanup);
beforeEach(() => { mocks.demo = false; mocks.reload.mockReset(); });
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DataRefreshPanel range={{ start: "2026-10-01", end: "2026-10-22" }} />
  </QueryClientProvider>);
}
describe("recarregamento compacto no cabeçalho", () => {
  it("informa cobertura desatualizada sem adicionar painel ao conteúdo", async () => {
    const { container } = show();
    const button = screen.getByRole("button", { name: "Recarregar dados" });
    await waitFor(() => expect(button.getAttribute("title")).toContain("Google Ads: dados até 27/09/2026 (período incompleto)"));
    expect(container.querySelector(".topbar-refresh")).toBeTruthy();
    expect(container.querySelector(".data-refresh")).toBeNull();
    expect(button.getAttribute("title")).toContain("não inicia coleta nas APIs");
  });
  it("aguarda o refetch e bloqueia clique duplicado", async () => {
    let done!: () => void;
    mocks.reload.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
    show();
    const button = screen.getByRole("button", { name: "Recarregar dados" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    done();
    await screen.findByText(/Consultas recarregadas com sucesso/);
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  it("exibe falhas sem simular sucesso", async () => {
    mocks.reload.mockRejectedValue(new Error("network"));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Recarregar dados" }));
    await screen.findByText(/Falha ao recarregar/);
    expect(screen.queryByText(/Consultas recarregadas com sucesso/)).toBeNull();
  });
  it("não apresenta datas reais no modo demonstração", async () => {
    mocks.demo = true;
    show();
    const button = screen.getByRole("button", { name: "Recarregar dados" });
    expect(button.getAttribute("title")).toContain("Modo demonstração");
    expect(button.getAttribute("title")).not.toContain("22/10/2026");
  });
});
