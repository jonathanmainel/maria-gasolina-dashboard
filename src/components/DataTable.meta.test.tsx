// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DetailRow } from "../lib/detail-rows";
import { DataTable } from "./DataTable";

afterEach(cleanup);

const row = (over: Partial<DetailRow>): DetailRow => ({
  key: "meta_ads:ad:parent:ad-1", level: "ad", item_id: "ad-1", item_name: "Anúncio Meta",
  subtitle: null, channel: "meta_ads", pmax: false, parent_id: "parent", campaign_name: "FRANQ",
  spend: 100, impressions: 1000, clicks: 50, results: 5, ctr: 5, cost_per_result: 20,
  field_type: null, performance_label: null, image_url: "https://storage.example/real.jpg",
  youtube_video_id: null, text_content: null, ...over,
});

const table = () => document.querySelector(".desktop-table") as HTMLElement;

describe("Meta thumbnails in ad details", () => {
  it("renders the signed preview and reuses the PMax lightbox", () => {
    render(<DataTable items={[row({})]} />);
    const thumb = within(table()).getByRole("button", { name: "Ampliar imagem: Anúncio Meta" });
    expect(thumb.querySelector("img")?.getAttribute("src")).toBe("https://storage.example/real.jpg");
    fireEvent.click(thumb);
    expect(within(screen.getByRole("dialog")).getByRole("img").getAttribute("src")).toBe("https://storage.example/real.jpg");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses a placeholder when metadata or image loading fails", () => {
    const { rerender } = render(<DataTable items={[row({ image_url: null })]} />);
    expect(table().querySelector(".asset-placeholder")).not.toBeNull();
    rerender(<DataTable items={[row({})]} />);
    const thumb = within(table()).getByRole("button", { name: "Ampliar imagem: Anúncio Meta" });
    fireEvent.error(thumb.querySelector("img") as HTMLImageElement);
    expect(table().querySelector(".asset-placeholder")).not.toBeNull();
    expect(within(table()).queryByRole("button", { name: "Ampliar imagem: Anúncio Meta" })).toBeNull();
  });

  it("never puts a preview in groups, even if a URL is present", () => {
    render(<DataTable items={[row({ key: "meta_ads:group::group-1", level: "group" })]} />);
    expect(table().querySelector(".asset-preview")).toBeNull();
  });
});
