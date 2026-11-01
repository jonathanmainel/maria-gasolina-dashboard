"""Build a read-only discovery plan from an existing video inventory.

No credentials, network requests, approvals, queue dispatch or Storage writes.
The inventory is evidence, not authorization. Fresh identities and decoded media
must still be verified by the existing audit and selective reservation protocol.
"""
import argparse
import json
from pathlib import Path
import re

ID = re.compile(r"\d{1,30}\Z")


def plan(inventory):
    videos = []
    seen = set()
    for row in inventory:
        if row.get("creative_type") != "video" and row.get("preview_media_type") != "video" and row.get("preview_kind") != "video_thumbnail":
            continue
        identity = {k: str(row.get(k) or "") for k in ("account_id", "ad_id", "creative_id", "video_id")}
        if not all(ID.fullmatch(v) for v in identity.values()):
            raise ValueError("video_identity_missing_or_invalid")
        key = (identity["account_id"], identity["ad_id"])
        if key in seen:
            raise ValueError("duplicate_ad_identity")
        seen.add(key)
        try:
            w, h = int(row.get("width") or 0), int(row.get("height") or 0)
        except (ValueError, TypeError):
            w, h = 0, 0
        video = identity["video_id"]
        videos.append({**identity, "eligible": True,
            "priority": "below_hd" if min(w, h) < 720 else "verify_existing_quality",
            "existing": {"width": w, "height": h, "sha256": row.get("preview_sha256"), "source": row.get("preview_source")},
            "discovery": [
                f"/{identity['ad_id']}?fields=id,account_id,creative{{id,object_type,video_id,object_story_spec,asset_feed_spec}}",
                f"/{video}?fields=id,format,picture",
                f"/{video}/thumbnails?fields=id,uri,width,height,is_preferred&limit=50",
            ],
            "official_creative_fallback": "only_with_fresh_exact_identity_and_proven_native_hd_dimensions",
            "approval": "not_granted", "result": "pending_discovery"})
    videos.sort(key=lambda r: (r["priority"] != "below_hd", r["account_id"], r["ad_id"]))
    # Existing request protocol accepts at most 50 ads per reservation. This is a
    # discovery list only; each future reservation still needs explicit hashes.
    batches = [videos[i:i + 50] for i in range(0, len(videos), 50)]
    return {"mode": "local_read_only", "automatic_dispatch": False, "videos": videos,
        "discovery_batches": [[r["ad_id"] for r in b] for b in batches],
        "summary": {"eligible": len(videos), "below_hd": sum(r["priority"] == "below_hd" for r in videos)}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.inventory.read_text(encoding="utf-8"))
    result = plan(data["inventory"] if isinstance(data, dict) else data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    cases = [{k: row[k] for k in ("account_id", "ad_id", "creative_id", "video_id")} for row in result["videos"]]
    args.output.with_name(args.output.stem + ".cases.json").write_text(json.dumps(cases, indent=2), encoding="utf-8")
    print(json.dumps(result["summary"]))
