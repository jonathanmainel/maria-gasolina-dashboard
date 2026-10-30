import {describe,it,expect,vi} from 'vitest';
import {parseManualRequest,authorizeCollection} from './sync-control.ts';
import {handleManualSync} from '../request-dashboard-sync/handler.ts';
import {runReservedSync} from '../sync-dashboard-daily/runner.ts';
const id='10000000-0000-4000-8000-000000000001';
const sha='a'.repeat(64);
const selection={ad_ids:['123'],approved_assets:[],ads:[{ad_id:'123',creative_id:'456',video_id:'789',asset_key:'video:789',previous_sha256:sha,previous_path:'old.png',previous_updated_at:'2026-10-28T00:00:00Z'}]};
const request={action:'request',operation:'previews',client_slug:'maria-gasolina',sources:['meta_ads'],request_key:id,preview_ad_ids:['123']};
const body={operation:'previews',automation_run_id:id,preview_ad_ids:['123'],preview_selection:selection,preview_account_id:'111',selection_fingerprint:sha};
describe('preview operation boundary',()=>{
 it('accepts only explicit Meta requests, canonicalizes IDs, and retains default metrics contract',()=>{
  expect(parseManualRequest(request)).toMatchObject({operation:'previews',previewAdIds:['123']});
  const {operation,preview_ad_ids,...metric}=request;
  expect(parseManualRequest(metric)).not.toHaveProperty('operation');
 });
 const invalid=[{sources:['ga4']},{sources:['meta_ads','google_ads']},{preview_ad_ids:[]},{preview_ad_ids:['123','123']},{preview_ad_ids:['x']},{preview_ad_ids:Array.from({length:51},(_,i)=>String(i+1))},{operation:'metrics'},{operation:undefined},{client_id:2},{account_id:'222'},{role:'admin'},{preview_assets:[{ad_id:'123',creative_id:'456',sha256:sha,url:'https://evil.invalid'}]},{preview_assets:[{ad_id:'999',creative_id:'456',sha256:sha}]}];
 it.each(invalid)('rejects malformed or untrusted input %j',patch=>expect(parseManualRequest({...request,...patch})).toBeNull());
 it('uses verified Auth identity for the same authenticated entry point',async()=>{
  const rpc=vi.fn(async()=>({data:{ok:true},error:null}));
  const response=await handleManualSync(new Request('https://local',{method:'POST',headers:{authorization:'Bearer session'},body:JSON.stringify(request)}),{getUser:async()=>({id:'real-user'}),rpc});
  expect(response.status).toBe(202);expect(rpc).toHaveBeenCalledWith('request_dashboard_preview_sync',{p_client_slug:'maria-gasolina',p_user_id:'real-user',p_request_key:id,p_ad_ids:['123'],p_assets:[]});
 });
 it.each([null,{id:'viewer'}])('rejects missing session or current membership denial',async user=>{
  const rpc=vi.fn(async()=>({data:null,error:{code:'42501'}}));
  const response=await handleManualSync(new Request('https://local',{method:'POST',headers:{authorization:'Bearer session'},body:JSON.stringify(request)}),{getUser:async()=>user,rpc});
  expect(response.status).toBe(user?403:401);
 });
 it('claims exact purpose, account, selection and fingerprint once',async()=>{
  const rpc=vi.fn(async()=>({data:true,error:null}));
  expect(await authorizeCollection({rpc},body,1,'meta_ads','2026-10-21','2026-10-28')).toBeNull();
  expect(rpc).toHaveBeenCalledWith('begin_dashboard_preview_collection',expect.objectContaining({p_run_id:id,p_selection:selection,p_fingerprint:sha,p_account_id:'111'}));
  rpc.mockResolvedValue({data:false,error:null});
  expect((await authorizeCollection({rpc},body,1,'meta_ads','2026-10-21','2026-10-28'))?.status).toBe(409);
 });
 it.each([{operation:'metrics'},{preview_ad_ids:['999']},{preview_selection:{...selection,ads:[]}},{selection_fingerprint:'x'},{video_picture_overrides:{789:'https://scontent.xx.fbcdn.net/x'}}])('rejects changed purpose or selection %j',async patch=>{
  const rpc=vi.fn();expect((await authorizeCollection({rpc},{...body,...patch},1,'meta_ads','2026-10-21','2026-10-28'))?.status).toBe(409);expect(rpc).not.toHaveBeenCalled();
 });
 it('prevents a preview reservation reaching another collector',async()=>{
  const rpc=vi.fn();expect((await authorizeCollection({rpc},body,1,'ga4','2026-10-21','2026-10-28'))?.status).toBe(409);expect(rpc).not.toHaveBeenCalled();
 });
});
describe('preview coordinator terminal confirmation',()=>{
 const run={id,source:'meta_ads',client_id:1,client_slug:'maria-gasolina',operation:'previews',account_id:'111',preview_selection:selection,selection_fingerprint:sha,range_start:'2026-10-21',range_end:'2026-10-28'};
 const receipts=[{ad_id:'123',outcome:'updated',path:'new.png',sha256:'b'.repeat(64),mime:'image/png',width:1080,height:1920}];
 it.each(['success','failed',null])('uses database proof instead of HTTP 200: %s',async result=>{
  const rpc=vi.fn(async(name:string)=>({error:null,data:name==='start_dashboard_sync_run'?run:name==='verify_dashboard_preview_results'?(result?{status:result,counts:{updated:result==='success'?1:0,failed:result==='failed'?1:0,preserved:0}}:null):null}));
  const transport=vi.fn(async(_url,init)=>{
   expect(JSON.parse(String(init?.body))).toMatchObject({operation:'previews',preview_selection:selection,preview_ad_ids:['123'],preview_account_id:'111',selection_fingerprint:sha,dry_run:false});
   return Response.json({ok:true,preview_results:receipts,counts:{daily:999},database_write_status:'success'});
  }) as typeof fetch;
  const done=await runReservedSync(id,{rpc},'https://local',{},transport);
  expect(done.state).toBe(result??'indeterminate');
  expect(rpc).toHaveBeenCalledWith('verify_dashboard_preview_results',{p_run_id:id,p_results:receipts});
  expect(rpc).toHaveBeenLastCalledWith('finish_dashboard_sync_run',expect.objectContaining({p_write_status:null,p_status:result??'indeterminate'}));
  expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('daily');
 });
 it('keeps exclusion on timeout without claiming success',async()=>{
  const rpc=vi.fn(async(name:string)=>({data:name==='start_dashboard_sync_run'?run:null,error:null}));
  const done=await runReservedSync(id,{rpc},'https://local',{},async()=>{throw new Error('timeout');});
  expect(done.state).toBe('indeterminate');expect(rpc).not.toHaveBeenCalledWith('verify_dashboard_preview_results',expect.anything());
 });
});
