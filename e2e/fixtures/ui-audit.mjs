// Synthetic audit transport only. No production URL, credentials or session.
export const apiOrigin='http://127.0.0.1:55498';
export const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'auditoria@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
export const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp:2000000000}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.SYNTHETIC';
export async function install(context,options={}){
 const appOrigin=options.appOrigin??process.env.UIUX_APP_ORIGIN??'http://127.0.0.1:5196';
 const state={role:'admin',mode:'normal',auth:true,sync:'idle',writes:[],blocked:[],calls:[],...options};
 await context.addInitScript(({user,token,auth,theme})=>{localStorage.setItem('mg-dashboard-theme',theme);if(auth)localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'SYNTHETIC',expires_at:2000000000,expires_in:7200,token_type:'bearer',user}));},{user,token,auth:state.auth,theme:state.theme??'dark'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===appOrigin)return route.continue();
  if(url.origin!==apiOrigin){state.blocked.push(url.origin);return route.abort();}
  state.calls.push({path:url.pathname,method:req.method(),body:req.postData()});
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-expose-headers':'content-range'};
  const json=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname.includes('/auth/v1/user'))return json(user);
  if(url.pathname.includes('/auth/v1/logout'))return json({});
  if(url.pathname.includes('/auth/v1/token'))return json({error:'Synthetic expired session'},401);
  if(url.pathname.includes('/auth/v1/authorize'))return json({error:'Synthetic OAuth failure'},400);
  if(url.pathname.includes('/functions/v1/request-dashboard-sync')){
   const body=req.postDataJSON();
   if(body.action==='request'){
    state.writes.push({kind:'sync',body});state.sync='running';
    return json({ok:true,range_start:'2026-10-21',range_end:'2026-10-28',results:['google_ads','meta_ads','ga4'].map((source,i)=>({source,state:'accepted',run_id:`run-${i}`}))},202);
   }
   if(state.sync==='error')return json({error:'Synthetic status failure'},503);
   const sources=['google_ads','meta_ads','ga4'].map((source,i)=>{
    const status=state.sync==='partial'?(i===2?'failed':'success'):state.sync==='uncertain'?'indeterminate':state.sync==='queued'?'queued':state.sync==='running'?'running':'success';
    const latest_run=state.sync==='idle'?null:{id:`run-${i}`,source,status,requested_at:'2026-10-28T14:50:00Z',started_at:'2026-10-28T14:50:00Z',completed_at:['success','failed'].includes(status)?'2026-10-28T14:51:00Z':null,range_start:'2026-10-21',range_end:'2026-10-28',period_mode:'including_today',trigger:'manual',requested_by:user.id,overdue:state.sync==='uncertain',database_write_status:status==='success'?'success':null,error_code:status==='failed'?'PLATFORM_SYNC_FAILED':null};
    return {source,enabled:true,latest_run,last_success_at:'2026-10-27T04:00:00Z',available_through:i===0?'2026-10-25':'2026-10-27',missing_accounts:0,accounts:[],next_manual_at:state.sync==='cooldown'?'2026-10-28T15:05:00Z':null};
   });
   return json({client_id:1,role:state.role,can_request:state.role==='admin',server_time:'2026-10-28T15:00:00Z',today:'2026-10-28',sources,requested_runs:sources.map(s=>s.latest_run).filter(Boolean)});
  }
  if(url.pathname.includes('/functions/')){state.blocked.push(url.pathname);return route.abort();}
  if(url.pathname.includes('/storage/')&&req.method()==='POST')return json(req.postDataJSON().paths.map(path=>({path,signedURL:`/object/sign/dashboard-creatives/${path}?token=synthetic`})));
  if(url.pathname.includes('/storage/'))return route.fulfill({headers,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="600" height="750" fill="#324552"/><text x="300" y="310" text-anchor="middle" fill="#fff" font-size="36">AUDITORIA LOCAL</text><text x="300" y="370" text-anchor="middle" fill="#d7982b" font-size="26">Imagem sintética</text></svg>'});
  const table=url.pathname.split('/').pop();
  if(table==='dashboard_clients')return json({id:1,slug:'maria-gasolina'});
  if(table==='dashboard_client_users')return json(state.mode==='pending'?null:{client_id:1,role:state.role});
  if(table==='dashboard_manual_inputs'){
   if(req.method()!=='GET'){const body=req.postDataJSON();state.writes.push({kind:'commercial',body});return json([body]);}
   for(let i=0;state.settingsMode==='loading'&&i<200;i++)await new Promise(resolve=>setTimeout(resolve,100));
   if(state.settingsMode==='error')return json({message:'Falha controlada nas configurações',code:'AUDIT_SETTINGS'},400);
   return json(url.searchParams.get('scope')==='eq.business'?(state.goals?{payload:{goals:state.goals}}:null):[]);
  }
  if(table==='dashboard_sync_runs')return json({completed_at:'2026-10-27T04:00:00Z'});
  if(table==='dashboard_daily_metrics')return json({metric_date:'2026-10-27'});
  if(state.mode==='loading'&&(table==='dashboard_campaign_daily'||table==='get_dashboard_overview')){await new Promise(r=>setTimeout(r,20000));return json([]);}
  if((state.mode==='error'||state.mode==='partial')&&(table==='dashboard_campaign_daily'||table==='get_dashboard_ga4_landing_pages'))return json({message:'Falha controlada na auditoria',code:'AUDIT'},state.errorStatus??503);
  if(table==='dashboard_campaign_daily'){
   const rows=[];if(state.mode!=='empty')for(const month of (state.history?['09','10']:['10']))for(let d=1;d<=27;d++)for(const front of ['FRANQUIA','CONDOMINIOS'])for(const source of ['meta_ads','google_ads'])rows.push({source,campaign_id:`${front}-${source}`,campaign_name:`MG | ${front} | Campanha sintética de auditoria com nome extenso`,campaign_status:'ACTIVE',metric_date:`2026-${month}-${String(d).padStart(2,'0')}`,impressions:2000+d*11,reach:1800,clicks:50+d,link_clicks:20,conversions:5+d%7+(month==='09'?3:0),spend:(100+d)*(month==='09'?1.5:1)*(state.spendScale??1)});return json(rows);
  }
  if(table==='dashboard_ad_daily')return json(state.mode==='empty'?[]:['FRANQUIA','CONDOMINIOS'].flatMap(front=>Array.from({length:10},(_,i)=>({source:'meta_ads',ad_id:`${front}-${i}`,ad_name:`Imagem de auditoria ${i+1} com título extenso para conferir distribuição`,campaign_name:`MG | ${front} | Campanha local`,impressions:1000,clicks:30,conversions:20-i,spend:150}))));
  if(table==='dashboard_creative_previews')return json(['FRANQUIA','CONDOMINIOS'].flatMap(front=>Array.from({length:10},(_,i)=>({ad_id:`${front}-${i}`,creative_type:'image',preview_kind:'image',preview_storage_path:`${front}-${i}.svg`,preview_available:true,metadata:{preview_width:600,preview_height:750,preview_media_type:'image'}}))));
  if(table==='get_dashboard_network_units')return json({units:[],cities:state.map?[{city:'Campinas',state:'SP',normalized_city:'campinas',unit_count:3,resolved:true,latitude:-22.9099,longitude:-47.0626,municipality_ibge_code:null},{city:'Curitiba',state:'PR',normalized_city:'curitiba',unit_count:2,resolved:true,latitude:-25.4284,longitude:-49.2733,municipality_ibge_code:null}]:[],summary:{total_units:state.map?5:0,total_cities:state.map?2:0,unresolved_cities:0},headquarters:{city:'Campinas',state:'SP'}});
  if(table==='get_dashboard_overview'){
   const k={has_data:state.mode!=='empty',sessions:12340,engaged_sessions:8320,active_users:10900,new_users:7650,views:18000,events:45000,conversions:241,revenue:0,generate_leads:241,engagement_rate:67.42,views_per_session:1.46,lead_rate:1.95};
   return json({analytics:{current:k,previous:{...k,sessions:11000},daily:state.mode==='empty'?[]:Array.from({length:27},(_,i)=>({...k,date:`2026-10-${String(i+1).padStart(2,'0')}`,sessions:350+i*12,generate_leads:5+i%7,new_users:200,engaged_sessions:300}))}});
  }
  if(table==='get_dashboard_ga4_acquisition')return json({items:state.mode==='empty'?[]:['Organic Search','Paid Search','Paid Social','Direct','Referral','Organic Social'].map((channel,i)=>({channel_group:channel,source_medium:channel+' / audit',sessions:2000-i*200,engaged_sessions:1200,active_users:1500,new_users:1200,generate_leads:50-i*5,engagement_rate:60,lead_rate:2.5})),total_count:6,next_cursor:null});
  if(table==='get_dashboard_ga4_events')return json({items:state.mode==='empty'?[]:['page_view','scroll','form_submit','generate_lead','session_start','click'].map((event_name,i)=>({event_name,event_count:1000-i*100,daily_average:30,key_events:0,share_of_total:16})),total_count:6,next_cursor:null});
  if(table==='get_dashboard_ga4_landing_pages')return json({items:state.mode==='empty'?[]:Array.from({length:7},(_,i)=>({landing_page:`/pagina-de-auditoria-${i}/nome-extenso`,sessions:1000-i*80,engaged_sessions:600,active_users:800,new_users:600,generate_leads:20-i,engagement_rate:60,lead_rate:2,views:1200})),total_count:7,next_cursor:null});
  if(url.pathname.includes('/rpc/'))return json({items:[],total_count:0,next_cursor:null});
  return json([]);
 });
 return state;
}
