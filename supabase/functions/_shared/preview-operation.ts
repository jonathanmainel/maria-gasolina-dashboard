export const AD_ID = /^\d{1,30}$/;
export const SHA256 = /^[a-f0-9]{64}$/;
export type ApprovedAsset = {ad_id:string;creative_id:string;video_id?:string;sha256:string};
export type PreviewSnapshot = {ad_id:string;creative_id:string;video_id:string|null;asset_key:string|null;previous_sha256:string|null;previous_path:string|null;previous_updated_at:string};
export type PreviewSelection = {ad_ids:string[];approved_assets:ApprovedAsset[];ads:PreviewSnapshot[]};
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
export function previewIds(value:unknown):value is string[] {
 return Array.isArray(value) && value.length>=1 && value.length<=50 && value.every(v=>typeof v==='string'&&AD_ID.test(v)) && new Set(value).size===value.length;
}
export function approvedAssets(value:unknown,ids:string[]):value is ApprovedAsset[] {
 return Array.isArray(value) && value.length<=ids.length && new Set(value.map(v=>v?.ad_id)).size===value.length && value.every(v=>object(v)
  && Object.keys(v).every(k=>['ad_id','creative_id','video_id','sha256'].includes(k))
  && typeof v.ad_id==='string'&&ids.includes(v.ad_id)&&typeof v.creative_id==='string'&&AD_ID.test(v.creative_id)
  && typeof v.sha256==='string'&&SHA256.test(v.sha256) && (v.video_id===undefined||typeof v.video_id==='string'&&AD_ID.test(v.video_id)));
}
export function previewSelection(value:unknown):value is PreviewSelection {
 if(!object(value)||Object.keys(value).some(k=>!['ad_ids','ads','approved_assets'].includes(k))||!previewIds(value.ad_ids)
  ||!approvedAssets(value.approved_assets,value.ad_ids)||!Array.isArray(value.ads)||value.ads.length!==value.ad_ids.length) return false;
 return new Set(value.ads.map(v=>v?.ad_id)).size===value.ad_ids.length && value.ads.every(v=>object(v)
  && Object.keys(v).every(k=>['ad_id','creative_id','video_id','asset_key','previous_sha256','previous_path','previous_updated_at'].includes(k))
  && (value.ad_ids as string[]).includes(String(v.ad_id))&&typeof v.creative_id==='string'&&AD_ID.test(v.creative_id)
  && (v.video_id===null||typeof v.video_id==='string'&&AD_ID.test(v.video_id))
  && (v.asset_key===null||typeof v.asset_key==='string')&&(v.previous_sha256===null||typeof v.previous_sha256==='string'&&SHA256.test(v.previous_sha256))
  && (v.previous_path===null||typeof v.previous_path==='string')&&typeof v.previous_updated_at==='string');
}
export type PreviewOutcome = 'updated'|'preserved_adequate'|'preserved_inadequate'|'failed_download'|'failed_storage'|'failed_database'|'cas_conflict';
export type PreviewReceipt = {ad_id:string;outcome:PreviewOutcome;path:string|null;sha256:string|null;mime:string|null;width:number|null;height:number|null};
