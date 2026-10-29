import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPreviewProvider,ORIGIN} from './preview-provider.ts';
const fixtures=Object.fromEntries(['tiny.png','hd.png','large.png'].map(n=>[n,readFileSync(new URL('../fixtures/meta-previews/'+n,import.meta.url)).toString('base64')]));
it('passes actual Supabase requests through without changing method or consuming body',async()=>{
 const native=vi.fn();const provider=createPreviewProvider(native,{scenario:'partial',generation:1},()=>{},fixtures);
 for(const path of ['/rest/v1/dashboard_clients?select=id','/rest/v1/rpc/begin_dashboard_preview_collection','/rest/v1/manual_sync_homolog_receipts']){
  const r=new Request(ORIGIN+path,{method:'POST',body:'{"test":true}'});
  expect(await provider(r)).toBeUndefined();expect(r.bodyUsed).toBe(false);expect(await r.json()).toEqual({test:true});
 }
 expect(native).not.toHaveBeenCalled();
});
it('serves complete encoded controlled rasters and paginates non-preferred Full HD',async()=>{
 const started=vi.fn();const provider=createPreviewProvider(vi.fn(),{scenario:'success',generation:1},started,fixtures);
 const first=await (await provider(new Request('https://graph.facebook.com/v25.0/700301/thumbnails')))!.json();
 const second=await (await provider(new Request(first.paging.next)))!.json();
 expect(second.data[0].is_preferred).toBe(false);
 const raster=await provider(new Request(second.data[0].uri));
 expect(new Uint8Array(await raster!.arrayBuffer())).toEqual(new Uint8Array(readFileSync(new URL('../fixtures/meta-previews/large.png',import.meta.url))));
 expect(started).toHaveBeenCalledTimes(2);
});
