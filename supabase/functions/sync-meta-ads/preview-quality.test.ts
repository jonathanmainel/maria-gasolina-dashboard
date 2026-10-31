import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  enrichMetaCreativePreviews,
  normalizeMetaCreative,
  downloadPreview,
  PREVIEW_STRATEGY_VERSION,
  validatePreviewAdIds,
  resolveCreativePreview,
} from "./meta-creative.ts";
import { improves, inspectImage, MAX_PREVIEW_BYTES, videoPreviewQuality } from "./preview-media.ts";
import { loadApprovedSources } from "./approved-preview-source.ts";

const raster = (name = "large.png") =>
  new Uint8Array(
    readFileSync(
      new URL(`../../../tests/fixtures/meta-previews/${name}`, import.meta.url),
    ),
  );
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const media = (name: string) => `https://scontent.xx.fbcdn.net/${name}`;
const clone = <T>(value: T): T => structuredClone(value);
const row = (name = "small.png", extra: Record<string, any> = {}) => ({
  client_id: 1,
  source: "meta_ads",
  account_id: "acct-a",
  entity_type: "ad",
  entity_id: "ad-1",
  ad_id: "ad-1",
  creative_id: "creative-1",
  creative_type: "video",
  preview_kind: "video_thumbnail",
  preview_storage_path: `1/meta_ads/acct-a/ad/ad-1/old.${name.split(".").pop()}`,
  preview_mime_type: `image/${name.endsWith(".jpg") ? "jpeg" : name.split(".").pop()}`,
  preview_sha256: hash(raster(name)),
  refreshed_at: "2026-09-24T00:00:00Z",
  updated_at: "2026-09-24T00:00:00Z",
  last_error: null,
  metadata: {
    preview_width: 160,
    preview_height: 284,
    preview_source: "legacy",
    video_id: "video-1",
    body: "keep body",
    custom: { keep: true },
  },
  ...extra,
});
const ad = (creative: Record<string, any> = {}) => ({
  id: "ad-1",
  creative: {
    id: "creative-1",
    object_type: "VIDEO",
    video_id: "video-1",
    thumbnail_url: media("tiny.png"),
    ...creative,
  },
});

/** In-memory transports around the REAL enrichment module, never production Auth/REST. */
function harness(
  settings: {
    rows?: any[];
    ads?: any[];
    thumbnails?: any[];
    thumbnailPages?: any[][];
    thumbnailCycle?: boolean;
    format?: any[];
    picture?: string;
    apiError?: boolean;
    uploadError?: boolean;
    dbError?: boolean;
    downloadError?: boolean;
    concurrent?: boolean;
    files?: Record<string, Uint8Array | number>;
    images?: any[];
  } = {},
) {
  const rows = clone(settings.rows ?? [row()]);
  const upgradeAudits:any[]=[];
  const objects = new Map<string, Uint8Array>();
  for (const stored of rows)
    if (stored.preview_storage_path)
      objects.set(
        stored.preview_storage_path,
        raster(readdirSync(new URL("../../../tests/fixtures/meta-previews/",import.meta.url)).find(name => !name.endsWith('.py') && hash(raster(name)) === stored.preview_sha256) ?? "small.png"),
      );
  const uploads: string[] = [],
    removes: string[] = [],
    downloads: string[] = [],
    requests: string[] = [],
    writes: any[] = [],
    filters: any[] = [];
  let concurrentApplied = false;
  const supabase: any = {
    from: (table: string) => {
      if(table==='dashboard_automation_runs'){
        const constraints:Array<[string,any]>=[];
        const contains=(value:any,part:any):boolean=>Array.isArray(part)?part.every(x=>value?.some((v:any)=>contains(v,x))):part&&typeof part==='object'?Object.entries(part).every(([k,v])=>contains(value?.[k],v)):value===part;
        const enums:Array<[string,any[]]>=[];
        const q:any={select:()=>q,eq:(k:string,v:any)=>{constraints.push([k,v]);return q;},in:(k:string,v:any[])=>{enums.push([k,v]);return q;},contains:(k:string,v:any)=>{constraints.push([k,v]);return q;},order:()=>q,limit:async()=>({data:upgradeAudits.filter(a=>constraints.every(([k,v])=>contains(a[k],v))&&enums.every(([k,v])=>v.includes(a[k]))),error:null})};
        return q;
      }
      let action = "select",
        payload: any,
        selected = false;
      const constraints: Array<[string, unknown]> = [];
      const matches = (item: any) =>
        constraints.every(([key, value]) =>
          Array.isArray(value)
            ? value.includes(item[key])
            : item[key] === value,
        );
      const query: any = {
        select: () => {
          selected = true;
          return query;
        },
        eq: (key: string, value: any) => {
          constraints.push([key, value]);
          filters.push([table, key, value]);
          return query;
        },
        in: (key: string, value: any) => {
          constraints.push([key, value]);
          return query;
        },
        gte: () => query,
        lte: () => query,
        range: () => query,
        update: (value: any) => {
          action = "update";
          payload = value;
          return query;
        },
        insert: (value: any) => {
          action = "insert";
          payload = value;
          return query;
        },
        upsert: (value: any) => {
          action = "upsert";
          payload = value;
          return query;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve()
            .then(() => {
              if (table === "dashboard_ad_daily")
                return { data: [], error: null };
              if (action === "select")
                return { data: clone(rows.filter(matches)), error: null };
              if (settings.concurrent && !concurrentApplied && selected) {
                rows[0].updated_at = "2026-10-28T11:59:59Z";
                rows[0].metadata = { newer: true };
                concurrentApplied = true;
              }
              writes.push({
                action,
                table,
                payload: clone(payload),
                constraints,
              });
              if (settings.dbError && selected)
                return {
                  data: null,
                  error: { code: "XX", message: "private backend error" },
                };
              if (action === "insert") {
                if (
                  rows.some(
                    (item) =>
                      item.client_id === payload.client_id &&
                      item.account_id === payload.account_id &&
                      item.entity_id === payload.entity_id,
                  )
                )
                  return { data: null, error: { code: "23505" } };
                rows.push(clone(payload));
                return { data: [payload], error: null };
              }
              const targets = rows.filter(matches);
              for (const target of targets)
                Object.assign(target, clone(payload));
              return { data: clone(targets), error: null };
            })
            .then(resolve, reject),
      };
      return query;
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("dashboard-creatives");
        return {
          download: async (path: string) => {
            downloads.push(path);
            return settings.downloadError || !objects.has(path)
              ? { data: null, error: { message: "no access" } }
              : { data: new Blob([objects.get(path)!]), error: null };
          },
          upload: async (path: string, bytes: Uint8Array, options: any) => {
            uploads.push(path);
            expect(options.upsert).toBe(false);
            if (settings.uploadError)
              return { error: { message: "private storage detail" } };
            if (objects.has(path)) return { error: { statusCode: 409 } };
            objects.set(path, bytes);
            return { error: null };
          },
          remove: async (paths: string[]) => {
            removes.push(...paths);
            return { error: null };
          },
        };
      },
    },
  };
  const fetchImpl: any = async (raw: string) => {
    requests.push(raw);
    const url = new URL(raw);
    const json = (value: any, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (url.hostname === "graph.facebook.com") {
      if (settings.apiError)
        return json(
          { error: { code: 190, message: "secret remote error" } },
          400,
        );
      if (url.pathname.endsWith("/ads"))
        return json({ data: settings.ads ?? [ad()] });
      if (url.pathname.endsWith("/thumbnails"))
        return json({
          data: settings.thumbnailPages ? settings.thumbnailPages[Number(url.searchParams.get('page') ?? 0)] : settings.thumbnails ?? [
            { uri: media("large.png"), width: 1080, height: 1920 },
          ],
          paging: settings.thumbnailCycle ? {next: 'https://graph.facebook.com/v26.0/video-1/thumbnails'}
            : settings.thumbnailPages && Number(url.searchParams.get('page') ?? 0) + 1 < settings.thumbnailPages.length
              ? {next:`https://graph.facebook.com/v26.0/video-1/thumbnails?page=${Number(url.searchParams.get('page') ?? 0)+1}`} : undefined,
        });
      if (url.pathname.endsWith("/adimages"))
        return json({ data: settings.images ?? [] });
      if (url.pathname.endsWith("/advideos")) return json({ data: [] });
      return json({ format: settings.format ?? [], picture: settings.picture });
    }
    const name = url.pathname.slice(1),
      override = settings.files?.[name];
    if (typeof override === "number")
      return new Response("secret expired", { status: override });
    const bytes = override ?? raster(name);
    return new Response(bytes, {
      headers: {
        "content-type": name.endsWith(".jpg") ? "image/jpeg" : "image/png",
      },
    });
  };
  const options: any = {
    supabase,
    clientId: 1,
    apiVersion: "v26.0",
    accessToken: "SYNTHETIC_SECRET",
    accountIds: ["acct-a"],
    startDate: "2026-10-01",
    endDate: "2026-10-27",
    adRows: [{ account_id: "acct-a", ad_id: "ad-1" }],
    dryRun: false,
    now: new Date("2026-10-28T12:00:00Z"),
    fetchImpl,
    previewAdIds: ["ad-1"],
  };
  return {
    rows,
    upgradeAudits,
    objects,
    uploads,
    removes,
    downloads,
    requests,
    writes,
    filters,
    options,
    run: () => enrichMetaCreativePreviews(options),
  };
}

describe("pinned approved official references", () => {
  it.skipIf(!process.env.META_APPROVED_SOURCE_PACKAGE)('validates the exact private package and live approved bytes without remote writes',async()=>{
    const packageFile=JSON.parse(readFileSync(process.env.META_APPROVED_SOURCE_PACKAGE!,'utf-8'));
    expect(packageFile.project_id).toBe('hlqrpreqvvxtkruwsolg');
    const config=packageFile.files.find((f:any)=>f.name.endsWith('/approved-preview-manifest.ts')).content;
    const pin=JSON.parse(config.match(/APPROVED_PREVIEW_MANIFEST = (\{.*\});/s)[1]);
    const entries=await loadApprovedSources(pin);
    expect(entries.length).toBe(7);
    for(const e of entries){
      // No provider URL or exception is retained in a test failure.
      let file;try{file=await downloadPreview(e.url,fetch);}catch{throw Error('APPROVED_REFERENCE_READ_FAILED_'+e.ad_id);}
      expect({sha256:file.sha256,width:file.width,height:file.height,mime:file.mime}).toEqual({sha256:e.sha256,width:e.width,height:e.height,mime:e.mime});
    }
  },60000);
  const setup=(kind='normal')=>{
    const current=row(kind==='downgrade'?'large.png':'small.png',{account_id:'4',entity_id:'1',ad_id:'1',creative_id:'2',
      creative_type:kind==='dynamic'?'dynamic':'video',preview_storage_path:'1/meta_ads/4/ad/1/old.png',
      metadata:{video_id:'3'}});
    const creative={...ad().creative,id:'2',video_id:'3',...(kind==='dynamic'?{asset_feed_spec:{videos:[{video_id:'3'},{video_id:'9'}]}}:{})};
    const h=harness({rows:[current],ads:[{id:'1',creative}],concurrent:kind==='cas'});
    h.options.accountIds=['4'];h.options.adRows=[{account_id:'4',ad_id:'1'}];h.options.previewAdIds=['1'];
    const snapshot={ad_id:'1',creative_id:'2',video_id:'3',asset_key:null,previous_sha256:current.preview_sha256,previous_path:current.preview_storage_path,previous_updated_at:current.updated_at};
    const approved={ad_id:'1',creative_id:'2',video_id:'3',sha256:hash(raster('hd.png'))};
    const entry={client_id:1,source:'meta_ads',account_id:'4',...approved,asset_key:'video:3',width:720,height:1280,mime:'image/png',url:media('hd.png'),
      previous:{creative_id:'2',video_id:'3',asset_key:null,sha256:current.preview_sha256,path:current.preview_storage_path,updated_at:current.updated_at,mime:'image/png',metadata:current.metadata}};
    const pin={path:'',sha256:'',ad_ids:['1'],data:''};
    const publish=()=>{pin.data=JSON.stringify({version:1,entries:[entry]});pin.sha256=hash(new TextEncoder().encode(pin.data));pin.path=`1/meta_ads/approved-sources/${pin.sha256}.json`;h.options.approvedManifestPin=pin;};
    h.options.reservationSelection={ad_ids:['1'],approved_assets:[approved],ads:[snapshot]};publish();
    const fetcher=h.options.fetchImpl;
    h.options.fetchImpl=async(raw:string)=>new URL(raw).pathname.endsWith('/thumbnails')?Response.json({error:{code:10}},{status:400}):fetcher(raw);
    return {...h,entry,pin,publish,snapshot,approved};
  };
  it('accepts only the approved reference with an incomplete collection, without writes in dry run',async()=>{
    const h=setup();h.options.dryRun=true;const result=await h.run();
    expect(result.failures).toEqual([]);expect(result.decisions?.[0]).toMatchObject({result:'improved',approval:{code:'preview_approved_reference_valid',source_mode:'approved_reference',collection_complete:false,measured_count:1}});
    expect(h.requests.filter(x=>!x.includes('graph.facebook.com'))).toEqual([media('hd.png')]);
    expect(h.uploads).toEqual([]);expect(h.writes).toEqual([]);
  });
  it.each(['hash','bytes','dimensions','mime','tiny','expired','identity','dynamic','snapshot','digest','unpackaged','client','account','asset'])('rejects approved source divergence: %s',async kind=>{
    const h=setup(kind==='dynamic'?'dynamic':'normal');
    if(kind==='hash')h.entry.sha256='a'.repeat(64);
    if(kind==='dimensions')h.entry.width=721;
    if(kind==='mime')h.entry.mime='image/jpeg';
    if(kind==='tiny'){h.entry.url=media('small.png');h.entry.sha256=h.approved.sha256=hash(raster('small.png'));}
    if(kind==='bytes')h.entry.url=media('large.png');
    if(kind==='identity')h.entry.video_id='9';
    if(kind==='snapshot')h.entry.previous.sha256='a'.repeat(64);
    if(kind==='client')h.entry.client_id=2;
    if(kind==='account')h.entry.account_id='9';
    if(kind==='asset')h.entry.asset_key='video:9';
    h.publish();
    if(kind==='digest')h.pin.data='{}';
    if(kind==='unpackaged')delete (h.pin as any).data;
    if(kind==='expired') {const f=h.options.fetchImpl;h.options.fetchImpl=(url:string)=>url===h.entry.url?new Response(null,{status:403}):f(url);}
    h.options.dryRun=true;const result=await h.run();expect(result.failed).toBe(1);expect(h.uploads).toEqual([]);expect(h.writes).toEqual([]);
  });
  it.each(['http://scontent.xx.fbcdn.net/a','https://127.0.0.1/a','https://[::1]/a','https://localhost/a','https://169.254.169.254/a','https://scontent.xx.fbcdn.net.evil.test/a','https://user@scontent.xx.fbcdn.net/a','https://scontent.xx.fbcdn.net:444/a'])('rejects unsafe manifest URL %s',async url=>{
    const h=setup();h.entry.url=url;h.publish();h.options.dryRun=true;expect((await h.run()).failed).toBe(1);expect(h.uploads).toEqual([]);
  });
  it('rejects an unsafe redirect and never logs signed references',async()=>{
    const h=setup();h.entry.url+='?signature=PRIVATE_REFERENCE';h.publish();const f=h.options.fetchImpl;
    h.options.fetchImpl=(url:string)=>url===h.entry.url?new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest'}}):f(url);
    h.options.dryRun=true;const r=await h.run();expect(r.failed).toBe(1);expect(JSON.stringify(r)).not.toContain('PRIVATE_REFERENCE');expect(h.uploads).toEqual([]);
  });
  it('preserves an existing Full HD file against an approved HD downgrade',async()=>{
    const h=setup('downgrade');h.options.dryRun=true;const r=await h.run();expect(r.failed).toBe(0);expect(r.decisions?.[0].result).toBe('preserved_not_better');expect(h.uploads).toEqual([]);
  });
  it('keeps immutable objects, CAS and rejects stale replay without another upload',async()=>{
    const h=setup();expect((await h.run()).failed).toBe(0);expect(h.uploads).toHaveLength(1);expect(h.objects.has(h.entry.previous.path)).toBe(true);
    expect(h.rows[0].metadata.preview_approved_manifest_sha256).toBe(h.pin.sha256);
    expect(h.filters).toContainEqual(['dashboard_creative_previews','updated_at',h.snapshot.previous_updated_at]);
    const again=await h.run();expect(again.failed).toBe(1);expect(h.uploads).toHaveLength(1);
    expect(again.failures[0].code).toBe('preview_reservation_snapshot_conflict');
  });
  it('does not overwrite a concurrent preview',async()=>{const h=setup('cas');const r=await h.run();expect(r.failures[0].code).toBe('preview_concurrent_update');expect(h.rows[0].metadata).toEqual({newer:true});});
  it('requires a backend pin and exact approval; browser reference fields have no effect',async()=>{
    const h=setup();delete h.options.reservationSelection;h.options.approved_reference=h.entry;h.options.dryRun=true;
    const r=await h.run();expect(r.decisions?.[0].result).toBe('pending_collection_incomplete');expect(h.downloads).not.toContain(h.pin.path);expect(h.uploads).toEqual([]);
  });
  const prepareRestore=async()=>{
    const h=setup();const prior=clone(h.snapshot);expect((await h.run()).failed).toBe(0);
    const current=h.rows[0],origin='12345678-1234-4234-8234-123456789abc';
    h.upgradeAudits.push({id:origin,client_id:1,source:'meta_ads',account_id:'4',operation:'previews',status:'success',
      preview_selection:{ads:[prior]},preview_results:{status:'success',results:[{ad_id:'1',outcome:'updated',path:current.preview_storage_path,sha256:current.preview_sha256}]}});
    h.options.reservationSelection={ad_ids:['1'],approved_assets:[{...h.approved,sha256:h.entry.previous.sha256}],ads:[{...prior,asset_key:current.metadata.preview_asset_key,previous_sha256:current.preview_sha256,previous_path:current.preview_storage_path,previous_updated_at:current.updated_at}]};
    h.options.now=new Date('2026-10-28T12:00:01Z');
    return {...h,origin};
  };
  it('restores the proven previous low-resolution object without an upload or commercial metadata rewind',async()=>{
    const h=await prepareRestore();h.rows[0].metadata.body='NEW COMMERCIAL TEXT';const count=h.uploads.length;
    const r=await h.run();expect(r.failures).toEqual([]);expect(r.decisions?.[0]).toMatchObject({result:'restored_previous',approval:{source_mode:'restore_previous',code:'preview_approved_restore_valid'}});
    expect(h.rows[0].preview_storage_path).toBe(h.entry.previous.path);expect(h.rows[0].preview_sha256).toBe(h.entry.previous.sha256);
    expect(h.rows[0].metadata).toMatchObject({body:'NEW COMMERCIAL TEXT',preview_width:160,preview_height:284,preview_asset_key:null,preview_restoration:{origin_run_id:h.origin}});
    expect(h.uploads.length).toBe(count);expect(h.removes).toEqual([]);expect(h.objects.size).toBe(2);
    expect((await h.run()).failures[0].code).toBe('preview_reservation_snapshot_conflict');
  });
  it.each(['missing-origin','foreign-origin','wrong-previous','corrupt-object','stale-snapshot'])('rejects unproven restore %s',async kind=>{
    const h=await prepareRestore();h.options.dryRun=true;
    if(kind==='missing-origin')h.upgradeAudits.length=0;
    if(kind==='foreign-origin')h.upgradeAudits[0].client_id=2;
    if(kind==='wrong-previous')h.upgradeAudits[0].preview_selection.ads[0].previous_path='other.png';
    if(kind==='corrupt-object')h.objects.set(h.entry.previous.path,raster('large.png'));
    if(kind==='stale-snapshot')h.options.reservationSelection.ads[0].previous_updated_at='2025-01-01T00:00:00Z';
    const r=await h.run();expect(r.failed).toBe(1);expect(h.uploads).toHaveLength(1);
  });
  it('can restore a confirmed updated ad from a terminal partial-failure batch',async()=>{
    const h=await prepareRestore();h.upgradeAudits[0].status='failed';h.upgradeAudits[0].preview_results.status='failed';
    h.upgradeAudits[0].preview_results.results.push({ad_id:'99',outcome:'failed_download'});
    expect((await h.run()).failures).toEqual([]);
  });
});

describe("complete file validation and bounded downloads", () => {
  it("requires an explicit bounded selection and never treats an empty list as all ads", () => {
    expect(validatePreviewAdIds(undefined)).toBeUndefined();
    expect(validatePreviewAdIds(["123", "123", "456"])).toEqual(["123", "456"]);
    for (const value of [null, [], ["all"], [1], Array(51).fill("1")])
      expect(() => validatePreviewAdIds(value)).toThrow();
  });
  for (const extension of ["png", "jpg", "webp", "gif", "-lossless.webp"])
    it(`inspects a complete ${extension} raster`, () => {
      const filename = extension.startsWith("-")
        ? `large${extension}`
        : `large.${extension}`;
      const mime = extension.includes("webp")
        ? "image/webp"
        : extension === "jpg"
          ? "image/jpeg"
          : `image/${extension}`;
      expect(inspectImage(raster(filename), mime)).toEqual({
        width: 1080,
        height: 1920,
      });
      expect(() => inspectImage(raster(filename).slice(0, 24), mime)).toThrow();
    });
  it("rejects untrusted URLs and redirects before downloading or forwarding credentials", async () => {
    let calls = 0;
    const fetchImpl: any = async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret" },
      });
    };
    await expect(
      downloadPreview("https://evil.example/file.png", fetchImpl),
    ).rejects.toMatchObject({ code: "preview_url_untrusted" });
    expect(calls).toBe(0);
    await expect(
      downloadPreview(media("tiny.png"), fetchImpl),
    ).rejects.toMatchObject({ code: "preview_url_untrusted" });
    expect(calls).toBe(1);
  });
  it("stops a streamed oversized body without Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PREVIEW_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      downloadPreview(
        media("large.png"),
        async () =>
          new Response(body, { headers: { "content-type": "image/png" } }),
      ),
    ).rejects.toMatchObject({ code: "preview_too_large" });
    expect(cancelled).toBe(true);
  });
  it("rejects a corrupt container and MIME mismatch", async () => {
    const broken = raster();
    broken[broken.length - 5] ^= 1;
    await expect(
      downloadPreview(
        media("broken.png"),
        async () =>
          new Response(broken, { headers: { "content-type": "image/png" } }),
      ),
    ).rejects.toMatchObject({ code: "preview_invalid_image" });
    expect(() => inspectImage(raster("large.jpg"), "image/png")).toThrow();
  });
  it("never equates a larger area with a better short edge or a different crop", () => {
    expect(
      improves({ width: 1080, height: 1920 }, { width: 64, height: 64 }),
    ).toBe(true);
    expect(
      improves({ width: 100, height: 5000 }, { width: 160, height: 284 }),
    ).toBe(false);
    expect(
      improves({ width: 1920, height: 1080 }, { width: 160, height: 284 }),
    ).toBe(false);
  });
});

describe("absolute HD policy and complete official collection", () => {
  it("selects the required approved HD hash even when another official image is Full HD",async()=>{
    const candidates=['large.png','hd.png'].map(name=>({url:media(name),source:'video.thumbnails',policy:'video_high_res_thumbnail',width:null,height:null,preferred:false}));
    const fetcher=async(input:any)=>new Response(raster(String(input).endsWith('hd.png')?'hd.png':'large.png'),{headers:{'content-type':'image/png'}});
    const result=await resolveCreativePreview(normalizeMetaCreative(ad()),candidates,fetcher,undefined,{videoId:'video-1',sha256:hash(raster('hd.png')),required:true});
    expect(result.selected?.file.sha256).toBe(hash(raster('hd.png')));
    expect(result.approval).toMatchObject({code:'preview_approved_hash_found_not_selected',general_selected_sha256:hash(raster('large.png')),matched_sha256:hash(raster('hd.png')),measured_count:3});
  });
  it.each(['missing','wrong-video','below-hd','download-failed','candidate-limit'])('fails closed with a specific approved-hash diagnostic: %s',async kind=>{
    const name=kind==='below-hd'?'small.png':'hd.png';
    const candidate={url:media(name)+'?token=DO_NOT_LOG',source:'video.thumbnails',policy:'video_high_res_thumbnail',width:null,height:null,preferred:false};
    const candidates=kind==='candidate-limit'?Array.from({length:321},(_,i)=>({...candidate,url:media(`${i}.png`)})):[candidate];
    const fetcher=async()=>kind==='download-failed'?new Response('expired',{status:403}):new Response(raster(name),{headers:{'content-type':'image/png'}});
    const result=await resolveCreativePreview(normalizeMetaCreative(ad()),candidates,fetcher,undefined,{videoId:kind==='wrong-video'?'other':'video-1',sha256:kind==='missing'?'a'.repeat(64):hash(raster(name)),required:true});
    expect(result.selected).toBeNull();
    expect(result.approval?.code).toBe(({missing:'preview_approved_hash_not_found','wrong-video':'preview_approved_identity_mismatch','below-hd':'preview_approved_file_invalid','download-failed':'preview_approved_download_unconfirmed','candidate-limit':'preview_approved_candidate_limit'})[kind]);
    expect(JSON.stringify(result.comparisons)).not.toContain('DO_NOT_LOG');
    expect(JSON.stringify(result.approval)).not.toContain('https:');
  });
  it('keeps looking for an exact approved official fallback after a Full HD thumbnail',async()=>{
    const creative=normalizeMetaCreative(ad({thumbnail_url:undefined}));
    const candidates=[{url:media('large.png'),source:'video.thumbnails',policy:'video_high_res_thumbnail',width:null,height:null,preferred:false},{url:media('hd.png'),source:'video.picture',policy:'video_thumbnail_fallback',width:null,height:null,preferred:false}];
    const result=await resolveCreativePreview(creative,candidates,async(input:any)=>new Response(raster(String(input).endsWith('hd.png')?'hd.png':'large.png'),{headers:{'content-type':'image/png'}}),undefined,{videoId:'video-1',sha256:hash(raster('hd.png')),required:true});
    expect(result.selected?.file.sha256).toBe(hash(raster('hd.png')));expect(result.inspected).toBe(2);
  });
  const approvedHarness=(settings:any={})=>{
    const h=harness(settings),r=h.rows[0];
    h.options.reservationSelection={ad_ids:['ad-1'],approved_assets:[{ad_id:'ad-1',creative_id:'creative-1',video_id:'video-1',sha256:hash(raster('hd.png'))}],ads:[{ad_id:'ad-1',creative_id:r.creative_id,video_id:r.metadata.video_id,asset_key:r.metadata.preview_asset_key??null,previous_sha256:r.preview_sha256,previous_path:r.preview_storage_path,previous_updated_at:r.updated_at}]};
    return h;
  };
  it('retains API/pagination failure diagnostics instead of reporting a definitive missing hash',async()=>{
    const h=approvedHarness({thumbnailCycle:true});h.options.dryRun=true;
    const stats=await h.run();expect(stats.failures[0].code).toBe('preview_approved_pagination_limit');
    expect(stats.decisions?.[0]).toMatchObject({approval:{collection_complete:false,measured_count:0},lookup_errors:expect.arrayContaining(['meta_thumbnail_page_cycle'])});
    expect(h.writes).toEqual([]);expect(h.uploads).toEqual([]);
  });
  it('retains a safe Meta error code without leaking API messages, tokens or URLs',async()=>{
    const h=approvedHarness(),fetcher=h.options.fetchImpl;h.options.dryRun=true;
    h.options.fetchImpl=async(input:any,init:any)=>new URL(String(input)).pathname.endsWith('/video-1/thumbnails')
      ?Response.json({error:{code:100,message:'DO_NOT_LOG token=SECRET https://private.example/signed'}},{status:400}):fetcher(input,init);
    const stats=await h.run();expect(stats.failures[0].code).toBe('preview_approved_collection_incomplete');
    expect(stats.decisions?.[0].lookup_errors).toEqual(expect.arrayContaining(['meta_100','meta_thumbnail_collection_incomplete']));
    expect(JSON.stringify(stats)).not.toContain('DO_NOT_LOG');expect(JSON.stringify(stats)).not.toContain('SECRET');
    expect(h.writes).toEqual([]);expect(h.uploads).toEqual([]);
  });
  it('does not downgrade an existing Full HD preview to the approved HD bytes',async()=>{
    const h=approvedHarness({rows:[row('large.png',{metadata:{video_id:'video-1',preview_width:1080,preview_height:1920}})],thumbnails:[{uri:media('large.png')},{uri:media('hd.png')}]});
    const stats=await h.run();expect(stats.failures).toEqual([]);expect(h.uploads).toEqual([]);
    expect(h.rows[0].preview_sha256).toBe(hash(raster('large.png')));
    expect(stats.decisions?.[0].approval).toMatchObject({code:'preview_approved_hash_found_not_selected'});
  });
  it("respects a reviewed hash for the same video only, without reducing resolution",async()=>{
    const reviewed=raster('large.png');
    const other=new Uint8Array(reviewed); // another valid image with equal pixel dimensions
    const candidates=[{url:media('large.jpg'),source:'video.thumbnails',policy:'video_high_res_thumbnail',width:1080,height:1920,preferred:false},{url:media('large.png'),source:'video.thumbnails',policy:'video_high_res_thumbnail',width:1080,height:1920,preferred:false}];
    const fetcher=async(input:any)=>new Response(String(input).endsWith('.jpg')?raster('large.jpg'):other,{headers:{'content-type':String(input).endsWith('.jpg')?'image/jpeg':'image/png'}});
    const creative=normalizeMetaCreative(ad());
    const result=await resolveCreativePreview(creative,candidates,fetcher,undefined,{videoId:'video-1',sha256:hash(reviewed)});
    expect(result.selected?.file.sha256).toBe(hash(reviewed));expect(result.visuallyReviewed).toBe(true);
    const exact=await resolveCreativePreview(creative,candidates,fetcher,undefined,{videoId:'video-1',sha256:hash(reviewed),required:true});
    expect(exact.approval?.code).toBe('preview_approved_hash_valid');
    const wrong=await resolveCreativePreview(creative,candidates,fetcher,undefined,{videoId:'other',sha256:hash(reviewed)});
    expect(wrong.selected?.file.sha256).toBe(hash(raster('large.jpg')));expect(wrong.visuallyReviewed).toBe(false);
    const h=harness({rows:[row('small.png',{metadata:{video_id:'video-1',preview_reviewed_thumbnail:{video_id:'video-1',sha256:hash(raster('hd.png'))}}})],thumbnails:[{uri:media('hd.png')},{uri:media('large.png')}]});
    await h.run();expect(h.rows[0].metadata.preview_width).toBe(1080);
  });
  it("does not pretend a truncated candidate set is a complete audit",async()=>{
    let downloads=0;
    const candidates=Array.from({length:321},(_,i)=>({url:media(`${i}.png`),source:'video.thumbnails',policy:'video_high_res_thumbnail',width:64,height:64,preferred:false}));
    const result=await resolveCreativePreview(normalizeMetaCreative(ad()),candidates,async()=>{downloads++;throw Error('must not download')});
    expect(downloads).toBe(0);expect(result.selected).toBeNull();expect(result.comparisons[0].result).toBe('candidate_limit');
  });
  it("shares a video's inspection only within one account and invocation",async()=>{
    const h=harness({rows:[row(),row('small.png',{entity_id:'ad-2',ad_id:'ad-2',preview_storage_path:'1/meta_ads/acct-a/ad/ad-2/old.png'})],ads:[ad(),{...ad(),id:'ad-2'}]});
    h.options.previewAdIds=['ad-1','ad-2'];h.options.adRows.push({account_id:'acct-a',ad_id:'ad-2'});
    await h.run();expect(h.requests.filter(u=>u===media('large.png'))).toHaveLength(1);
    expect(h.uploads).toHaveLength(2);
  });
  it.each([[160,284,"insufficient"],[720,1279,"insufficient"],[720,1280,"hd"],[1072,1928,"hd"],[1080,1920,"full_hd"]])("classifies decoded %s×%s",(width,height,result)=>{
    expect(videoPreviewQuality({width:Number(width),height:Number(height)})).toBe(result);
  });
  it("keeps the old file and records pending when the best file is only 160×284",async()=>{
    const h=harness({thumbnails:[{uri:media('small.png'),width:1080,height:1920}]});
    const old=clone(h.rows[0]);await h.run();
    expect(h.uploads).toEqual([]);expect(h.rows[0].preview_sha256).toBe(old.preview_sha256);
    expect(h.rows[0].metadata.preview_quality_status).toBe('pending_no_hd_source');
    expect(h.rows[0].metadata.preview_last_attempt.result).toBe('pending_no_hd_source');
  });
  it("uses HD when Full HD is unavailable",async()=>{
    const h=harness({thumbnails:[{uri:media('hd.png'),width:64,height:64}]});await h.run();
    expect(h.rows[0].metadata).toMatchObject({preview_width:720,preview_height:1280,preview_quality_status:'hd'});
  });
  it("checks a configured official cover when the collection has only HD",async()=>{
    const h=harness({ads:[ad({object_story_spec:{video_data:{video_id:'video-1',image_url:media('large.png')}}})],thumbnails:[{uri:media('hd.png')}]});
    await h.run();expect(h.rows[0].metadata).toMatchObject({preview_width:1080,preview_height:1920,preview_quality_status:'full_hd'});
  });
  it("measures the nonpreferred tenth candidate despite tiny declared dimensions",async()=>{
    const h=harness({thumbnails:[...Array.from({length:9},(_,i)=>({uri:media(`bad-${i}.png`),width:1080,height:1920,is_preferred:i===0})),{uri:media('daniela.png'),width:480,height:864,is_preferred:false}],files:Object.fromEntries(Array.from({length:9},(_,i)=>[`bad-${i}.png`,raster('small.png')]))});
    await h.run();expect(h.rows[0].metadata).toMatchObject({preview_width:1072,preview_height:1928,preferred_thumbnail:false,preview_quality_status:'hd'});
    expect(h.rows[0].metadata.preview_last_attempt.candidates.filter((c:any)=>c.source==='video.thumbnails')).toHaveLength(10);
  });
  it("continues to the next page after a valid HD thumbnail and chooses Full HD",async()=>{
    const h=harness({thumbnailPages:[[{uri:media('hd.png'),is_preferred:true}],[{uri:media('large.png'),is_preferred:false}]]});await h.run();
    expect(h.rows[0].metadata).toMatchObject({preview_width:1080,preview_height:1920,preferred_thumbnail:false});
    expect(h.requests.some(url=>url.includes('page=1'))).toBe(true);
  });
  it("preserves the current file after a pagination cycle instead of claiming complete coverage",async()=>{
    const h=harness({thumbnailCycle:true});await h.run();
    expect(h.uploads).toEqual([]);expect(h.rows[0].metadata.preview_quality_status).toBe('pending_collection_incomplete');
  });
  it("does not invoke frame processing when an official HD thumbnail exists",async()=>{
    let calls=0;const h=harness({thumbnails:[{uri:media('hd.png')}]});
    h.options.frameFallback=async()=>{calls++;return null};await h.run();expect(calls).toBe(0);
  });
  it("accepts an explicit native HD frame only after thumbnails fail the floor",async()=>{
    const h=harness({thumbnails:[{uri:media('small.png')}]});
    h.options.frameFallback=async()=>({videoId:'video-1',bytes:raster('hd.png'),mime:'image/png'});
    await h.run();expect(h.rows[0].metadata).toMatchObject({preview_width:720,preview_source:'video.local_frame'});
  });
  it.each(['wrong-id','too-small','failed'])("preserves the old preview after %s frame fallback",async(kind)=>{
    const h=harness({thumbnails:[]});
    h.options.frameFallback=async()=>{if(kind==='failed')throw new Error('private transport');return {videoId:kind==='wrong-id'?'other-video':'video-1',bytes:raster(kind==='too-small'?'small.png':'hd.png'),mime:'image/png'}};
    await h.run();expect(h.uploads).toEqual([]);expect(h.rows[0].preview_storage_path).toContain('old.png');
    expect(JSON.stringify(h.rows)).not.toContain('private transport');
  });
  it("measures the stored file even when its dimension metadata exists but is wrong",async()=>{
    const current=row('large.png');const h=harness({rows:[current],thumbnails:[{uri:media('hd.png')}]});await h.run();
    expect(h.downloads).toContain(current.preview_storage_path);expect(h.uploads).toEqual([]);
    expect(h.rows[0].metadata).toMatchObject({preview_width:1080,preview_height:1920});
  });
  it("does not accept a different crop based only on its HD pixels",()=>{
    expect(videoPreviewQuality({width:1080,height:1080},9/16)).toBe('insufficient');
  });
});

describe("enrichment integration with real raster bytes and controlled transports", () => {
  it.each(["tiny.png", "small.png"])(
    "upgrades %s to 1080×1920 and keeps old objects",
    async (name) => {
      const current = row(name, {
        metadata: {
          preview_width: name.startsWith("tiny") ? 64 : 160,
          preview_height: name.startsWith("tiny") ? 64 : 284,
          video_id: "video-1",
          custom: "keep",
        },
      });
      const h = harness({ rows: [current] });
      h.objects.set(current.preview_storage_path, raster(name));
      const stats = await h.run();
      expect(stats.failed).toBe(0);
      expect(h.rows[0].metadata).toMatchObject({
        preview_width: 1080,
        preview_height: 1920,
        custom: "keep",
        preview_strategy_version: PREVIEW_STRATEGY_VERSION,
        preview_source: "video.thumbnails",
      });
      expect(h.uploads).toHaveLength(1);
      expect(h.removes).toEqual([]);
      expect(h.objects.has(current.preview_storage_path)).toBe(true);
      expect(JSON.stringify(h.rows)).not.toMatch(
        /SYNTHETIC_SECRET|scontent\.xx/,
      );
    },
  );
  it("compares every fallback rather than stopping at a valid 64×64 image", async () => {
    const h = harness({
      rows: [],
      ads: [
        ad({
          object_story_spec: { video_data: { image_url: media("tiny.png") } },
          image_url: media("large.png"),
        }),
      ],
      thumbnails: [],
    });
    await h.run();
    expect(h.rows[0].metadata.preview_width).toBe(1080);
    expect(h.requests).toContain(media("tiny.png"));
    expect(h.requests).toContain(media("large.png"));
  });
  it("compares actual dimensions instead of trusting declared video-format sizes", async () => {
    const h = harness({
      format: [{ picture: media("tiny.png"), width: 8000, height: 8000 }],
      thumbnails: [{ uri: media("large.png"), width: 64, height: 64 }],
    });
    await h.run();
    expect(h.rows[0].metadata.preview_width).toBe(1080);
  });
  it("does not drop a bigger thumbnail just because another is preferred", async () => {
    const h = harness({
      thumbnails: [
        {
          uri: media("small.png"),
          width: 1920,
          height: 1080,
          is_preferred: true,
        },
        { uri: media("large.png"), width: 1080, height: 1920 },
      ],
    });
    await h.run();
    expect(h.rows[0].metadata.preview_width).toBe(1080);
  });
  it("measures an existing object when its metadata has no dimensions", async () => {
    const h = harness({
      rows: [
        row("small.png", { metadata: { video_id: "video-1", custom: "keep" } }),
      ],
    });
    await h.run();
    expect(h.downloads).toHaveLength(1);
    expect(h.rows[0].metadata.preview_width).toBe(1080);
  });
  it("does not classify an unmeasurable existing object as small", async () => {
    const current = row("small.png", { metadata: { custom: "keep" } }),
      h = harness({ rows: [current], downloadError: true });
    await h.run();
    expect(h.rows[0].preview_storage_path).toBe(current.preview_storage_path);
    expect(h.uploads).toEqual([]);
    expect(h.rows[0].metadata.preview_last_attempt.result).toBe(
      "existing_preview_unverified",
    );
  });
  it("preserves superior stored resolution, dimensions, source and private references", async () => {
    const current = row("large.png", {
        metadata: {
          preview_width: 1080,
          preview_height: 1920,
          preview_source: "original",
          video_id: "video-1",
          custom: "keep",
        },
      }),
      h = harness({
        rows: [current],
        thumbnails: [{ uri: media("small.png") }],
      });
    await h.run();
    expect(h.rows[0].preview_storage_path).toBe(current.preview_storage_path);
    expect(h.rows[0].metadata).toMatchObject(current.metadata);
    expect(h.uploads).toEqual([]);
    expect(h.rows[0].metadata.preview_last_attempt.result).toBe(
      "preserved_adequate",
    );
  });
  it.each(["api", "expired", "storage", "database", "no-candidate"])(
    "preserves old preview after %s failure",
    async (failure) => {
      const current = row();
      const h = harness({
        apiError: failure === "api",
        uploadError: failure === "storage",
        dbError: failure === "database",
        thumbnails: failure === "no-candidate" ? [] : undefined,
        ads:
          failure === "no-candidate"
            ? [
                ad({
                  thumbnail_url: undefined,
                  video_id: undefined,
                  object_type: undefined,
                }),
              ]
            : undefined,
        files:
          failure === "expired"
            ? { "large.png": 403, "tiny.png": 403 }
            : undefined,
      });
      await h.run();
      expect(h.rows[0].preview_storage_path).toBe(current.preview_storage_path);
      expect(h.rows[0].preview_sha256).toBe(current.preview_sha256);
      expect(h.rows[0].metadata.custom).toEqual({ keep: true });
      expect(h.removes).toEqual([]);
      expect(JSON.stringify(h.rows)).not.toMatch(
        /secret remote|private storage detail|private backend/,
      );
    },
  );
  it("does not overwrite a newer row after concurrent persistence", async () => {
    const h = harness({ concurrent: true });
    const stats = await h.run();
    expect(stats.failed).toBe(1);
    expect(h.rows[0].metadata).toEqual({ newer: true });
    expect(h.rows[0].preview_storage_path).toContain("old.png");
  });
  it("is idempotent for identical bytes and never reuploads the hash", async () => {
    const h = harness();
    await h.run();
    const path = h.rows[0].preview_storage_path;
    await h.run();
    expect(h.uploads).toHaveLength(1);
    expect(h.rows[0].preview_storage_path).toBe(path);
    expect(h.rows[0].metadata.preview_last_attempt.result).toBe(
      "unchanged_hash",
    );
  });
  it("recovers an immutable uploaded object after a database failure", async () => {
    const settings = { dbError: true };
    const h = harness(settings);
    await h.run();
    expect(h.rows[0].preview_storage_path).toContain("old.png");
    settings.dbError = false;
    const result = await h.run();
    expect(result.failed).toBe(0);
    expect(h.rows[0].metadata.preview_width).toBe(1080);
    expect(h.removes).toEqual([]);
    expect(h.rows[0].metadata.preview_previous.path).toContain("old.png");
  });
  it("finds explicitly selected historical previews without requiring recent metrics", async () => {
    const h = harness();
    h.options.adRows = [];
    const result = await h.run();
    expect(result.inspected).toBe(1);
    expect(h.rows[0].metadata.preview_width).toBe(1080);
    expect(h.filters.some(([table]) => table === "dashboard_ad_daily")).toBe(
      false,
    );
  });
  it("preserves metadata on reuse and avoids all media lookups", async () => {
    const current = row("large.png", {
      metadata: {
        preview_width: 1080,
        preview_height: 1920,
        preview_source: "original",
        preview_strategy_version: 3,
        custom: "keep",
        has_asset_feed_spec: true,
      },
    });
    const h = harness({ rows: [current] });
    delete h.options.previewAdIds;
    await h.run();
    expect(h.requests).toHaveLength(1);
    expect(h.rows[0].metadata).toMatchObject(current.metadata);
  });
  it("normal collection does not launch legacy file upgrades without explicit selection", async () => {
    const h = harness();
    delete h.options.previewAdIds;
    await h.run();
    expect(h.requests).toHaveLength(1);
    expect(h.uploads).toEqual([]);
    expect(h.rows[0].metadata.preview_width).toBe(160);
  });
  it("includes a dynamic video in selective refresh and keeps its type", async () => {
    const current = row("small.png", {
      creative_type: "dynamic",
      preview_kind: "dynamic_representative",
    });
    const h = harness({
      rows: [current],
      ads: [
        ad({
          asset_feed_spec: {
            videos: [{ video_id: "video-1", thumbnail_url: media("tiny.png") }],
          },
        }),
      ],
    });
    h.options.videoRefreshOnly = true;
    delete h.options.previewAdIds;
    await h.run();
    expect(h.rows[0].creative_type).toBe("dynamic");
    expect(h.rows[0].metadata).toMatchObject({
      preview_asset_key: "video:video-1",
      preview_media_type: "video",
      preview_width: 1080,
    });
  });
  it("does not substitute a larger image from another dynamic piece", async () => {
    const current = row("small.png", {
      creative_type: "dynamic",
      metadata: {
        preview_asset_key: "video:video-1",
        preview_media_type: "video",
        preview_width: 160,
        preview_height: 284,
      },
    });
    const h = harness({
      rows: [current],
      ads: [
        ad({
          asset_feed_spec: {
            images: [{ hash: "other-image", url: media("image.png") }],
            videos: [{ video_id: "video-1", thumbnail_url: media("tiny.png") }],
          },
        }),
      ],
    });
    await h.run();
    expect(h.rows[0].metadata.preview_asset_key).toBe("video:video-1");
    expect(h.requests).not.toContain(media("image.png"));
  });
  it("preserves ambiguous legacy mixed dynamics instead of guessing their identity", async () => {
    const current = row("small.png", { creative_type: "dynamic" }),
      h = harness({
        rows: [current],
        ads: [
          ad({
            asset_feed_spec: {
              images: [{ hash: "image-2", url: media("image.png") }],
              videos: [{ video_id: "video-1" }],
            },
          }),
        ],
      });
    await h.run();
    expect(h.rows[0].preview_storage_path).toBe(current.preview_storage_path);
    expect(h.uploads).toEqual([]);
    expect(h.rows[0].metadata.preview_last_attempt.result).toBe(
      "preserved_identity_uncertain",
    );
  });
  it("resolves image hashes to originals without searching unrelated assets", async () => {
    const h = harness({
      rows: [],
      ads: [
        ad({
          object_type: "SHARE",
          video_id: undefined,
          thumbnail_url: undefined,
          image_hash: "hash-1",
        }),
      ],
      images: [
        { hash: "hash-1", url: media("image.png") },
        { hash: "other", url: media("wide.png") },
      ],
    });
    await h.run();
    expect(h.rows[0].metadata).toMatchObject({
      preview_width: 1080,
      preview_height: 1350,
      preview_asset_key: "image:hash-1",
      preview_media_type: "image",
    });
    expect(h.requests).not.toContain(media("wide.png"));
  });
  it("never falls through to a second carousel card", () => {
    const normalized = normalizeMetaCreative(
      ad({
        object_type: "SHARE",
        video_id: undefined,
        object_story_spec: {
          link_data: {
            child_attachments: [
              { name: "first" },
              { image_url: media("large.png") },
            ],
          },
        },
      }),
    );
    expect(normalized.previewUrl).toBeNull();
    expect(normalized.metadata.representative_policy).toBe(
      "first_carousel_card",
    );
  });
  it("honors client/account selection for reads, writes, paths and dry run", async () => {
    const other = row("small.png", {
      client_id: 2,
      account_id: "acct-b",
      preview_storage_path: "2/meta_ads/acct-b/ad/ad-1/old.png",
    });
    const h = harness({ rows: [row(), other] });
    h.options.adRows.push({ account_id: "acct-b", ad_id: "ad-other" });
    h.options.dryRun = true;
    const stats = await h.run();
    expect(stats.would_update).toBe(1);
    expect(h.writes).toEqual([]);
    expect(h.uploads).toEqual([]);
    expect(h.rows[1]).toEqual(other);
    h.options.dryRun = false;
    await h.run();
    expect(h.rows[1]).toEqual(other);
    expect(h.filters).toContainEqual([
      "dashboard_creative_previews",
      "client_id",
      1,
    ]);
  });
  it("rejects an existing path outside the selected client/account/ad", async () => {
    const h = harness({
      rows: [
        row("small.png", {
          preview_storage_path: "2/meta_ads/acct-b/ad/ad-1/other.png",
        }),
      ],
    });
    const stats = await h.run();
    expect(stats.failed).toBe(1);
    expect(h.uploads).toEqual([]);
    expect(h.downloads).toEqual([]);
  });
});


describe("general official recovery outside the historical manifest",()=>{
  function selectedCase(adId="901") {
    const prior=row("tiny.png",{account_id:"4",entity_id:adId,ad_id:adId,creative_id:"902",preview_storage_path:`1/meta_ads/4/ad/${adId}/old.png`,metadata:{video_id:"903",preview_width:64,preview_height:64,preview_source:"creative.thumbnail_url"}});
    const h=harness({rows:[prior],ads:[{id:adId,creative:{id:"902",object_type:"VIDEO",video_id:"903",thumbnail_url:media("tiny.png")}}],format:[{filter:"native",width:1080,height:1920}]});
    Object.assign(h.options,{accountIds:["4"],adRows:[{account_id:"4",ad_id:adId}],previewAdIds:[adId]});
    const snapshot={ad_id:adId,creative_id:"902",video_id:"903",asset_key:null,previous_sha256:prior.preview_sha256,previous_path:prior.preview_storage_path,previous_updated_at:prior.updated_at};
    const approved={ad_id:adId,creative_id:"902",video_id:"903",sha256:hash(raster("large.png"))};
    h.options.reservationSelection={ad_ids:[adId],ads:[snapshot],approved_assets:[approved]};
    return {...h,snapshot,approved,prior};
  }
  it.each(["901","911"])("recovers approved official bytes for a new ad %s despite #10 on thumbnails",async(adId)=>{
    const h=selectedCase(adId),f=h.options.fetchImpl;
    h.options.fetchImpl=async(raw:string)=>{
      const u=new URL(raw);
      if(u.pathname.endsWith("/thumbnails"))return new Response(JSON.stringify({error:{code:10}}),{status:400});
      if(u.hostname==="graph.facebook.com"&&u.pathname.endsWith("/902"))return new Response(JSON.stringify({id:"902",account_id:"4",object_type:"VIDEO",video_id:"903",thumbnail_url:media("large.png")}));
      return f(raw);
    };
    const r=await h.run();expect(r.failures).toEqual([]);
    expect(h.rows[0].metadata).toMatchObject({preview_width:1080,preview_height:1920,preview_source:"creative.requested_thumbnail",preview_quality_status:"full_hd"});
    expect(r.decisions?.[0]).toMatchObject({approval:{source_mode:"official_creative",collection_complete:false}});
    expect(h.rows[0].metadata.preview_last_attempt.lookup_errors).toContain("meta_10");
    expect(h.objects.has(h.prior.preview_storage_path)).toBe(true);
    expect(h.removes).toEqual([]);
  });
  async function preparedUnpinnedRestore() {
    const h=selectedCase();expect((await h.run()).failures).toEqual([]);
    const current=h.rows[0],origin="12345678-1234-4234-8234-123456789abc";
    h.upgradeAudits.push({id:origin,client_id:1,source:"meta_ads",account_id:"4",operation:"previews",status:"success",preview_selection:{ads:[h.snapshot]},preview_results:{status:"success",results:[{ad_id:"901",outcome:"updated",path:current.preview_storage_path,sha256:current.preview_sha256}]}});
    h.options.reservationSelection={ad_ids:["901"],approved_assets:[{...h.approved,sha256:h.prior.preview_sha256}],ads:[{...h.snapshot,asset_key:current.metadata.preview_asset_key,previous_path:current.preview_storage_path,previous_sha256:current.preview_sha256,previous_updated_at:current.updated_at}]};
    h.options.now=new Date("2026-10-28T12:00:01Z");
    return h;
  }
  it("also tries the official creative when a complete thumbnail list only contains small files",async()=>{
    const h=selectedCase(),f=h.options.fetchImpl;
    h.options.fetchImpl=async(raw:string)=>{
      const u=new URL(raw);
      if(u.pathname.endsWith("/thumbnails"))return Response.json({data:[{id:"904",uri:media("tiny.png"),width:1080,height:1920,is_preferred:true}]});
      if(u.hostname==="graph.facebook.com"&&u.pathname.endsWith("/902"))return Response.json({id:"902",account_id:"4",video_id:"903",thumbnail_url:media("large.png")});
      return f(raw);
    };
    expect((await h.run()).failures).toEqual([]);
    expect(h.rows[0].metadata).toMatchObject({preview_width:1080,preview_height:1920,preview_source:"creative.requested_thumbnail"});
    expect(h.requests.filter(url=>url===media("tiny.png"))).toHaveLength(1);
  });
  it.each(["no-receipt","foreign-origin","different-ad","corrupt-old","stale-snapshot","unapproved-video"])("rejects an unproven unpinned restore: %s",async(kind)=>{
    const h=await preparedUnpinnedRestore(),before=clone(h.rows[0]);
    if(kind==="no-receipt")h.upgradeAudits.length=0;
    if(kind==="foreign-origin")h.upgradeAudits[0].client_id=2;
    if(kind==="different-ad")h.upgradeAudits[0].preview_selection.ads[0].ad_id="999";
    if(kind==="corrupt-old")h.objects.set(h.prior.preview_storage_path,raster("large.png"));
    if(kind==="stale-snapshot")h.options.reservationSelection.ads[0].previous_updated_at="2000-01-01T00:00:00Z";
    if(kind==="unapproved-video")h.options.reservationSelection.approved_assets[0].video_id="999";
    const r=await h.run();expect(r.failed).toBe(1);expect(h.rows[0]).toMatchObject({creative_id:before.creative_id,preview_sha256:before.preview_sha256,preview_storage_path:before.preview_storage_path,preview_mime_type:before.preview_mime_type});expect(h.rows[0].metadata.preview_previous).toEqual(before.metadata.preview_previous);expect(h.uploads).toHaveLength(1);expect(h.removes).toEqual([]);
  });
  it("restores an unpinned ad from its exact terminal receipt and immutable previous object",async()=>{
    const h=selectedCase();expect((await h.run()).failures).toEqual([]);
    const upgraded=clone(h.rows[0]),origin="12345678-1234-4234-8234-123456789abc";
    h.upgradeAudits.push({id:origin,client_id:1,source:"meta_ads",account_id:"4",operation:"previews",status:"success",preview_selection:{ads:[h.snapshot]},preview_results:{status:"success",results:[{ad_id:"901",outcome:"updated",path:upgraded.preview_storage_path,sha256:upgraded.preview_sha256}]}});
    h.rows[0].metadata.body="KEEP NEW COMMERCIAL TEXT";
    h.options.reservationSelection={ad_ids:["901"],approved_assets:[{...h.approved,sha256:h.prior.preview_sha256}],ads:[{...h.snapshot,asset_key:upgraded.metadata.preview_asset_key,previous_path:upgraded.preview_storage_path,previous_sha256:upgraded.preview_sha256,previous_updated_at:upgraded.updated_at}]};
    h.options.now=new Date("2026-10-28T12:00:01Z");
    const r=await h.run();expect(r.failures).toEqual([]);
    expect(h.rows[0].preview_sha256).toBe(h.prior.preview_sha256);
    expect(h.rows[0].preview_storage_path).toBe(h.prior.preview_storage_path);
    expect(h.rows[0].metadata).toMatchObject({body:"KEEP NEW COMMERCIAL TEXT",preview_width:64,preview_height:64,preview_restoration:{origin_run_id:origin}});
    expect(h.rows[0].metadata.preview_approved_manifest_sha256).toBeUndefined();
    expect(h.uploads).toHaveLength(1);expect(h.removes).toEqual([]);expect(h.objects.size).toBe(2);
  });
  it.each(["wrong-account","no-native-proof","wrong-hash","tiny-source","cas"])("preserves old media when new source is rejected: %s",async(kind)=>{
    const h=selectedCase(),f=h.options.fetchImpl;
    if(kind==="wrong-hash")h.options.reservationSelection.approved_assets[0].sha256="a".repeat(64);
    h.options.fetchImpl=async(raw:string)=>{
      const u=new URL(raw);
      if(u.pathname.endsWith("/thumbnails"))return new Response(JSON.stringify({error:{code:10}}),{status:400});
      if(kind==="no-native-proof"&&u.pathname.endsWith("/903"))return new Response(JSON.stringify({error:{code:10}}),{status:400});
      if(u.hostname==="graph.facebook.com"&&u.pathname.endsWith("/902"))return new Response(JSON.stringify({id:"902",account_id:kind==="wrong-account"?"other":"4",video_id:"903",thumbnail_url:media(kind==="tiny-source"?"tiny.png":"large.png")}));
      return f(raw);
    };
    if(kind==="cas")h.options.reservationSelection.ads[0].previous_updated_at="2020-01-01T00:00:00Z";
    const r=await h.run();expect(r.failed).toBe(1);expect(h.rows[0].preview_sha256).toBe(h.prior.preview_sha256);expect(h.uploads).toEqual([]);
  });
});
