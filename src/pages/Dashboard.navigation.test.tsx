// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./Dashboard";

vi.mock("../auth", () => ({ useAuth: () => ({ user: null, signOut() {} }) }));
vi.mock("../theme", () => ({ useTheme: () => ({ theme: "dark", toggle() {} }) }));
vi.mock("../components/three/AmbientField", () => ({ AmbientField: () => null }));
vi.mock("../lib/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), getLastSync: vi.fn(async () => null) }));
vi.mock("../lib/use-dashboard", async (original) => ({
  ...await original<typeof import("../lib/use-dashboard")>(),
  useDashboard: () => ({ isLoading: true, isError: true, error: new Error("Fonte indisponível"), refetch() {} }),
}));
beforeAll(() => {
  window.matchMedia ??= ((media: string) => ({ matches: false, media, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => {};
});
afterEach(cleanup);
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function show(view: string, suffix = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/dashboard/maria-gasolina?view=${view}${suffix}`]}><DashboardPage /><Location /></MemoryRouter></QueryClientProvider>);
}
describe("URLs comerciais e independência das páginas vazias", () => {
  it.each([["company", "Empresas"], ["gym", "Academias"], ["hospital", "Hospitais"]])("abre %s apesar de erro/carregamento nas fontes existentes", (view, label) => {
    show(view);
    expect(screen.getByRole("heading", { name: label, level: 1 })).not.toBeNull();
    expect(screen.queryByText("Não foi possível carregar os dados")).toBeNull();
    expect(screen.getByRole("button", { name: "Place" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: label }).getAttribute("aria-current")).toBe("page");
  });
  it("navega entre categorias preservando parâmetros e os endereços anteriores", () => {
    show("company", "&share=1&custom=preserve");
    fireEvent.click(screen.getByRole("button", { name: "Hospitais" }));
    expect(screen.getByTestId("location").textContent).toContain("view=hospital");
    expect(screen.getByTestId("location").textContent).toContain("custom=preserve");
    expect(screen.getByTestId("location").textContent).toContain("share=1");
    fireEvent.click(screen.getByRole("button", { name: "Expansão" }));
    fireEvent.click(screen.getByRole("button", { name: "Franquias" }));
    expect(screen.getByTestId("location").textContent).toContain("view=franchise");
    fireEvent.click(screen.getByRole("button", { name: "Condomínios" }));
    expect(screen.getByTestId("location").textContent).toContain("view=condominium");
    expect(screen.queryByRole("button", { name: "Metas e ajustes" })).toBeNull();
  });
});
