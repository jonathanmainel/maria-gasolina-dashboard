"""Build only sync-meta-ads. Private manifest data is injected into server config, never Git.
This command packages files; it cannot deploy or write to Supabase.
"""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
p.add_argument('--isolated-base',type=Path);p.add_argument('--isolated-pin',type=Path)
args=p.parse_args()
raw=args.manifest.read_bytes();manifest=json.loads(raw);digest=hashlib.sha256(raw).hexdigest()
base='supabase/functions/sync-meta-ads/'
if args.isolated_base:
 assert args.isolated_pin
 pin=json.loads(args.isolated_pin.read_text(encoding='utf-8'))
 saved=json.loads(args.isolated_base.read_text(encoding='utf-8'))
 assert 'uwafdxsdsgqysjjxfywo' in saved['entrypoint_path']
 files=saved['files']
 for f in files:
  if f['name']==base+'index.ts':
   f['content']='import { homologEnv } from "../../../tests/homolog/transport.ts";\n'+(ROOT/f['name']).read_text(encoding='utf-8').replace('Deno.env.get(','homologEnv(')
  if f['name'] in [base+'meta-creative.ts',base+'preview-receipts.ts','supabase/functions/_shared/preview-operation.ts']:
   f['content']=(ROOT/f['name']).read_text(encoding='utf-8')
  if f['name']=='tests/homolog/preview-provider.ts':
   needle='if(video[2]){';assert f['content'].count(needle)==1
   f['content']=f['content'].replace(needle,needle+"return Response.json({error:{code:10}},{status:400});")
 package={'project_id':'uwafdxsdsgqysjjxfywo','name':'sync-meta-ads','entrypoint_path':'tests/homolog/sync-meta-ads.ts','import_map_path':base+'deno.json','verify_jwt':False,'files':files}
else:
 config=(ROOT/base/'approved-preview-manifest.ts').read_text(encoding='utf-8')
 pin=json.loads(re.search(r'export const APPROVED_PREVIEW_MANIFEST = (\{.*\});',config,re.S).group(1))
 names=[base+n for n in ['index.ts','meta-ads.ts','meta-creative.ts','preview-media.ts','preview-receipts.ts','receipt-preview-source.ts','official-creative-thumbnail.ts','deno.json']]+['supabase/functions/_shared/'+n for n in ['dashboard.ts','ingestion.ts','sync-control.ts','preview-operation.ts']]
 package={'project_id':'hlqrpreqvvxtkruwsolg','name':'sync-meta-ads','entrypoint_path':base+'index.ts','import_map_path':base+'deno.json','verify_jwt':False,'files':[{'name':n,'content':(ROOT/n).read_text(encoding='utf-8')} for n in names]}
for name in ['receipt-preview-source.ts','official-creative-thumbnail.ts']:
 key=base+name
 item=next((f for f in package['files'] if f['name']==key),None)
 if item: item['content']=(ROOT/key).read_text(encoding='utf-8')
 else: package['files'].append({'name':key,'content':(ROOT/key).read_text(encoding='utf-8')})
for f in package['files']:
 # Same packaging convention as published v18: no executable d.ts side-effect import.
 f['content']=f['content'].replace('import "@supabase/functions-js/edge-runtime.d.ts";', '// Type-only runtime declaration omitted from deployment package; executable source unchanged.')
assert pin['sha256']==digest and set(pin['ad_ids'])=={e['ad_id'] for e in manifest['entries']}
pin['data']=raw.decode('utf-8')
for item in [{'name':base+'approved-preview-source.ts','content':(ROOT/base/'approved-preview-source.ts').read_text(encoding='utf-8')},
 {'name':base+'approved-preview-manifest.ts','content':'// Package-private configuration. Do not publish its signed references.\nexport const APPROVED_PREVIEW_MANIFEST = '+json.dumps(pin,ensure_ascii=False)+';\n'}]:
 existing=next((f for f in package['files'] if f['name']==item['name']),None)
 if existing: existing['content']=item['content']
 else: package['files'].append(item)
assert len({f['name'] for f in package['files']})==len(package['files'])
args.out.parent.mkdir(parents=True,exist_ok=True)
data=json.dumps(package,ensure_ascii=False,separators=(',',':')).encode();args.out.write_bytes(data)
receipt={'project_id':package['project_id'],'function':'sync-meta-ads','files':len(package['files']),'package_sha256':hashlib.sha256(data).hexdigest(),'manifest_sha256':digest,'entries':len(manifest['entries']),'deploy_performed':False}
args.out.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt))
