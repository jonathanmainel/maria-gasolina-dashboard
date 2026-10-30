// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { CreativeSection } from "./FrontView";
import type { Creative } from "../types";

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);
const ads = (["franchise", "condominium"] as const).flatMap(front =>
  (["video", "image"] as const).flatMap(type => Array.from({ length: 11 }, (_, i): Creative => ({
    id: `${front}-${type}-${i}`, name: `${front}-${type}-${i}`, front, channel: "meta_ads", format: type,
    creative_type: type, preview_url: `https://example.test/${front}-${type}-${i}.jpg`,
    headline: "Campanha", palette: ["#123", "#234"], spend: 100, leads: 100 - i,
    impressions: 1000, clicks: 10, cpl: 1, ctr: 1, hook_rate: type === "video" ? 25 : null,
  }))));

it("tem só dois seletores, inicia em vídeos e reinicia Top 3 e modal ao alternar", () => {
  const { container } = render(<CreativeSection front="franchise" creatives={ads} />);
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["Vídeos", "Estáticos"]);
  expect(screen.getByRole("tab", { name: "Vídeos" }).getAttribute("aria-selected")).toBe("true");
  expect(container.querySelectorAll(".creative-art-video")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Ver mais criativos" }));
  expect(container.querySelectorAll(".creative")).toHaveLength(9);
  fireEvent.click(screen.getAllByRole("button", { name: /Ampliar imagem:/ })[0]);
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Estáticos" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(container.querySelectorAll(".creative-art-static")).toHaveLength(3);
  expect([...container.querySelectorAll(".rank")].map(n => n.textContent)).toEqual(["1", "2", "3"]);
  fireEvent.click(screen.getByRole("button", { name: "Ver mais criativos" }));
  expect(container.querySelectorAll(".creative-art-static")).toHaveLength(9);
  fireEvent.click(screen.getByRole("tab", { name: "Vídeos" }));
  expect(container.querySelectorAll(".creative")).toHaveLength(3);
  expect(container.querySelector(".creative-stats")?.textContent).toContain("hook");
});

it("inicia em estáticos quando não há vídeo, permite categoria vazia e mantém anúncio sem preview", () => {
  const { container } = render(<CreativeSection front="franchise" creatives={[{ ...ads[11], preview_url: null }]} />);
  expect(screen.getByRole("tab", { name: "Estáticos" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("Imagem indisponível no momento")).toBeTruthy();
  expect(container.querySelectorAll(".creative")).toHaveLength(1);
  fireEvent.click(screen.getByRole("tab", { name: "Vídeos" }));
  expect(screen.getByText("Nenhum vídeo de Meta Ads com dados nesta frente e período.")).toBeTruthy();
  expect(container.querySelectorAll(".creative")).toHaveLength(0);
});

it("chave da frente/período impede cards e expansão do contexto anterior", () => {
  const { container, rerender } = render(<CreativeSection key="franchise:oct" front="franchise" creatives={ads} />);
  fireEvent.click(screen.getByRole("tab", { name: "Estáticos" }));
  fireEvent.click(screen.getByRole("button", { name: "Ver mais criativos" }));
  rerender(<CreativeSection key="condominium:oct" front="condominium" creatives={ads} />);
  expect(container.querySelectorAll(".creative")).toHaveLength(3);
  expect(container.querySelector(".creative-copy strong")?.textContent).toBe("condominium-video-0");
  expect(within(container).queryByText("franchise-image-0")).toBeNull();
  rerender(<CreativeSection key="condominium:sep" front="condominium" creatives={[]} />);
  expect(screen.getByText("Nenhum vídeo de Meta Ads com dados nesta frente e período.")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Estáticos" }));
  expect(screen.getByText("Nenhum criativo estático de Meta Ads com dados nesta frente e período.")).toBeTruthy();
});

it("estático de baixa resolução é contido no tamanho nativo", () => {
  const { container } = render(<CreativeSection front="franchise" creatives={[ads[11]]} />);
  const image = container.querySelector(".creative img") as HTMLImageElement;
  Object.defineProperties(image, { naturalWidth: { value: 64 }, naturalHeight: { value: 64 } });
  fireEvent.load(image);
  expect(image.style.maxWidth).toBe("64px");
  expect(image.style.maxHeight).toBe("64px");
  expect(container.querySelector(".creative-art-vertical")).toBeNull();
});
