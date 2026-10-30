"""Read-only comparison of the approved corpus against current production Storage.

Never reserves work, calls collectors, uploads objects or modifies the database.
The existing production backend key is read only into memory; never persisted.
"""
import hashlib, io, json, subprocess, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REF = 'hlqrpreqvvxtkruwsolg'
ORIGIN = 'https://' + REF + '.supabase.co'
CORPUS = ROOT / 'artifacts/video-quality-review'
OUT = ROOT / 'artifacts/meta-preview-publicacao-20261029'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('READ_ONLY_STORAGE_REDIRECT_DENIED')

def inspect(data):
    with Image.open(io.BytesIO(data)) as image:
        assert image.width * image.height <= 40_000_000
        image.load()
        return {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                'width': image.width, 'height': image.height, 'format': image.format}

def main():
    approved = json.loads((CORPUS / 'manifest.json').read_text(encoding='utf-8-sig'))
    before = json.loads((OUT / 'production-previews-before.private.json').read_text(encoding='utf-8'))
    assert len(approved) == len(before) == 11
    assert {r['ad_id'] for r in before} == {r['ad_id'] for r in approved}
    result = subprocess.run([str((ROOT/'node_modules/.bin/supabase.cmd').resolve()),
        'projects','api-keys','--project-ref',REF,'--reveal','--output','json'],
        capture_output=True, text=True, check=True)
    keys = [k for k in json.loads(result.stdout) if k.get('type') == 'secret' and k.get('name') == 'default']
    assert len(keys) == 1
    key = keys[0]['api_key']
    rollback = OUT/'rollback'; rollback.mkdir(exist_ok=True)
    entries = []
    for c in approved:
        row = next(r for r in before if r['ad_id'] == c['ad_id'])
        assert row['client_id'] == 1 and row['source'] == 'meta_ads' and row['account_id'] == c['account_id']
        assert row['creative_id'] == c['creative_id'] and row['metadata']['video_id'] == c['video_id']
        path = row['preview_storage_path']
        assert path.startswith(f"1/meta_ads/{c['account_id']}/ad/{c['ad_id']}/") and '?' not in path and '..' not in path
        url = ORIGIN+'/storage/v1/object/authenticated/dashboard-creatives/'+quote(path,safe='/')
        request = urllib.request.Request(url, method='GET', headers={'apikey':key,'Authorization':'Bearer '+key})
        with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response:
            assert response.status == 200
            data = response.read(10*1024*1024+1)
            assert len(data) <= 10*1024*1024
        current = inspect(data)
        assert current['sha256'] == row['preview_sha256'] == c['current_sha256'], 'CURRENT_STORAGE_CHANGED'
        backup = rollback/f"{c['ad_id']}-{current['sha256']}.{current['format'].lower()}"
        backup.write_bytes(data)
        candidate = next(v for v in c['variants'] if v['kind'] == c['recommended'])
        proposed = inspect((CORPUS/candidate['file']).read_bytes())
        assert all(proposed[k] == candidate[k] for k in ['sha256','width','height','bytes'])
        preserve = c['recommended'] == 'stored'
        if preserve:
            assert c['name'] == 'CTV 1 - Depoimento' and proposed['sha256'] == current['sha256']
        else:
            assert proposed['width'] >= 720 and proposed['height'] >= 1280
            assert abs((proposed['width']/proposed['height'])/(9/16)-1) <= .035
            assert proposed['width']*proposed['height'] > current['width']*current['height']
        entries.append({'ad_id':c['ad_id'],'id':c['id'],'name':c['name'],'account_id':c['account_id'],
            'creative_id':c['creative_id'],'video_id':c['video_id'],'classification':c['classification'],
            'action':'preserve' if preserve else 'candidate','before_row':row,'current':current,
            'backup_file':str(backup),'proposed':proposed,'candidate_file':str(CORPUS/candidate['file'])})
    candidates = [e for e in entries if e['action']=='candidate']
    assert len(candidates)==10 and sum(e['classification']=='Full HD' for e in candidates)==5
    # One Full HD top-ranking creative and one HD creative exercise both floors.
    pilot_ids = ['120251781898970114','120246159821230114']
    def payload(items):
        return {'action':'request','client_slug':'maria-gasolina','sources':['meta_ads'],'operation':'previews',
            'request_key':'GENERATE_FRESH_UUID_AFTER_AUTHORIZATION',
            'preview_ad_ids':[e['ad_id'] for e in items],
            'preview_assets':[{'ad_id':e['ad_id'],'creative_id':e['creative_id'],'video_id':e['video_id'],
                'sha256':e['proposed']['sha256']} for e in items]}
    manifest = {'created_at':datetime.now(timezone.utc).isoformat(),'project_ref':REF,
        'production_writes':False,'storage_objects_downloaded':11,'entries':entries,
        'rollback_requires_authorized_exclusion_and_cas':True}
    (OUT/'rollback-manifest.private.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'pilot-request.private.json').write_text(json.dumps(payload([e for e in candidates if e['ad_id'] in pilot_ids]),indent=2),encoding='utf-8')
    (OUT/'remaining-request.private.json').write_text(json.dumps(payload([e for e in candidates if e['ad_id'] not in pilot_ids]),indent=2),encoding='utf-8')
    print(json.dumps({'production_writes':False,'current_objects_verified':11,'candidates':10,
        'full_hd':5,'hd':5,'preserved_ctv_1':True,'pilot_ad_ids':pilot_ids}))

if __name__=='__main__': main()
