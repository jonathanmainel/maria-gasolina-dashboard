"""Prepare private source configuration from official evidence and measured bytes.

No credentials, network, deployment or writes to Supabase. Output is a proposal,
never permission to dispatch. Ad IDs come exclusively from the supplied cases.
"""
import argparse,hashlib,importlib.util,json
from pathlib import Path

spec=importlib.util.spec_from_file_location('media_audit',Path(__file__).with_name('audit-meta-preview-hd.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

def prepare(cases,evidence,identities,snapshots,measured,media_root,previous):
 entries={e['ad_id']:e for e in previous['entries']};proposals=[];blocked=[]
 assert len(cases)<=50 and len({a['ad_id'] for a in cases})==len(cases),'CASE_SCOPE_INVALID'
 for case in cases:
  ad=case['ad_id'];creative=case['creative_id'];video=case['video_id'];account=case['account_id']
  identity=identities[ad];effective=identity['creative']
  ids=[effective.get('video_id'),effective.get('object_story_spec',{}).get('video_data',{}).get('video_id')]
  ids += [v.get('video_id') or v.get('id') for v in effective.get('asset_feed_spec',{}).get('videos',[])]
  ids={x for x in ids if x}
  assert identity['id']==ad and identity['account_id']==account and effective['id']==creative and ids=={video},'OFFICIAL_IDENTITY_MISMATCH'
  assert effective.get('object_type')=='VIDEO' and not effective.get('asset_feed_spec'),'REPRESENTATION_AMBIGUOUS'
  v=next(v for v in evidence['videos'] if v['video_id']==video)
  assert v.get('pagination_complete') is True,'OFFICIAL_COLLECTION_INCOMPLETE'
  native=next(f for f in v['formats'] if f.get('filter')=='native');nw=native['width'];nh=native['height']
  row=next(r for r in snapshots if r['entity_id']==ad and r['account_id']==account)
  assert row['creative_id']==creative and row['metadata']['video_id']==video,'CURRENT_IDENTITY_MISMATCH'
  eligible=[m for m in measured['results'] if m['video_id']==video and m['status']=='validated' and m['width']<=nw and m['height']<=nh and audit.quality(m['width'],m['height'],nw/nh) in ['HD','Full HD']]
  if not eligible:
   blocked.append({'ad_id':ad,'reason':'no_measured_hd_file_within_official_native','native':[nw,nh]});continue
  eligible.sort(key=lambda m:(m['width']*m['height'],m.get('preferred',False)),reverse=True);best=eligible[0]
  thumb=v['thumbnails'][best['index']];url=thumb['uri'];assert audit.trusted(url),'UNTRUSTED_CDN'
  data=(media_root/best['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==best['sha256'],'MEASURED_HASH_MISMATCH'
  assert audit.dimensions(data)==(best['width'],best['height']),'MEASURED_DIMENSIONS_MISMATCH'
  with audit.Image.open(media_root/best['file']) as image:mime=audit.Image.MIME[image.format]
  assert mime in ['image/jpeg','image/png','image/webp','image/gif'],'MIME_INVALID'
  entry={'client_id':row['client_id'],'source':'meta_ads','account_id':account,'ad_id':ad,'creative_id':creative,'video_id':video,'asset_key':'video:'+video,'sha256':best['sha256'],'width':best['width'],'height':best['height'],'mime':mime,'url':url,'previous':{'creative_id':creative,'video_id':video,'asset_key':row['metadata'].get('preview_asset_key'),'sha256':row['preview_sha256'],'path':row['preview_storage_path'],'updated_at':row['updated_at'],'mime':row['preview_mime_type'],'metadata':row['metadata']}}
  entries[ad]=entry
  proposals.append({'ad_id':ad,'creative_id':creative,'video_id':video,'sha256':best['sha256'],'width':best['width'],'height':best['height'],'mime':mime,'native':[nw,nh],'thumbnail_id':thumb.get('id'),'collection_count':len(v['thumbnails'])})
 assert len(entries)<=50,'SOURCE_CONFIGURATION_LIMIT'
 return {'version':1,'entries':list(entries.values())},{'mode':'private_proposal_only','dispatch_authorized':False,'proposals':proposals,'blocked':blocked,'existing_entries_preserved':len(previous['entries'])}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for name in ['cases','evidence','identities','snapshots','measured','previous','out']:p.add_argument('--'+name,type=Path,required=True)
 args=p.parse_args();read=lambda path:json.loads(path.read_text(encoding='utf-8-sig'))
 manifest,report=prepare(read(args.cases),read(args.evidence),read(args.identities),read(args.snapshots),read(args.measured),args.measured.parent,read(args.previous))
 raw=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_bytes(raw)
 client=manifest['entries'][0]['client_id'];pin={'path':f'{client}/meta_ads/approved-sources/{digest}.json','sha256':digest,'ad_ids':[e['ad_id'] for e in manifest['entries']]}
 args.out.with_suffix('.pin.json').write_text(json.dumps(pin,indent=2),encoding='utf-8');args.out.with_suffix('.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'sources':len(manifest['entries']),'eligible':len(report['proposals']),'blocked':report['blocked'],'manifest_sha256':digest,'dispatch_authorized':False}))
