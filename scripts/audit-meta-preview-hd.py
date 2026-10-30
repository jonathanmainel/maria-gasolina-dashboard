"""Local, read-only media audit. No credentials, Graph requests or Storage writes.

Inputs: explicit case allowlist and sanitized Graph evidence exported from an
authorized session. Never pass access tokens/cookies in either JSON input.
Only a measured file can meet the pixel floor; visual approval remains manual.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from PIL import Image

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 40_000_000


def trusted(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme == 'https' and p.port in (None, 443) and not p.username and not p.password and bool(p.hostname) and p.hostname.endswith(('.fbcdn.net', '.cdninstagram.com', '.fbsbx.com'))


class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not trusted(newurl):
            raise ValueError('untrusted_redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def dimensions(data):
    with Image.open(io.BytesIO(data)) as im:
        if im.width * im.height > MAX_PIXELS or im.format not in ('JPEG', 'PNG', 'WEBP', 'GIF', 'AVIF'):
            raise ValueError('unsupported_image')
        im.load()  # Validate the actual full raster, not API dimensions or a header.
        return im.width, im.height


def cache_key(uri):
    p = urllib.parse.urlsplit(uri)
    transforms = [(k,v) for k,v in urllib.parse.parse_qsl(p.query) if k in ('stp','width','height','crop','format','quality','efg')]
    identity = p.netloc + p.path + '?' + urllib.parse.urlencode(sorted(transforms))
    return hashlib.sha256(identity.encode()).hexdigest()[:16]


def quality(width, height, ratio=9 / 16):
    if ratio is None:
        return 'insuficiente' if min(width,height) < 720 else 'proporção não confirmada'
    if not width or not height or not math.isfinite(ratio) or ratio <= 0:
        return 'insuficiente'
    if abs((width / height) / ratio - 1) > .035:
        return 'proporção divergente'
    # Common ratios have explicit pixel floors. Preserve the supplied orientation.
    r = min(ratio, 1 / ratio)
    if abs(r / (9 / 16) - 1) <= .035:
        floors = ((1080, 1920, 'Full HD'), (720, 1280, 'HD'))
    elif abs(r - 1) <= .035:
        floors = ((1080, 1080, 'Full HD'), (720, 720, 'HD'))
    elif abs(r / .8 - 1) <= .035:
        floors = ((1080, 1350, 'Full HD'), (720, 900, 'HD'))
    else:
        floors = ((1080, math.ceil(1080 / r), 'Full HD'), (720, math.ceil(720 / r), 'HD'))
    short, long = sorted((width, height))
    return next((name for s, l, name in floors if short >= s and long >= l), 'insuficiente')


def jobs_for(cases, evidence):
    owners = {}
    for c in cases:
        for key in ('ad_id', 'creative_id', 'video_id', 'account_id'):
            if not re.fullmatch(r'\d{1,30}', str(c.get(key, ''))):
                raise ValueError('invalid_identity')
        owners.setdefault(c['video_id'], []).append(c)
    jobs = []
    for video in evidence['videos']:
        # An unrelated/crossposted ID must be separately approved and added to the
        # allowlist. Matching captions, a person or resolution never implies identity.
        if video['video_id'] not in owners:
            continue
        if len(video.get('thumbnails', [])) > 320:
            raise ValueError('candidate_limit')
        native = next((f for f in video.get('formats', []) if f.get('filter') == 'native'), {})
        nw, nh = native.get('width'), native.get('height')
        ratio = nw / nh if isinstance(nw, (int, float)) and isinstance(nh, (int, float)) and nw > 0 and nh > 0 else None
        seen = set()
        for index, thumb in enumerate(video.get('thumbnails', [])):
            if thumb['uri'] in seen:
                continue
            seen.add(thumb['uri'])
            jobs.append(dict(video_id=video['video_id'], index=index, uri=thumb['uri'], source=thumb.get('source','video.thumbnails'), owners=owners[video['video_id']], declared_width=thumb.get('width'), declared_height=thumb.get('height'), preferred=bool(thumb.get('is_preferred')), ratio=ratio))
    if len(jobs) > 640:
        raise ValueError('batch_limit_split_manifest')
    return jobs


def audit_one(job, output):
    record = {k: v for k, v in job.items() if k not in ('uri', 'owners')}
    record.update(source=job.get('source','video.thumbnails'), human_review='pendente', owners=[{k: c[k] for k in ('ad_id', 'creative_id', 'account_id')} for c in job['owners']])
    try:
        if not trusted(job['uri']):
            raise ValueError('untrusted_url')
        path = output / 'media' / f"{job['video_id']}-{cache_key(job['uri'])}.jpg"
        if path.exists():
            data = path.read_bytes()
            if len(data) > MAX_BYTES:
                raise ValueError('size_limit')
            record['download'] = 'reused_local'
        else:
            deadline = time.monotonic() + 30
            opener = urllib.request.build_opener(Redirects())
            with opener.open(job['uri'], timeout=15) as response:
                chunks, size = [], 0
                while True:
                    chunk = response.read(min(65536, MAX_BYTES + 1 - size))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    size += len(chunk)
                    if size > MAX_BYTES or time.monotonic() > deadline:
                        raise ValueError('download_limit')
                data = b''.join(chunks)
            record['download'] = 'downloaded'
        width, height = dimensions(data)
        if not path.exists():
            path.write_bytes(data)
        record.update(status='validated', width=width, height=height, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), file=str(path.relative_to(output)).replace('\\', '/'), quality=quality(width, height, job['ratio']))
    except Exception as e:
        # Do not emit signed URLs or transport exception bodies.
        record.update(status='failed', error=f'http_{e.code}' if isinstance(e, urllib.error.HTTPError) else str(e) if isinstance(e, ValueError) else type(e).__name__)
    return record


def run(cases_path, evidence_path, output):
    cases = json.loads(cases_path.read_text(encoding='utf-8'))
    evidence = json.loads(evidence_path.read_text(encoding='utf-8'))
    output.mkdir(parents=True, exist_ok=True)
    (output / 'media').mkdir(exist_ok=True)
    jobs = jobs_for(cases, evidence)
    results = list(ThreadPoolExecutor(max_workers=3).map(lambda j: audit_one(j, output), jobs))
    report = dict(mode='local_read_only', audited_at=datetime.now(timezone.utc).isoformat(), source_retrieved_at=evidence.get('retrieved'), human_review='required', results=results)
    (output / 'measured.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for c in cases:
        valid = [r for r in results if r['video_id'] == c['video_id'] and r['status'] == 'validated']
        print(json.dumps(dict(ad_id=c['ad_id'], files=len(valid), best_pixels=sorted([(r['width'], r['height']) for r in valid], key=lambda d: d[0]*d[1], reverse=True)[:3]), ensure_ascii=False), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.cases, args.evidence, args.output)
