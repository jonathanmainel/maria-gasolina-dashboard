// Isolated test provider. Its bytes are generated controlled fixtures, never client media.
export const ORIGIN='https://uwafdxsdsgqysjjxfywo.supabase.co';
const CDN='https://scontent.preview.fbcdn.net';
export type PreviewControl={scenario:string;generation:number};
export function createPreviewProvider(native:typeof fetch,control:PreviewControl,started:()=>void,fixtures:Record<string,string>){
 let concurrent=false;
 return async(request:Request):Promise<Response|undefined>=>{
  const u=new URL(request.url);const failure=control.scenario==='partial';
  const media=(id:string,file:string)=>`${CDN}/${id}/${file}`;
  if(u.origin==='https://graph.facebook.com'){
   started();
   if(u.pathname.endsWith('/insights'))throw Error('PREVIEW_MUST_NOT_QUERY_METRICS');
   if(u.pathname.endsWith('/ads')){
    const ids=JSON.parse(u.searchParams.get('filtering')??'[]')[0]?.value??[];
    if(!u.pathname.includes('act_900000000001')||ids.some((x:string)=>!/^8003(0[1-9]|10)$/.test(x)))throw Error('PREVIEW_TEST_SCOPE');
    return Response.json({data:ids.map((id:string)=>{
     const n=id.slice(-2),video_id='7003'+n;
     return {id,name:'SYNTHETIC PREVIEW '+n,creative:{id:'6003'+n,object_type:'VIDEO',thumbnail_url:media(id,'tiny.png'),
      ...(id==='800302'?{asset_feed_spec:{videos:[{video_id},{video_id:'799999'}]}}:{video_id})}};
    })});
   }
   const video=u.pathname.match(/\/(7003\d{2})(\/thumbnails)?$/);
   if(video){
    const id='8003'+video[1].slice(-2);
    if(video[2]){
     const broken=failure&&['800305','800306'].includes(id);
     const file=broken?(id==='800305'?'expired.png':'corrupt.png'):'hd.png';
     if(id==='800304'&&failure)return Response.json({data:[{uri:media(id,'small.png'),width:1080,height:1920,is_preferred:true}]});
     if(u.searchParams.has('after'))return Response.json({data:[{uri:media(id,broken?file:'large.png'),width:64,height:64,is_preferred:false}]});
     const hasNext=id!=='800303';
     return Response.json({data:[{uri:media(id,broken?file:'tiny.png'),width:1080,height:1920,is_preferred:true},{uri:media(id,file),width:64,height:64,is_preferred:true}],
      ...(hasNext?{paging:{next:`https://graph.facebook.com/v25.0/${video[1]}/thumbnails?after=page2`}}:{})});
    }
    return Response.json({format:[{filter:'native',width:1080,height:1920}],picture:media(id,failure&&id==='800305'?'expired.png':failure&&id==='800306'?'corrupt.png':'tiny.png')});
   }
   return Response.json({data:[]});
  }
  if(u.origin===CDN){
   const parts=u.pathname.split('/'),file=parts.at(-1)!;
   if(control.scenario==='indeterminate'&&parts[1]==='800310')await new Promise(r=>setTimeout(r,12000));
   if(file==='expired.png')return new Response('expired',{status:403});
   if(file==='corrupt.png')return new Response('not an image',{headers:{'content-type':'image/png'}});
   const bytes=Uint8Array.from(atob(fixtures[file]),c=>c.charCodeAt(0));
   return new Response(bytes,{headers:{'content-type':'image/png','content-length':String(bytes.length)}});
  }
  if(u.origin===ORIGIN&&failure){
   if(request.method==='POST'&&u.pathname.includes('/storage/v1/object/dashboard-creatives/')&&u.pathname.includes('/ad/800307/'))return Response.json({message:'TEST_STORAGE_FAILURE'},{status:500});
   if(request.method==='PATCH'&&u.pathname.endsWith('/rest/v1/dashboard_creative_previews')){
    if(u.searchParams.get('entity_id')==='eq.800308')return Response.json({message:'TEST_DATABASE_FAILURE',code:'XX000'},{status:500});
    if(u.searchParams.get('entity_id')==='eq.800309'&&!concurrent){
     concurrent=true;
     const target=new URL(u);target.searchParams.delete('updated_at');target.searchParams.delete('select');
     const changed=await native(new Request(target,{method:'PATCH',headers:request.headers,body:JSON.stringify({updated_at:new Date(Date.now()+1000).toISOString()})}));
     if(!changed.ok)throw Error('TEST_CONCURRENT_WRITER_FAILED');
    }
   }
  }
  return undefined;
 };
}
