import {it,expect} from 'vitest';
import {previewReceipts} from './preview-receipts.ts';
const selection={ad_ids:['123'],approved_assets:[],ads:[]};
async function receipt(result:string,failure?:string,candidates:any[]=[]){
 const query:any={select:()=>query,eq:()=>query,in:async()=>({data:[{entity_id:'123',preview_storage_path:'old.png',preview_sha256:'a'.repeat(64),preview_mime_type:'image/png',metadata:{preview_width:160,preview_height:284}}],error:null})};
 return (await previewReceipts({from:()=>query},1,'111',selection,{decisions:[{ad_id:'123',result,candidates}],failures:failure?[{ad_id:'123',code:failure}]:[]} as any))[0].outcome;
}
it('distinguishes an insufficient candidate from download/validation failure while preserving bytes',async()=>{
 expect(await receipt('pending_no_hd_source','preview_hd_pending',[{result:'below_hd_or_ratio_mismatch'}])).toBe('preserved_inadequate');
 expect(await receipt('pending_no_hd_source','preview_hd_pending',[{result:'below_hd_or_ratio_mismatch'},{result:'preview_http_403'}])).toBe('failed_download');
});
it.each([['storage_upload','failed_storage'],['database_upsert','failed_database'],['preview_concurrent_update','cas_conflict'],['preview_reservation_snapshot_conflict','cas_conflict']])('retains terminal failure identity %s',async(code,outcome)=>expect(await receipt('preserved_error',code)).toBe(outcome));
it('only describes an update after a persisted row has been read',async()=>{
 expect(await receipt('improved')).toBe('updated');
 const q:any={select:()=>q,eq:()=>q,in:async()=>({data:[],error:null})};
 await expect(previewReceipts({from:()=>q},1,'111',selection,{failures:[]} as any)).rejects.toThrow('PREVIEW_RECEIPT_READ_FAILED');
});
