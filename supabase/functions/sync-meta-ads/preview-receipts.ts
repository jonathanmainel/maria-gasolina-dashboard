import type {PreviewSelection,PreviewReceipt,PreviewOutcome} from '../_shared/preview-operation.ts';
import type {CreativeEnrichmentStats} from './meta-creative.ts';
import {videoPreviewQuality} from './preview-media.ts';

/** Read back persisted rows; candidate/download success is never a persistence receipt. */
export async function previewReceipts(admin:any,clientId:number,accountId:string,selection:PreviewSelection,stats:CreativeEnrichmentStats):Promise<PreviewReceipt[]> {
 const {data,error}=await admin.from('dashboard_creative_previews').select('entity_id,preview_storage_path,preview_sha256,preview_mime_type,metadata')
  .eq('client_id',clientId).eq('source','meta_ads').eq('account_id',accountId).eq('entity_type','ad').in('entity_id',selection.ad_ids);
 if(error||!data||data.length!==selection.ad_ids.length)throw new Error('PREVIEW_RECEIPT_READ_FAILED');
 return selection.ad_ids.map(adId=>{
  const row=data.find((r:any)=>r.entity_id===adId);if(!row)throw new Error('PREVIEW_RECEIPT_MISSING');
  const decision=stats.decisions?.find(d=>d.ad_id===adId);
  const failure=stats.failures.find(f=>f.ad_id===adId);
  const width=Number(row.metadata?.preview_width)||null,height=Number(row.metadata?.preview_height)||null;
  let outcome:PreviewOutcome='failed_download';
  const inadequate=decision?.result==='pending_no_hd_source'&&Array.isArray(decision.candidates)
    &&decision.candidates.length>0&&decision.candidates.every((c:any)=>c.result==='below_hd_or_ratio_mismatch');
  if(inadequate&&(!failure||failure.code==='preview_hd_pending'))outcome='preserved_inadequate';
  else if(failure){outcome=failure.code==='preview_concurrent_update'||failure.code==='preview_reservation_snapshot_conflict'?'cas_conflict'
    :failure.code==='storage_upload'?'failed_storage':failure.code==='database_upsert'?'failed_database':'failed_download';}
  else if(decision){
   if(['improved','created'].includes(String(decision.result)))outcome='updated';
   else if(decision.result==='existing_preview_unverified')outcome='failed_storage';
   else if(['reused','unchanged_hash','preserved_not_better','preserved_adequate'].includes(String(decision.result)))
    outcome=videoPreviewQuality({width:width??0,height:height??0})!=='insufficient'?'preserved_adequate':'preserved_inadequate';
   else if(decision.result==='pending_no_hd_source'&&Array.isArray(decision.candidates)
    &&decision.candidates.length>0&&decision.candidates.every((c:any)=>c.result==='below_hd_or_ratio_mismatch'))outcome='preserved_inadequate';
  }
  return {ad_id:adId,outcome,path:row.preview_storage_path,sha256:row.preview_sha256,mime:row.preview_mime_type,width,height};
 });
}
