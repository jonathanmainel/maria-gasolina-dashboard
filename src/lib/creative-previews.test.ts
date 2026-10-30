import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { clearCreativePreviewCache, getMetaCreativePreviews } from "./creative-previews";

const row = (id: string, type: string, available = true) => ({
  ad_id: id, creative_type: type, preview_kind: "image", preview_storage_path: `client/${id}.jpg`, preview_available: available,
});
const signed = (paths: string[]) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://storage.example/${path}?token=temporary`, error: null })), error: null,
});

beforeEach(() => {
  clearCreativePreviewCache(); mocks.rows.mockReset(); mocks.sign.mockReset(); mocks.filters.length = 0;
  mocks.user.id = "member-1";
});
afterEach(() => vi.useRealTimers());

describe("Meta creative previews", () => {
  it("identifica o asset de vídeo dinâmico pelo video_id já resolvido pela ingestão", async () => {
    mocks.rows.mockResolvedValue({data:[{...row('dynamic-asset','dynamic'),metadata:{object_type:'DYNAMIC',video_id:'authorized-asset'}}],error:null});
    mocks.sign.mockImplementation(async(paths:string[])=>signed(paths));
    expect((await getMetaCreativePreviews(['dynamic-asset'],42)).get('dynamic-asset')).toMatchObject({creative_type:'dynamic',preview_media_type:'video'});
  });
  it("renova URLs vencidas no cache e permite recuperar uma assinatura rejeitada", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    mocks.rows.mockResolvedValue({ data: [row('expiry-i07','video')],error:null });
    mocks.sign.mockImplementation(async(paths:string[])=>signed(paths));
    await getMetaCreativePreviews(['expiry-i07'],42);
    await getMetaCreativePreviews(['expiry-i07'],42);expect(mocks.sign).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(601_000);
    await getMetaCreativePreviews(['expiry-i07'],42);expect(mocks.sign).toHaveBeenCalledTimes(2);
    await getMetaCreativePreviews(['expiry-i07'],42,{forceRefresh:true});expect(mocks.sign).toHaveBeenCalledTimes(3);
  });

  it("transporta a origem e as dimensões de um vídeo dinâmico sem alterar seu tipo",async()=>{
    mocks.rows.mockResolvedValue({data:[{...row('dynamic-i07','dynamic'),metadata:{object_type:'VIDEO',preview_width:1080,preview_height:1920,preview_source:'video.thumbnails'}}],error:null});
    mocks.sign.mockImplementation(async(paths:string[])=>signed(paths));
    const result=(await getMetaCreativePreviews(['dynamic-i07'],42)).get('dynamic-i07');
    expect(result).toMatchObject({creative_type:'dynamic',preview_media_type:'video',preview_width:1080,preview_height:1920,preview_source:'video.thumbnails'});
  });
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


it("lê classificação de todos, mas só assina os selecionados sem repetir a consulta", async () => {
  const rows = Array.from({length:30},(_,i)=>({...row(`ad-${i}`,i<15 ? "video" : "dynamic"), metadata:{preview_media_type:i<15 ? "video" : "image"}}));
  mocks.rows.mockResolvedValue({data:rows,error:null});
  mocks.sign.mockImplementation(async(paths:string[])=>signed(paths));
  const previews = await getMetaCreativePreviews(rows.map(r=>r.ad_id),42,{
    selectPreviewIds: metadata => {
      expect(metadata.size).toBe(30);
      expect(metadata.get("ad-20")?.preview_media_type).toBe("image");
      return [...metadata.values()].filter(m=>m.preview_media_type==="video").slice(0,9).concat(
        [...metadata.values()].filter(m=>m.preview_media_type==="image").slice(0,9)).map(m=>m.ad_id);
    },
  });
  expect(mocks.rows).toHaveBeenCalledTimes(1);
  expect(mocks.sign).toHaveBeenCalledTimes(1);
  expect(mocks.sign.mock.calls[0][0]).toHaveLength(18);
  expect([...previews.values()].filter(p=>p.preview_url)).toHaveLength(18);
  expect(previews.get("ad-14")).toMatchObject({creative_type:"video",preview_url:null});
});
it("não presume imagem para dinâmico sem evidência e preserva vídeo com thumbnail JPEG", async () => {
  mocks.rows.mockResolvedValue({data:[row("unknown-dynamic","dynamic",false),{...row("jpeg-video","video"),metadata:{preview_media_type:"image"}}],error:null});
  mocks.sign.mockImplementation(async(paths:string[])=>signed(paths));
  const previews=await getMetaCreativePreviews(["unknown-dynamic","jpeg-video"],42);
  expect(previews.get("unknown-dynamic")?.preview_media_type).toBeUndefined();
  expect(previews.get("jpeg-video")?.preview_media_type).toBe("video");
});

it("mantém lotes de 100 metadados, sem assinar fora da seleção", async () => {
  const ids=Array.from({length:205},(_,i)=>`batch-${i}`);
  mocks.rows.mockImplementation(async(batch:string[])=>({data:batch.map(id=>row(id,"video")),error:null}));
  mocks.sign.mockImplementation(async(paths:string[])=>signed(paths));
  const previews=await getMetaCreativePreviews(ids,42,{selectPreviewIds:metadata=>[...metadata.keys()].slice(0,9)});
  expect(mocks.rows.mock.calls.map(call=>call[0].length)).toEqual([100,100,5]);
  expect(previews.size).toBe(205);
  expect(mocks.sign.mock.calls[0][0]).toHaveLength(9);
});
it("não consulta metadados nem assina URLs sem membro autenticado", async () => {
  mocks.user.id="";
  expect((await getMetaCreativePreviews(["private"],42)).size).toBe(0);
  expect(mocks.rows).not.toHaveBeenCalled();
  expect(mocks.sign).not.toHaveBeenCalled();
});
