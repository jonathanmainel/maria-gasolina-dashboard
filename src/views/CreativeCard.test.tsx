// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Creative } from "../types";
import { CreativeCard, CreativeRanking } from "./FrontView";

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const creative = (over: Partial<Creative> = {}): Creative => ({
  id: "ad-1", name: "Criativo Meta", front: "franchise", channel: "meta_ads", format: "image",
  headline: "Campanha FRANQ", palette: ["#123456", "#654321"], spend: 100, impressions: 1000,
  clicks: 50, leads: 5, cpl: 20, ctr: 5, hook_rate: null,
  creative_type: "image", preview_url: "https://storage.example/creative.jpg", ...over,
});

describe("creative ranking cards", () => {
  it("shows real Meta artwork without changing rank or metrics, and opens shared lightbox", () => {
    render(<CreativeCard c={creative({ creative_type: "video" })} rank={1} />);
    expect(screen.getByText("Vídeo")).not.toBeNull();
    expect(screen.getByText("1")).not.toBeNull();
    expect(screen.getByText("5")).not.toBeNull();
    const button = screen.getByRole("button", { name: "Ampliar imagem: Criativo Meta" });
    expect(button.querySelector("img")?.getAttribute("src")).toContain("creative.jpg");
    fireEvent.click(button);
    expect(within(screen.getByRole("dialog")).getByRole("img").getAttribute("src")).toContain("creative.jpg");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([["image", "Estático"], ["carousel", "Carrossel"], ["dynamic", "Dinâmico"]] as const)(
    "uses real creative_type %s", (type, label) => {
      render(<CreativeCard c={creative({ creative_type: type })} rank={4} />);
      expect(screen.getByText(label)).not.toBeNull();
    },
  );

  it("keeps gradient fallback when metadata or browser image is missing", () => {
    const { rerender } = render(<CreativeCard c={creative({ preview_url: null })} rank={2} />);
    expect(screen.queryByRole("button", { name: /Ampliar imagem:/ })).toBeNull();
    rerender(<CreativeCard c={creative({})} rank={2} />);
    const button = screen.getByRole("button", { name: /Ampliar imagem:/ });
    fireEvent.error(button.querySelector("img") as HTMLImageElement);
    expect(screen.queryByRole("button", { name: /Ampliar imagem:/ })).toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
  });
});

describe("creative ranking expansion", () => {
  const creatives = Array.from({ length: 10 }, (_, index) => creative({
    id: `ad-${index + 1}`,
    name: `Criativo ${index + 1}`,
    leads: 100 - index,
    preview_url: `https://storage.example/creative-${index + 1}.jpg`,
  }));

  it("shows Top 3, expands to at most 9, and collapses without changing rank", () => {
    const { container } = render(<CreativeRanking creatives={creatives} />);
    expect(screen.getAllByRole("button", { name: /Ampliar imagem:/ })).toHaveLength(3);
    expect([...container.querySelectorAll(".rank")].map((node) => node.textContent)).toEqual(["1", "2", "3"]);

    const expand = screen.getByRole("button", { name: "Ver mais criativos" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(screen.getAllByRole("button", { name: /Ampliar imagem:/ })).toHaveLength(9);
    expect([...container.querySelectorAll(".rank")].map((node) => node.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar menos" }));
    expect(screen.getAllByRole("button", { name: /Ampliar imagem:/ })).toHaveLength(3);
    expect([...container.querySelectorAll(".rank")].map((node) => node.textContent)).toEqual(["1", "2", "3"]);
  });

  it("does not show expansion with three or fewer creatives", () => {
    const { rerender } = render(<CreativeRanking creatives={creatives.slice(0, 3)} />);
    expect(screen.queryByRole("button", { name: "Ver mais criativos" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Ampliar imagem:/ })).toHaveLength(3);

    rerender(<CreativeRanking creatives={creatives.slice(0, 2)} />);
    expect(screen.getAllByRole("button", { name: /Ampliar imagem:/ })).toHaveLength(2);
  });
});
