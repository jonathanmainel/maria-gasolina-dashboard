import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: vi.fn(), sign: vi.fn(), user: { id: "member-1" }, filters: [] as Array<[string, unknown]>,
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: mocks.user } } }) },
    from: () => {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { mocks.filters.push([key, value]); return query; },
        in: (key: string, ids: string[]) => { mocks.filters.push([key, ids]); return mocks.rows(ids); },
      };
      return query;
    },
    storage: { from: (bucket: string) => {
      mocks.filters.push(["bucket", bucket]);
      return { createSignedUrls: mocks.sign };
    } },
  },
}));

import { getMetaCreativePreviews } from "./creative-previews";

const row = (id: string, type: string, available = true) => ({
  ad_id: id, creative_type: type, preview_kind: "image", preview_storage_path: `client/${id}.jpg`, preview_available: available,
});
const signed = (paths: string[]) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://storage.example/${path}?token=temporary`, error: null })), error: null,
});

beforeEach(() => {
  mocks.rows.mockReset(); mocks.sign.mockReset(); mocks.filters.length = 0;
  mocks.user.id = "member-1";
});

describe("Meta creative previews", () => {
  it("lê metadata e assina em lote, relacionando pelo ad_id mesmo fora de ordem", async () => {
    mocks.rows.mockResolvedValue({ data: [row("join-b", "video"), row("join-a", "image"), row("join-c", "dynamic"), row("join-d", "carousel")], error: null });
    mocks.sign.mockImplementation(async (paths: string[]) => signed(paths));
    const previews = await getMetaCreativePreviews(["join-a", "join-b", "join-c", "join-d"], 42);
    expect(mocks.rows).toHaveBeenCalledTimes(1);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(mocks.filters).toContainEqual(["client_id", 42]);
    expect(mocks.filters).toContainEqual(["source", "meta_ads"]);
    expect(mocks.filters).toContainEqual(["entity_type", "ad"]);
    expect(mocks.filters).toContainEqual(["bucket", "dashboard-creatives"]);
    expect(previews.get("join-a")?.creative_type).toBe("image");
    expect(previews.get("join-b")?.creative_type).toBe("video");
    expect(previews.get("join-c")?.creative_type).toBe("dynamic");
    expect(previews.get("join-d")?.creative_type).toBe("carousel");
    expect(previews.get("join-a")?.preview_url).toContain("join-a.jpg");
  });

  it("mantém linha sem preview e falha de assinatura sem URL quebrada", async () => {
    mocks.rows.mockResolvedValue({ data: [row("missing", "image", false), row("sign-fail", "video")], error: null });
    mocks.sign.mockResolvedValue({ data: [], error: new Error("storage unavailable") });
    const previews = await getMetaCreativePreviews(["missing", "sign-fail"], 42);
    expect(previews.get("missing")?.preview_url).toBeNull();
    expect(previews.get("sign-fail")?.preview_url).toBeNull();
  });

  it("reutiliza URL curta só para o mesmo membro", async () => {
    mocks.rows.mockResolvedValue({ data: [row("cached", "image")], error: null });
    mocks.sign.mockImplementation(async (paths: string[]) => signed(paths));
    await getMetaCreativePreviews(["cached"], 42);
    await getMetaCreativePreviews(["cached"], 42);
    expect(mocks.sign).toHaveBeenCalledTimes(1);
    mocks.user.id = "member-2";
    await getMetaCreativePreviews(["cached"], 42);
    expect(mocks.sign).toHaveBeenCalledTimes(2);
  });
});
