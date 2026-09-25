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
  it("lista Franquias, Condomínios, Orgânico e Site nessa ordem", () => {
    renderShell();
    expect(frentes()).toEqual(["Franquias", "Condomínios", "Orgânico", "Site"]);
  });

  it("chama o Site pelo nome curto, sem GA4 nem Google Analytics no menu", () => {
    renderShell();
    const item = screen.getByRole("button", { name: "Site" });
    expect(item.textContent).toBe("Site");
    expect(frentes().join(" ")).not.toMatch(/GA4|Google Analytics/);
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
