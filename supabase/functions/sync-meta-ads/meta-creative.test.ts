import { describe, expect, it } from "vitest";
import {
  buildCreativeDatabaseRow,
  buildCreativeStoragePath,
  canReuseCreativePreview,
  downloadPreview,
  type ExistingCreative,
  isCreativePreviewStale,
  mapWithConcurrency,
  normalizeMetaCreative,
} from "./meta-creative.ts";

const existing: ExistingCreative = {
  entity_id: "ad-1",
  creative_id: "creative-1",
  preview_storage_path: "1/meta_ads/account/ad/ad-1/creative-1.jpg",
  preview_mime_type: "image/jpeg",
  preview_sha256: "abc",
  last_error: null,
  refreshed_at: "2026-09-24T10:00:00.000Z",
};

describe("Meta creative normalization", () => {
  it("normalizes a single image", () => {
    const result = normalizeMetaCreative({
      updated_time: "2026-09-24T10:00:00+0000",
      creative: {
        id: "creative-image",
        image_url: "https://cdn.example/image.jpg",
        object_story_spec: {
          link_data: {
            name: "Headline",
            message: "Body",
            link: "https://example.com/landing",
          },
        },
      },
    });

    expect(result.creativeType).toBe("image");
    expect(result.previewKind).toBe("image");
    expect(result.metadata).toMatchObject({
      headline: "Headline",
      body: "Body",
    });
  });

  it("normalizes a video thumbnail", () => {
    const result = normalizeMetaCreative({
      creative: {
        id: "creative-video",
        object_type: "VIDEO",
        object_story_spec: {
          video_data: { image_url: "https://cdn.example/video.jpg" },
        },
      },
    });

    expect(result.creativeType).toBe("video");
    expect(result.previewKind).toBe("video_thumbnail");
  });

  it("uses the first carousel card as representative preview", () => {
    const result = normalizeMetaCreative({
      creative: {
        id: "creative-carousel",
        object_story_spec: {
          link_data: {
            child_attachments: [
              { picture: "https://cdn.example/first.jpg", name: "First" },
              { picture: "https://cdn.example/second.jpg", name: "Second" },
            ],
          },
        },
      },
    });

    expect(result.creativeType).toBe("carousel");
    expect(result.previewKind).toBe("carousel_representative");
    expect(result.previewUrl).toContain("first.jpg");
  });

  it("normalizes a dynamic creative representative", () => {
    const result = normalizeMetaCreative({
      creative: {
        id: "creative-dynamic",
        asset_feed_spec: {
          images: [{ url: "https://cdn.example/dynamic.jpg" }],
          titles: [{ text: "Dynamic title" }],
        },
      },
    });

    expect(result.creativeType).toBe("dynamic");
    expect(result.previewKind).toBe("dynamic_representative");
    expect(result.metadata).toMatchObject({ headline: "Dynamic title" });
  });

  it("keeps unsupported creatives available as metadata-only rows", () => {
    const result = normalizeMetaCreative({
      creative: { id: "creative-empty" },
    });
    expect(result.creativeType).toBe("unknown");
    expect(result.previewKind).toBe("unavailable");
    expect(result.previewUrl).toBeNull();
  });

  it("never persists source preview URLs or token query values", () => {
    const creative = normalizeMetaCreative({
      creative: {
        id: "creative-secret-test",
        thumbnail_url:
          "https://cdn.example/image.jpg?access_token=SECRET_PREVIEW",
        object_story_spec: {
          link_data: {
            link:
              "https://example.com/?utm_source=meta&access_token=SECRET_LINK",
          },
        },
      },
    });
    const row = buildCreativeDatabaseRow({
      clientId: 1,
      ref: {
        account_id: "account",
        ad_id: "ad-1",
        ad_name: null,
        campaign_id: null,
        campaign_name: null,
        adset_id: null,
        adset_name: null,
      },
      creative,
      preview: {
        path: "1/meta_ads/account/ad/ad-1/creative-secret-test.jpg",
        mime: "image/jpeg",
        sha256: "abc",
      },
      nowIso: "2026-09-24T12:00:00.000Z",
    });

    expect(JSON.stringify(row)).not.toContain("SECRET_PREVIEW");
    expect(JSON.stringify(row)).not.toContain("SECRET_LINK");
    expect(row.metadata).toMatchObject({
      destination_url: "https://example.com/?utm_source=meta",
    });
  });
});

describe("Meta creative lifecycle", () => {
  it("builds a deterministic private storage path", () => {
    expect(
      buildCreativeStoragePath(
        7,
        "act/123",
        "ad:1",
        "creative:2",
        "image/jpeg",
      ),
    ).toBe("7/meta_ads/act_123/ad/ad_1/creative_2.jpg");
  });

  it("reuses the same creative and refreshes a changed creative", () => {
    expect(canReuseCreativePreview(existing, "creative-1")).toBe(true);
    expect(canReuseCreativePreview(existing, "creative-2")).toBe(false);
  });

  it("reuses a fresh row but retries stale and failed rows", () => {
    const now = new Date("2026-09-24T20:00:00.000Z");
    expect(isCreativePreviewStale(existing, now)).toBe(false);
    expect(
      isCreativePreviewStale(
        {
          ...existing,
          refreshed_at: "2026-09-23T20:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isCreativePreviewStale(
        { ...existing, last_error: "storage_upload" },
        now,
      ),
    ).toBe(true);
  });

  it("reports download failures without exposing response bodies", async () => {
    await expect(
      downloadPreview(
        "https://cdn.example/missing.jpg",
        async () => new Response("secret upstream body", { status: 403 }),
      ),
    ).rejects.toMatchObject({ code: "preview_http_403" });
  });

  it("isolates a storage failure from other creative tasks", async () => {
    const results = await mapWithConcurrency(
      ["ok", "storage", "ok-2"],
      2,
      async (item) => {
        if (item === "storage") throw new Error("storage failed");
        return item;
      },
    );

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });
});
