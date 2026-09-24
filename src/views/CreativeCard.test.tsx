// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Creative } from "../types";
import { CreativeCard } from "./FrontView";

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
    fireEvent.click(screen.getByRole("button", { name: "Fechar imagem ampliada" }));
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
