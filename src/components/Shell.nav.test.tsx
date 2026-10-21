// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppView, DateRange } from "../types";
import { Shell } from "./Shell";

vi.mock("../auth", () => ({ useAuth: () => ({ user: { email: "gt@gtmais.com.br" }, signOut: () => {} }) }));
vi.mock("../theme", () => ({ useTheme: () => ({ theme: "dark", toggle: () => {} }) }));
vi.mock("./three/AmbientField", () => ({ AmbientField: () => null }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo ??= (() => {}) as typeof window.scrollTo;
});
afterEach(cleanup);

const range: DateRange = { start: "2026-08-25", end: "2026-09-07" };

function renderShell(view: AppView = "executive", onViewChange = vi.fn()) {
  render(
    <Shell view={view} onViewChange={onViewChange} range={range} comparisonEnabled onPeriodApply={() => {}} onPresent={() => {}} onShare={() => {}}>
      <p>conteúdo</p>
    </Shell>,
  );
  return onViewChange;
}

const frentes = () => {
  const group = [...document.querySelectorAll(".sidebar-group")].find((g) => g.querySelector("small")?.textContent === "Frentes")!;
  return within(group as HTMLElement).getAllByRole("button").map((button) => button.textContent);
};

describe("sidebar: FRENTES", () => {
  it("agrupa Place e Expansão e preserva Orgânico e Site", () => {
    renderShell();
    expect(frentes()).toEqual(["Place", "Expansão", "Orgânico", "Site"]);
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    fireEvent.click(screen.getByRole("button", { name: "Expansão" }));
    expect(frentes()).toEqual(["Place", "Condomínios", "Empresas", "Academias", "Hospitais", "Expansão", "Franquias", "Orgânico", "Site"]);
  });

  it.each([
    ["condominium", "Condomínios", "Place"], ["company", "Empresas", "Place"],
    ["gym", "Academias", "Place"], ["hospital", "Hospitais", "Place"],
    ["franchise", "Franquias", "Expansão"],
  ] as const)("abre a categoria e marca o link direto %s", (view, label, category) => {
    const navigate = renderShell(view);
    expect(screen.getByRole("button", { name: category }).getAttribute("aria-expanded")).toBe("true");
    const link = screen.getByRole("button", { name: label });
    expect(link.getAttribute("aria-current")).toBe("page");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith(view);
  });

  it("recolhe a categoria ativa sem mudar a página e alterna categorias independentemente", () => {
    const navigate = renderShell("company");
    const place = screen.getByRole("button", { name: "Place" });
    const expansion = screen.getByRole("button", { name: "Expansão" });
    expect(document.getElementById(place.getAttribute("aria-controls")!)?.hidden).toBe(false);
    fireEvent.click(place);
    expect(place.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Empresas" })).toBeNull();
    fireEvent.click(expansion);
    expect(expansion.getAttribute("aria-expanded")).toBe("true");
    expect(place.getAttribute("aria-expanded")).toBe("false");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).not.toBeNull();
  });

  it("chama o Site pelo nome curto, sem GA4 nem Google Analytics no menu", () => {
    renderShell();
    const item = screen.getByRole("button", { name: "Site" });
    expect(item.textContent).toBe("Site");
    expect(frentes().join(" ")).not.toMatch(/GA4|Google Analytics/);
  });

  it("dá ao Site o mesmo indicador colorido das outras frentes, na cor sky", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    fireEvent.click(screen.getByRole("button", { name: "Expansão" }));
    const dots = ["franchise", "condominium", "organic", "site"].map((front) => {
      const dot = document.querySelector(`.nav-item .dot.${front}`);
      return dot ? dot.className : null;
    });
    expect(dots).toEqual(["dot franchise", "dot condominium", "dot organic", "dot site"]);
    // Mesma estrutura das demais frentes: a cor vem da folha de estilo pela
    // classe do item, não de estilo inline exclusivo do Site.
    const siteDot = screen.getByRole("button", { name: "Site" }).querySelector(".dot")!;
    expect(siteDot.className).toBe("dot site");
    expect(siteDot.getAttribute("style")).toBeNull();
  });

  it("navega para a aba Site", () => {
    const onViewChange = renderShell("executive");
    fireEvent.click(screen.getByRole("button", { name: "Site" }));
    expect(onViewChange).toHaveBeenCalledWith("site");
  });

  it("marca o Site como página atual quando a view é site", () => {
    renderShell("site");
    const item = screen.getByRole("button", { name: "Site" });
    expect(item.getAttribute("aria-current")).toBe("page");
    expect(item.className).toContain("active");
    expect(screen.getByRole("button", { name: "Orgânico" }).getAttribute("aria-current")).toBeNull();
  });

  it("dá ao Site o título próprio na topbar e tira o Site do título do Orgânico", () => {
    renderShell("site");
    expect(document.querySelector(".topbar-title")!.textContent).toContain("Comportamento dos usuários no site");
    cleanup();
    renderShell("organic");
    const title = document.querySelector(".topbar-title")!.textContent ?? "";
    expect(title).toContain("Instagram e Facebook");
    expect(title).not.toContain("Site");
  });
});
