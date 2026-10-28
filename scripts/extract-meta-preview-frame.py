"""Explicit local fallback for an authorized video, only without an official HD thumbnail.

No network, credentials, upscale, upload or database writes. Outputs need visual review.
Requires Pillow and a trusted local FFmpeg binary supplied by the operator.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-meta-preview-hd.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

def extract(cases, measurements, video_id, video_file, ffmpeg, output):
    owners=[c for c in cases if c.get('video_id')==video_id]
    if not owners:raise ValueError('video_not_in_explicit_allowlist')
    official=[r for r in measurements['results'] if r.get('video_id')==video_id and r.get('source')=='video.thumbnails' and r.get('status')=='validated']
    if any(r.get('quality') in ('HD','Full HD') for r in official):
        return dict(video_id=video_id,result='skipped_official_hd_available',frames=[])
    if not official:raise ValueError('audit_official_thumbnails_before_frame_fallback')
    if video_file.stat().st_size>100*1024*1024:raise ValueError('video_size_limit')
    digest=hashlib.sha256(video_file.read_bytes()).hexdigest()
    folder=output/f'{video_id}-{digest[:16]}'
    folder.mkdir(parents=True,exist_ok=True)
    frames=[]
    for second in (.5,1,1.5,2,3):
        dest=folder/f'frame-{second}.png'
        if not dest.exists():
            subprocess.run([str(ffmpeg),'-nostdin','-hide_banner','-loglevel','error','-ss',str(second),'-i',str(video_file.resolve()),'-map','0:v:0','-frames:v','1','-n',str(dest.resolve())],check=True,timeout=45)
        data=dest.read_bytes();width,height=audit.dimensions(data)
        frames.append(dict(seconds=second,file=str(dest.resolve()),width=width,height=height,sha256=hashlib.sha256(data).hexdigest(),quality=audit.quality(width,height,width/height),human_review='pending'))
    result=dict(video_id=video_id,owners=[{k:c[k] for k in ('ad_id','creative_id','account_id')} for c in owners],video_sha256=digest,source='explicit_authorized_local_video',result='frames_for_review',frames=frames)
    (folder/'manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('cases','measurements','video-file','ffmpeg','output'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--video-id',required=True)
    args=p.parse_args()
    result=extract(json.loads(args.cases.read_text(encoding='utf-8')),json.loads(args.measurements.read_text(encoding='utf-8')),args.video_id,args.video_file,args.ffmpeg,args.output)
    print(json.dumps(result,ensure_ascii=False,indent=2))
