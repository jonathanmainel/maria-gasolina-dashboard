import { PreviewError, trustedMediaUrl, videoPreviewQuality } from "./preview-media.ts";
import { APPROVED_PREVIEW_MANIFEST } from "./approved-preview-manifest.ts";
import type { ApprovedAsset, PreviewSnapshot } from "../_shared/preview-operation.ts";

export type ManifestPin = {path:string;sha256:string;ad_ids:string[];data?:string};
export type ApprovedSource = {
  client_id:number; source:"meta_ads"; account_id:string; ad_id:string;
  creative_id:string; video_id:string; asset_key:string; sha256:string;
  width:number; height:number; mime:string; url:string;
  previous:{creative_id:string;video_id:string;asset_key:string|null;sha256:string;
    path:string;updated_at:string;mime:string;metadata:Record<string,unknown>};
};
export const defaultManifestPin: ManifestPin = APPROVED_PREVIEW_MANIFEST;
export type BoundApprovedSource = ApprovedSource & {intent:'upgrade'|'restore_previous'};
const sha = /^[a-f0-9]{64}$/;
const id = /^\d{1,30}$/;
const object = (x:any) => x && typeof x === "object" && !Array.isArray(x);
function fail(code:string):never {throw new PreviewError(code);}

/** The pin is backend configuration, never a request field. No global cache. */
export async function loadApprovedSources(pin:ManifestPin):Promise<ApprovedSource[]> {
  if (!sha.test(pin.sha256) || !pin.path.endsWith(`/${pin.sha256}.json`) ||
      !/^\d+\/meta_ads\/approved-sources\/[a-f0-9]{64}\.json$/.test(pin.path) ||
      !pin.ad_ids.length || pin.ad_ids.length>10 || new Set(pin.ad_ids).size!==pin.ad_ids.length)
    fail("preview_manifest_pin_invalid");
  if(typeof pin.data!=="string"||pin.data.length>131072) fail("preview_manifest_unavailable");
  const bytes=new TextEncoder().encode(pin.data);
  if(bytes.length>131072) fail("preview_manifest_unavailable");
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(digest!==pin.sha256) fail("preview_manifest_digest_mismatch");
  let value:any;try{value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{return fail("preview_manifest_invalid");}
  if(!object(value)||value.version!==1||!Array.isArray(value.entries)||value.entries.length!==pin.ad_ids.length) fail("preview_manifest_invalid");
  const seen=new Set<string>();
  for(const e of value.entries) {
    if(!object(e)||!Number.isSafeInteger(e.client_id)||e.client_id<1||e.source!=="meta_ads"||
      ![e.account_id,e.ad_id,e.creative_id,e.video_id].every(x=>typeof x==="string"&&id.test(x))||
      e.client_id!==Number(pin.path.split('/')[0])||!pin.ad_ids.includes(e.ad_id)||seen.has(e.ad_id)||e.asset_key!==`video:${e.video_id}`||!sha.test(e.sha256)||
      !Number.isSafeInteger(e.width)||!Number.isSafeInteger(e.height)||e.width*e.height>40000000||
      videoPreviewQuality({width:e.width,height:e.height},9/16)==="insufficient"||
      !["image/jpeg","image/png","image/webp","image/gif"].includes(e.mime)||typeof e.url!=="string"||
      !object(e.previous)||e.previous.creative_id!==e.creative_id||e.previous.video_id!==e.video_id||
      !(e.previous.asset_key===null||e.previous.asset_key===e.asset_key)||!sha.test(e.previous.sha256)||
      typeof e.previous.path!=="string"||!e.previous.path.startsWith(`${e.client_id}/meta_ads/${e.account_id}/ad/${e.ad_id}/`)||
      e.previous.path.includes("..")||typeof e.previous.updated_at!=="string"||!Number.isFinite(Date.parse(e.previous.updated_at))||
      !["image/jpeg","image/png","image/webp","image/gif"].includes(e.previous.mime)||!object(e.previous.metadata)) fail("preview_manifest_invalid");
    trustedMediaUrl(e.url);
    seen.add(e.ad_id);
  }
  return value.entries;
}

/** A digest-valid source is still unusable without the exact immutable reservation. */
export function bindApprovedSource(entries:ApprovedSource[], clientId:number,accountId:string,
  approved:ApprovedAsset,snapshot:PreviewSnapshot,creative:{creativeId:string|null;videoId:string|null;assetKey?:string|null;representationCertain?:boolean},upgradePath?:string):BoundApprovedSource {
  const e=entries.find(x=>x.ad_id===approved.ad_id);
  if(!e||e.client_id!==clientId||e.account_id!==accountId||e.creative_id!==approved.creative_id||
    e.video_id!==approved.video_id||snapshot.ad_id!==e.ad_id||snapshot.creative_id!==e.creative_id||snapshot.video_id!==e.video_id)
      fail("preview_manifest_reservation_mismatch");
  if(creative.representationCertain!==true||creative.creativeId!==e.creative_id||creative.videoId!==e.video_id||creative.assetKey!==e.asset_key)
    fail("preview_approved_identity_mismatch");
  const restore=approved.sha256===e.previous.sha256&&e.previous.sha256!==e.sha256;
  if(restore){
    if(!upgradePath||snapshot.previous_path!==upgradePath||snapshot.previous_sha256!==e.sha256||snapshot.asset_key!==e.asset_key||
      !(Date.parse(snapshot.previous_updated_at)>Date.parse(e.previous.updated_at))) fail('preview_manifest_reservation_mismatch');
  } else if(e.sha256!==approved.sha256||snapshot.asset_key!==e.previous.asset_key||snapshot.previous_sha256!==e.previous.sha256||
      snapshot.previous_path!==e.previous.path||Date.parse(snapshot.previous_updated_at)!==Date.parse(e.previous.updated_at)) fail('preview_manifest_reservation_mismatch');
  return {...e,intent:restore?'restore_previous':'upgrade'};
}

/** Restore only an earlier version whose replacement was terminally confirmed. */
export async function confirmedUpgradeForRestore(admin:any,source:ApprovedSource,snapshot:PreviewSnapshot):Promise<string> {
  const {data,error}=await admin.from('dashboard_automation_runs')
    .select('id,status,preview_selection,preview_results').eq('client_id',source.client_id).eq('source','meta_ads')
    .eq('account_id',source.account_id).eq('operation','previews').in('status',['success','failed'])
    .contains('preview_results',{results:[{ad_id:source.ad_id,outcome:'updated',path:snapshot.previous_path,sha256:snapshot.previous_sha256}]})
    .contains('preview_selection',{ads:[{ad_id:source.ad_id,creative_id:source.creative_id,video_id:source.video_id,previous_path:source.previous.path,previous_sha256:source.previous.sha256,previous_updated_at:source.previous.updated_at}]})
    .order('completed_at',{ascending:false}).limit(1);
  const row=data?.[0];
  if(error||!row||!['success','failed'].includes(row.status)||row.preview_results?.status!==row.status||typeof row.id!=='string'||!/^[a-f0-9-]{36}$/i.test(row.id)) fail('preview_restore_origin_unconfirmed');
  return row.id;
}
