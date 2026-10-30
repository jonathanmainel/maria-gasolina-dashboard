"""One authorized synthetic forward/restore cycle. Fixed isolated project, no production.
Run prepare, then upgrade, then restore separately. Never retries a failed dispatch.
"""
from pathlib import Path
import hashlib,io,json,sys,time,uuid,urllib.request,urllib.error
from datetime import datetime,timezone
from PIL import Image
from stage_control import config,backend_key,request,REF,URL,NoRedirect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/meta-preview-restoration-20261029'
if len(sys.argv)>2:
 assert sys.argv[2]=='response-fix'
 OUT=OUT/'response-fix'
OUT.mkdir(exist_ok=True)
ACCOUNT='900000000001';AD='800303';CREATIVE='600303';VIDEO='700303'
assert REF=='uwafdxsdsgqysjjxfywo' and URL=='https://uwafdxsdsgqysjjxfywo.supabase.co'
PATH=f'/rest/v1/dashboard_creative_previews?client_id=eq.1&source=eq.meta_ads&account_id=eq.{ACCOUNT}&entity_id=eq.{AD}'
def save(name,v):
 text=json.dumps(v,ensure_ascii=False,indent=2)
 assert 'access_token' not in text and 'sb_secret_' not in text
 (OUT/name).write_text(text,encoding='utf-8')
def load(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
def current(key):
 status,rows=request(PATH,key);assert status==200 and len(rows)==1 and rows[0]['ad_name'].startswith('SYNTHETIC PREVIEW')
 return rows[0]
def storage(key,path,data=None):
 prefix='/storage/v1/object/'+('dashboard-creatives/' if data is not None else 'authenticated/dashboard-creatives/')
 req=urllib.request.Request(URL+prefix+path,data=data,method='POST' if data is not None else 'GET',headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'image/png','x-upsert':'false'})
 try:
  with urllib.request.build_opener(NoRedirect).open(req,timeout=45) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
def verify_object(key,row):
 status,data=storage(key,row['preview_storage_path']);assert status==200 and hashlib.sha256(data).hexdigest()==row['preview_sha256']
 with Image.open(io.BytesIO(data)) as im:im.load();dims=[im.width,im.height]
 return {'sha256':row['preview_sha256'],'width':dims[0],'height':dims[1],'bytes':len(data)}
def wait_terminal(key,run_id):
 for _ in range(115):
  status,rows=request('/rest/v1/dashboard_automation_runs?id=eq.'+run_id,key);assert status==200 and len(rows)==1
  if rows[0]['status'] not in ['queued','running']:return rows[0]
  time.sleep(1)
 raise AssertionError('TERMINAL_TIMEOUT_NO_RETRY')
def main():
 phase=sys.argv[1];cfg=config();key=backend_key()
 status,active=request('/rest/v1/dashboard_automation_runs?status=in.(queued,running,indeterminate)&select=id',key)
 assert status==200 and active==[],'ACTIVE_RESERVATION_STOP'
 if phase=='prepare':
  assert not (OUT/'seeded-row.private.json').exists(),'SEED_ALREADY_PREPARED'
  before=current(key);save('before-seed.private.json',before)
  data=(ROOT/'tests/fixtures/meta-previews/tiny.png').read_bytes();sha=hashlib.sha256(data).hexdigest()
  path=f'1/meta_ads/{ACCOUNT}/ad/{AD}/restore-seed-{sha[:12]}.png'
  status,old=storage(key,path)
  if status==200:assert hashlib.sha256(old).hexdigest()==sha
  else:
   assert status in [400,404];status,_=storage(key,path,data);assert status in [200,201]
  patch={'preview_storage_path':path,'preview_sha256':sha,'preview_mime_type':'image/png','last_error':None,
    'updated_at':datetime.now(timezone.utc).isoformat(),
    'metadata':{'video_id':VIDEO,'preview_asset_key':'video:'+VIDEO,'preview_width':64,'preview_height':64,'preview_source':'controlled_restore_seed','custom_preserved':'RESTORE_TEST_ONLY'}}
  if before['preview_sha256']!=sha or before['preview_storage_path']!=path:
   status,_=request(PATH,key,patch,'PATCH');assert status in [200,204]
  row=current(key);assert verify_object(key,row)['width']==64;save('seeded-row.private.json',row)
  approved=hashlib.sha256((ROOT/'tests/fixtures/meta-previews/large.png').read_bytes()).hexdigest()
  entry={'client_id':1,'source':'meta_ads','account_id':ACCOUNT,'ad_id':AD,'creative_id':CREATIVE,'video_id':VIDEO,'asset_key':'video:'+VIDEO,
    'sha256':approved,'width':1080,'height':1920,'mime':'image/png','url':f'https://scontent.preview.fbcdn.net/{AD}/large.png',
    'previous':{'creative_id':CREATIVE,'video_id':VIDEO,'asset_key':'video:'+VIDEO,'sha256':sha,'path':path,'updated_at':row['updated_at'],'mime':'image/png','metadata':row['metadata']}}
  raw=json.dumps({'version':1,'entries':[entry]},separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest()
  (OUT/'isolated-manifest.private.json').write_bytes(raw)
  save('isolated-pin.json',{'path':'1/meta_ads/approved-sources/'+digest+'.json','sha256':digest,'ad_ids':[AD]})
  save('cycle-state.json',{'approved_sha256':approved,'old_sha256':sha,'upgrade_key':str(uuid.uuid4()),'restore_key':str(uuid.uuid4())})
  print(json.dumps({'phase':'prepare','project':REF,'synthetic_ad':AD,'old_dimensions':[64,64],'manifest_sha256':digest}),flush=True);return
 assert phase in ['upgrade','restore']
 assert not (OUT/(phase+'-dispatch.json')).exists(),'DISPATCH_ALREADY_RECORDED_NO_RETRY'
 state=load('cycle-state.json');before=current(key)
 if phase=='restore':
  upgrade=load('upgrade-result.json');assert upgrade['run']['status']=='success'
  assert before['preview_sha256']==state['approved_sha256']
  # Respect the existing five-minute manual cooldown; never bypass it.
 status,s=request('/rest/v1/rpc/get_dashboard_sync_status',key,{'p_client_slug':'maria-gasolina','p_user_id':cfg['accounts']['admin']['userId']});assert status==200
 deadline=next(x['next_manual_at'] for x in s['sources'] if x['source']=='meta_ads')
 if deadline:
  wait=(datetime.fromisoformat(deadline)-datetime.fromisoformat(s['server_time'])).total_seconds()+1
  if wait>0:
   print(json.dumps({'phase':phase,'respecting_existing_cooldown_seconds':round(wait)}),flush=True)
   until=time.monotonic()+wait
   while time.monotonic()<until:time.sleep(min(5,until-time.monotonic()))
 assert current(key)==before,'CONCURRENT_CHANGE_DURING_COOLDOWN'
 admin=cfg['accounts']['admin'];status,session=request('/auth/v1/token?grant_type=password',cfg['apiKey'],{'email':admin['email'],'password':admin['password']});assert status==200,'SYNTHETIC_ADMIN_AUTH_FAILED'
 token=session['access_token']
 body={'action':'request','client_slug':'maria-gasolina','sources':['meta_ads'],'operation':'previews','request_key':state[phase+'_key'],
   'preview_ad_ids':[AD],'preview_assets':[{'ad_id':AD,'creative_id':CREATIVE,'video_id':VIDEO,'sha256':state['approved_sha256' if phase=='upgrade' else 'old_sha256']}]}
 status,result=request('/functions/v1/request-dashboard-sync',cfg['apiKey'],body,token=token)
 save(phase+'-dispatch.json',{'http':status,'result':result,'request_key':body['request_key']})
 assert status in [200,202] and result['results'][0]['state']=='accepted',('DISPATCH_NOT_ACCEPTED_STOP',phase,status)
 run=wait_terminal(key,result['results'][0]['run_id']);save(phase+'-terminal.private.json',run)
 assert run['status']=='success',('RUN_FAILED_STOP',phase,run.get('error_code'))
 row=current(key);obj=verify_object(key,row);expected=state['approved_sha256' if phase=='upgrade' else 'old_sha256'];assert obj['sha256']==expected
 outcome='updated' if phase=='upgrade' else 'restored_previous'
 receipt=run['preview_results']['results'][0];assert receipt['outcome']==outcome and receipt['sha256']==expected
 assert [obj['width'],obj['height']]==([1080,1920] if phase=='upgrade' else [64,64])
 if phase=='restore':assert receipt['origin_run_id']==load('upgrade-result.json')['run']['id']
 # Same request key must resolve to the same completed reservation, no writes.
 status,replayed=request('/functions/v1/request-dashboard-sync',cfg['apiKey'],body,token=token)
 assert status in [200,202] and replayed['results'][0]['run_id']==run['id'] and current(key)==row,'IDEMPOTENCE_FAILED'
 status,duplicates=request('/rest/v1/dashboard_automation_runs?request_key=eq.'+body['request_key']+'&select=id',key);assert status==200 and len(duplicates)==1
 old=load('seeded-row.private.json');old_verified=verify_object(key,old);assert old_verified['sha256']==state['old_sha256']
 if phase=='restore':verify_object(key,load('upgrade-result.json')['persisted_row'])
 safe={'phase':phase,'project':REF,'passed':True,'run':{'id':run['id'],'status':run['status'],'preview_results':run['preview_results'],'collector_started_at':run['collector_started_at'],'completed_at':run['completed_at']},'persisted_row':row,'object':obj,'idempotent_request_key':True,'old_object_preserved':True}
 save(phase+'-result.json',safe)
 print(json.dumps({k:v for k,v in safe.items() if k not in ['persisted_row']},ensure_ascii=True),flush=True)
if __name__=='__main__':main()
