import { expect, it, vi } from "vitest";
import { officialCreativeThumbnail } from "./official-creative-thumbnail.ts";
const identity={accountId:"4",adId:"901",creativeId:"902",videoId:"903",assetKey:"video:903",representationCertain:true};
const payload={id:"902",account_id:"4",video_id:"903",object_type:"VIDEO",thumbnail_url:"https://scontent.xx.fbcdn.net/real.jpg"};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
it.each([[1080,1920],[1920,1080],[1080,1080],[720,1280]])("requests official native dimensions %sx%s without scaling up",async(width,height)=>{
 const transport=vi.fn(async(_url: string | URL | Request,_init?: RequestInit)=>reply(payload));
 const r=await officialCreativeThumbnail("v23.0","SYNTHETIC_TOKEN",identity,{width,height},transport as typeof fetch);
 expect(r.errors).toEqual([]); expect(r.candidates[0]).toMatchObject({nativeWidth:width,nativeHeight:height,originalRatio:width/height,verifiedIdentity:{adId:"901",creativeId:"902",videoId:"903",accountId:"4"}});
 const url=new URL(transport.mock.calls[0][0] as unknown as string);
 expect(Number(url.searchParams.get("thumbnail_width"))).toBeLessThanOrEqual(width);
 expect(Number(url.searchParams.get("thumbnail_height"))).toBeLessThanOrEqual(height);
 expect(transport.mock.calls[0][1]).toMatchObject({redirect:"error",headers:{Authorization:"Bearer SYNTHETIC_TOKEN"}});
});
it.each([{id:"other"},{account_id:"other"},{video_id:"other"},{asset_feed_spec:{videos:[{video_id:"other"}]}}])("rejects divergent official identity %j",async(change)=>{
 const r=await officialCreativeThumbnail("v23.0","SYNTHETIC_TOKEN",identity,{width:1080,height:1920},async()=>reply({...payload,...change}));
 expect(r.candidates).toEqual([]); expect(r.errors).toEqual(["creative_thumbnail_identity_mismatch"]);
});
it("requires native HD proof and certain asset before any request",async()=>{
 const f=vi.fn();
 for(const native of [undefined,{width:64,height:64},{width:360,height:640}])expect((await officialCreativeThumbnail("v23.0","SYNTHETIC_TOKEN",identity,native,f)).candidates).toEqual([]);
 expect((await officialCreativeThumbnail("v23.0","SYNTHETIC_TOKEN",{...identity,representationCertain:false},{width:1080,height:1920},f)).candidates).toEqual([]);
 expect(f).not.toHaveBeenCalled();
});
it("reports Meta #10 without persisting tokens, URLs or remote message",async()=>{
 const r=await officialCreativeThumbnail("v23.0","SYNTHETIC_TOKEN",identity,{width:1080,height:1920},async()=>reply({error:{code:10,message:"PRIVATE_SOURCE"}},400));
 expect(r).toEqual({candidates:[],errors:["meta_10"]}); expect(JSON.stringify(r)).not.toMatch(/PRIVATE|TOKEN/);
});
it("rejects an untrusted host returned by a provider",async()=>{
 const r=await officialCreativeThumbnail("v23.0","SYNTHETIC_TOKEN",identity,{width:1080,height:1920},async()=>reply({...payload,thumbnail_url:"http://169.254.169.254/latest"}));
 expect(r.errors).toEqual(["creative_thumbnail_url_untrusted"]);
});
