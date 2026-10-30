"""Real isolated Auth/Edge/Postgres/pg_net/Storage. Provider bytes are synthetic.

Every URL is fixed to the isolated project. Secrets and sessions stay in memory.
Run phases separately, respecting the existing five-minute manual cooldown.
"""
import hashlib, io, json, sys, time, uuid, urllib.request, urllib.error
from datetime import datetime, timezone
from PIL import Image
from pathlib import Path
from stage_control import config, backend_key, request, REF, URL, NoRedirect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/meta-preview-protocol-20261028'
OUT.mkdir(exist_ok=True, parents=True)
ACCOUNT = '900000000001'
IDS = [str(800301+i) for i in range(10)]
TABLES = ['dashboard_daily_metrics','dashboard_campaign_daily','dashboard_ad_daily','dashboard_ad_group_daily',
          'dashboard_keyword_daily','dashboard_pmax_asset_daily','dashboard_pmax_asset_group_daily',
          'dashboard_ga4_acquisition_daily','dashboard_ga4_event_daily','dashboard_ga4_landing_page_daily',
          'dashboard_crm_funnel_daily']

def save(name, value):
    (OUT / (name+'.json')).write_text(json.dumps(value, indent=2), encoding='utf-8')

def load(name): return json.loads((OUT / (name+'.json')).read_text(encoding='utf-8'))

def storage(path, key, data=None, method=None, content='application/json', token=None):
    assert path.startswith('/storage/v1/')
    req = urllib.request.Request(URL+path, data=data, method=method or ('POST' if data is not None else 'GET'),
        headers={'apikey':key,'Authorization':'Bearer '+(token or key),'Content-Type':content,'x-upsert':'false'})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=40) as res: return res.status, res.read()
    except urllib.error.HTTPError as err: return err.code, err.read()

def auth(cfg, role):
    user=cfg['accounts'][role]
    status, result=request('/auth/v1/token?grant_type=password',cfg['apiKey'],{'email':user['email'],'password':user['password']})
    assert status==200, ('AUTH',role,status)
    return result['access_token']

def rows(key, suffix=''):
    status,data=request('/rest/v1/dashboard_creative_previews?client_id=eq.1&source=eq.meta_ads&account_id=eq.'+ACCOUNT+'&entity_id=in.('+','.join(IDS)+')'+suffix,key)
    assert status==200, ('READ_PREVIEWS',status)
    return sorted(data,key=lambda x:x['entity_id'])

def metrics(key):
    snapshot={}
    for table in TABLES:
        status,data=request('/rest/v1/'+table+'?select=*&limit=10000',key)
        assert status==200, ('METRICS_READ',table,status)
        snapshot[table]={'rows':len(data),'sha256':hashlib.sha256(json.dumps(sorted(data,key=lambda x:json.dumps(x,sort_keys=True)),sort_keys=True).encode()).hexdigest()}
    return snapshot

def invoke(cfg, token, ids, key=None, **patch):
    value={'action':'request','client_slug':'maria-gasolina','sources':['meta_ads'],'operation':'previews',
        'request_key':key or str(uuid.uuid4()),'preview_ad_ids':ids,**patch}
    status,data=request('/functions/v1/request-dashboard-sync',cfg['apiKey'],value,token=token)
    return status,data,value

def wait_run(key, run_id, terminal=True):
    for i in range(100):
        status,data=request('/rest/v1/dashboard_automation_runs?id=eq.'+run_id,key)
        assert status==200 and len(data)==1
        r=data[0]
        if r['status'] not in ('queued','running') or not terminal and r['collector_started_at']: return r
        time.sleep(1)
    raise AssertionError(('RUN_TIMEOUT',run_id,r['status']))

def seed(cfg,key):
    _,active=request('/rest/v1/dashboard_automation_runs?status=in.(queued,running,indeterminate)&select=id',key)
    assert active==[], 'ACTIVE_RESERVATION'
    before=rows(key);save('seed-before',before)
    assert all(r['entity_id']=='800301' and r['creative_id'] is None or r['ad_name'].startswith('SYNTHETIC PREVIEW') for r in before), 'NON_TEST_MEDIA'
    status,_=storage('/storage/v1/bucket',key,json.dumps({'id':'dashboard-creatives','name':'dashboard-creatives','public':False,'file_size_limit':10485760,'allowed_mime_types':['image/png','image/jpeg','image/webp','image/gif','image/avif']}).encode())
    assert status==200, ('CREATE_PRIVATE_TEST_BUCKET',status)
    prepared=[]
    for i,ad_id in enumerate(IDS):
        name='large.png' if i==1 else 'tiny.png' if i==0 else 'small.png'
        data=(ROOT/'tests/fixtures/meta-previews'/name).read_bytes()
        digest=hashlib.sha256(data).hexdigest();width,height={'large.png':(1080,1920),'tiny.png':(64,64),'small.png':(160,284)}[name]
        path=f'1/meta_ads/{ACCOUNT}/ad/{ad_id}/old-{digest[:12]}.png'
        status,_=storage('/storage/v1/object/dashboard-creatives/'+path,key,data,content='image/png')
        assert status==200, ('SEED_OBJECT',ad_id,status)
        prepared.append({'client_id':1,'source':'meta_ads','account_id':ACCOUNT,'entity_type':'ad','entity_id':ad_id,'ad_id':ad_id,
            'ad_name':'SYNTHETIC PREVIEW '+ad_id[-2:],'creative_id':'6003'+ad_id[-2:],'creative_type':'dynamic' if i==1 else 'video',
            'preview_kind':'dynamic_representative' if i==1 else 'video_thumbnail','preview_storage_path':path,
            'preview_sha256':digest,'preview_mime_type':'image/png','metadata':{'video_id':'7003'+ad_id[-2:],'preview_asset_key':'video:7003'+ad_id[-2:],
            'preview_width':width,'preview_height':height,'preview_source':'controlled_test_seed','custom_preserved':'TEST_ONLY'}})
    status,_=request('/rest/v1/dashboard_creative_previews?on_conflict=client_id,source,account_id,entity_type,entity_id',key,prepared,extra={'Prefer':'resolution=merge-duplicates'})
    assert status==201, ('SEED_ROWS',status)
    save('seed-manifest',prepared);save('metrics-before',metrics(key))
    print(json.dumps({'phase':'seed','project':REF,'private_bucket':True,'synthetic_previews':len(prepared)}),flush=True)

def security(cfg,key):
    checks=[];admin=auth(cfg,'admin')
    for role in ['viewer','editor','other']:
        status,_,_=invoke(cfg,auth(cfg,role),[IDS[0]])
        assert status==403, (role,status);checks.append(role+': denied')
    status,_,_=invoke(cfg,cfg['apiKey'],[IDS[0]])
    assert status==401;checks.append('unauthenticated: denied')
    bad=[{'preview_ad_ids':[]},{'preview_ad_ids':[IDS[0],IDS[0]]},{'preview_ad_ids':['invalid']},
         {'preview_ad_ids':[str(i) for i in range(51)]},{'sources':['google_ads']},{'sources':['ga4']},
         {'operation':'metrics'},{'client_id':2},{'account_id':'wrong'},{'user_id':cfg['accounts']['admin']['userId']},
         {'preview_assets':[{'ad_id':IDS[0],'creative_id':'999','video_id':'700301','sha256':'a'*64}]}]
    for patch in bad:
        status,_,_=invoke(cfg,admin,[IDS[0]],**patch)
        assert status==400, ('INVALID_SELECTION',patch,status)
        checks.append('invalid selection denied: '+','.join(patch))
    for patch in [{'client_slug':'rls-sandbox-b'},{'preview_ad_ids':['999999']}]:
        status,_,_=invoke(cfg,admin,[IDS[0]],**patch)
        assert status==403, ('FOREIGN_SCOPE',status)
        checks.append('client/account scope denied')
    for fn in ['request_dashboard_preview_sync','begin_dashboard_preview_collection','verify_dashboard_preview_results']:
        status,_=request('/rest/v1/rpc/'+fn,cfg['apiKey'],{},token=admin)
        assert status in (401,403,404),('RPC_PUBLIC_ACCESS',fn,status);checks.append(fn+': not public')
    save('security',{'project':REF,'passed':True,'checks':checks});print(json.dumps({'phase':'security','passed':len(checks)}),flush=True)

def batch(cfg,key,phase):
    status,active=request('/rest/v1/dashboard_automation_runs?client_id=eq.1&source=eq.meta_ads&status=in.(queued,running,indeterminate)&select=id',key)
    assert status==200 and active==[], 'ACTIVE_OPERATION_REQUIRES_INVESTIGATION'
    status,current=request('/rest/v1/rpc/get_dashboard_sync_status',key,{'p_client_slug':'maria-gasolina','p_user_id':cfg['accounts']['admin']['userId']})
    assert status==200
    deadline=next(x['next_manual_at'] for x in current['sources'] if x['source']=='meta_ads')
    if deadline:
        remaining=(datetime.fromisoformat(deadline)-datetime.fromisoformat(current['server_time'])).total_seconds()
        if remaining>0:
            print(json.dumps({'phase':phase,'waiting_for_existing_cooldown_seconds':round(remaining)}),flush=True)
            until=time.monotonic()+remaining+1
            while time.monotonic()<until:time.sleep(min(1,until-time.monotonic()))
    scenario={'partial':'partial','success':'success','idempotence':'success','timeout':'indeterminate'}[phase]
    status,_=request('/rest/v1/manual_sync_homolog_control?id=eq.true',key,{'scenario':scenario,'generation':1},'PATCH')
    assert status==204
    before=rows(key);before_metrics=metrics(key);admin=auth(cfg,'admin');selection=IDS if phase!='timeout' else [IDS[-1]]
    status,data,value=invoke(cfg,admin,selection)
    assert status==202, ('REQUEST',status,data)
    item=data['results'][0]
    assert item['state']=='accepted',('RESERVATION_NOT_ACCEPTED',item)
    run_id=item['run_id'];save(phase+'-request',{'http':status,'request':value,'result':data})
    print(json.dumps({'phase':phase,'accepted':run_id}),flush=True)
    # Same request never dispatches twice; changed purpose/IDs may not reuse this key.
    status,repeated,_=invoke(cfg,admin,selection,key=value['request_key'])
    assert status==202 and repeated['results'][0]['state']=='existing' and repeated['results'][0]['run_id']==run_id
    for patch in [{'preview_ad_ids':['800399']},{'operation':'metrics','preview_ad_ids':None}]:
        if patch.get('operation')=='metrics':
            raw={k:v for k,v in value.items() if k not in ('operation','preview_ad_ids')}
            status,_=request('/functions/v1/request-dashboard-sync',cfg['apiKey'],raw,token=admin)
        else: status,_,_=invoke(cfg,admin,selection,key=value['request_key'],**patch)
        assert status==400,('KEY_MUTATION',status)
    status,blocked,_=invoke(cfg,admin,selection)
    assert status==202 and blocked['results'][0]['state'] in ('active','cooldown')
    run=wait_run(key,run_id)
    after=rows(key)
    assert metrics(key)==before_metrics, 'PREVIEW_CHANGED_METRICS_OR_CRM'
    report={'project':REF,'phase':phase,'run':run,'metrics_preserved':True,'before':before,'after':after,
            'same_key_no_dispatch':True,'mutated_key_denied':True,'exclusion_preserved':True}
    save(phase+'-result',report)
    if phase=='timeout':
        assert run['status']=='indeterminate'
        status,blocked,_=invoke(cfg,admin,selection)
        assert status==202 and blocked['results'][0]['state']=='active'
        status,released=request('/rest/v1/rpc/reconcile_manual_sync_homolog',key,{'p_run_id':run_id,'p_operator':cfg['accounts']['admin']['userId']})
        assert status==200 and released is False, 'NO_RECONCILIATION_WITHOUT_TERMINAL_PROOF'
        for i in range(100):
            status,receipt=request('/rest/v1/manual_sync_homolog_receipts?run_id=eq.'+run_id,key)
            assert status==200 and len(receipt)==1
            if receipt[0]['finished_at']:break
            time.sleep(1)
        assert receipt[0]['finished_at'] and receipt[0]['counts'].get('preview_results'), 'NO_NATIVE_TERMINAL_RECEIPT'
        status,released=request('/rest/v1/rpc/reconcile_manual_sync_homolog',key,{'p_run_id':run_id,'p_operator':cfg['accounts']['admin']['userId']})
        assert status==200 and released is False, 'NO_RECONCILIATION_WITHOUT_DB_PROOF'
        status,verified=request('/rest/v1/rpc/verify_dashboard_preview_results',key,{'p_run_id':run_id,'p_results':receipt[0]['counts']['preview_results']})
        assert status==200 and verified['status']=='success', ('TERMINAL_DB_PROOF',status)
        status,released=request('/rest/v1/rpc/reconcile_manual_sync_homolog',key,{'p_run_id':run_id,'p_operator':cfg['accounts']['admin']['userId']})
        assert status==200 and released is True, 'TERMINAL_RECONCILIATION_FAILED'
        final=wait_run(key,run_id);assert final['status']=='success'
        assert metrics(key)==before_metrics
        report.update(native_terminal_receipt=receipt[0],verified=verified,final_run=final,reconciliation_proven=True,metrics_preserved=True)
        save(phase+'-result',report)
        print(json.dumps({'phase':phase,'status':'indeterminate','exclusion_preserved':True,'run_id':run_id}),flush=True)
        return
    expected='failed' if phase=='partial' else 'success'
    assert run['status']==expected, ('BATCH_STATUS',run['status'],run['error_code'])
    results=run['preview_results']['results'];assert len(results)==len(selection)
    if phase=='partial':
        expected_outcomes=dict(zip(IDS,['updated','preserved_adequate','updated','preserved_inadequate','failed_download','failed_download','failed_storage','failed_database','cas_conflict','updated']))
        for ad_id in [IDS[0],IDS[2],IDS[9]]:
            prior=next(r for r in before if r['entity_id']==ad_id)
            current=next(r for r in after if r['entity_id']==ad_id)
            if prior['preview_sha256']==current['preview_sha256']:expected_outcomes[ad_id]='preserved_adequate'
        assert {r['ad_id']:r['outcome'] for r in results}==expected_outcomes,('OUTCOMES',results)
    else:
        assert run['preview_results']['status']=='success'
        assert all(r['outcome'] in ('updated','preserved_adequate') for r in results)
        if phase=='idempotence':
            assert run['preview_results']['counts']=={'updated':0,'preserved':10,'failed':0}, 'IDEMPOTENCE_NO_REPLACEMENTS'
            assert [(r['entity_id'],r['preview_storage_path'],r['preview_sha256']) for r in before]==[(r['entity_id'],r['preview_storage_path'],r['preview_sha256']) for r in after]
    for result in results:
        row=next(r for r in after if r['entity_id']==result['ad_id'])
        status,content=storage('/storage/v1/object/authenticated/dashboard-creatives/'+row['preview_storage_path'],key)
        assert status==200 and hashlib.sha256(content).hexdigest()==row['preview_sha256'],('READBACK_OBJECT',row['entity_id'],status)
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            assert image.size==(row['metadata']['preview_width'],row['metadata']['preview_height']) and image.format=='PNG','NATIVE_DIMENSIONS_OR_MIME'
        previous=next(r for r in before if r['entity_id']==row['entity_id'])
        status,content=storage('/storage/v1/object/authenticated/dashboard-creatives/'+previous['preview_storage_path'],key)
        assert status==200 and hashlib.sha256(content).hexdigest()==previous['preview_sha256'], 'OLD_OBJECT_LOST'
        assert row['metadata']['custom_preserved']=='TEST_ONLY', 'METADATA_LOST'
    report['all_objects_and_prior_files_verified']=True;save(phase+'-result',report)
    print(json.dumps({'phase':phase,'status':run['status'],'counts':run['preview_results']['counts'],'metrics_preserved':True,'objects_verified':True}),flush=True)

if __name__=='__main__':
    cfg=config();key=backend_key();phase=sys.argv[1]
    if phase=='seed':seed(cfg,key)
    elif phase=='security':security(cfg,key)
    elif phase in ('partial','success','idempotence','timeout'):batch(cfg,key,phase)
    elif phase=='storage':
        row=rows(key)[0];path=row['preview_storage_path'];checks=[]
        for role in ['admin','viewer','other']:
            token=auth(cfg,role)
            status,data=storage('/storage/v1/object/sign/dashboard-creatives/'+path,cfg['apiKey'],b'{"expiresIn":60}',token=token)
            if role=='other':
                assert status in (400,401,403,404),('STORAGE_FOREIGN_ACCESS',status);checks.append('foreign client denied');continue
            assert status==200,('SIGNED_ACCESS',role,status)
            signed=json.loads(data)['signedURL']
            assert signed.startswith('/object/sign/dashboard-creatives/')
            with urllib.request.build_opener(NoRedirect).open(URL+'/storage/v1'+signed,timeout=30) as response:
                assert hashlib.sha256(response.read()).hexdigest()==row['preview_sha256']
            status,renewal=storage('/storage/v1/object/sign/dashboard-creatives/'+path,cfg['apiKey'],b'{"expiresIn":120}',token=token)
            assert status==200 and json.loads(renewal)['signedURL']!=signed
            checks.append(role+': private signed bytes verified and URL renewed')
        status,_=storage('/storage/v1/object/public/dashboard-creatives/'+path,cfg['apiKey'])
        assert status in (400,401,403,404);checks.append('public access denied')
        status,_=storage('/storage/v1/object/sign/dashboard-creatives/'+path,cfg['apiKey'],b'{"expiresIn":60}')
        assert status in (400,401,403,404);checks.append('anonymous signing denied')
        save('storage',{'project':REF,'passed':True,'checks':checks,'signed_urls_persisted':False})
        print(json.dumps({'phase':'storage','passed':True,'checks':checks}),flush=True)
    elif phase=='metrics':
        # Exercise the unchanged manual/default-metrics path after preview work.
        before=rows(key)
        status,_=request('/rest/v1/manual_sync_homolog_control?id=eq.true',key,{'scenario':'success','generation':1},'PATCH')
        assert status==204
        value={'action':'request','client_slug':'maria-gasolina','sources':['meta_ads'],'request_key':str(uuid.uuid4())}
        status,data=request('/functions/v1/request-dashboard-sync',cfg['apiKey'],value,token=auth(cfg,'admin'))
        assert status==202 and data['results'][0]['state']=='accepted',('METRIC_REQUEST',status,data)
        run=wait_run(key,data['results'][0]['run_id'])
        assert run['operation']=='metrics' and run['status']=='success' and run['preview_selection'] is None,('DEFAULT_METRICS',run['status'])
        assert run['counts'].get('daily',0)>0 and run['counts'].get('ads',0)>0,'METRIC_ROWS_MISSING'
        after=rows(key)
        assert [(r['entity_id'],r['preview_storage_path'],r['preview_sha256']) for r in before]==[(r['entity_id'],r['preview_storage_path'],r['preview_sha256']) for r in after],'METRICS_DOWNGRADED_PREVIEWS'
        save('metrics-compatibility',{'project':REF,'run_id':run['id'],'status':run['status'],'operation':run['operation'],'counts':run['counts'],'existing_previews_preserved':True})
        print(json.dumps({'phase':'metrics','run_id':run['id'],'status':run['status'],'existing_previews_preserved':True}),flush=True)
    elif phase=='status':
        status,data=request('/rest/v1/dashboard_automation_runs?operation=eq.previews&order=requested_at.desc&limit=4',key)
        print(json.dumps({'http':status,'runs':[{'id':r['id'],'status':r['status'],'requested_at':r['requested_at'],'counts':r['counts'],'error_code':r['error_code']} for r in data]}))
    else:raise ValueError('PHASE')
