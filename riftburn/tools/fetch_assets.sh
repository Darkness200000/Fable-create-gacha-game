#!/usr/bin/env bash
# Rebuild public/assets from the source generations listed in design/assets.json.
# Needs python3 with pillow + numpy (+ scipy), and optionally ffmpeg for a
# cleaner music loop. A file that can't be fetched is skipped with a warning —
# the game then draws its code-made stand-in for that one asset.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p raw public/assets
python3 - <<'PY'
import json, pathlib, urllib.request
m = json.load(open("design/assets.json"))
jobs = [(a["raw"], a["src"]) for a in m["assets"]] + [("music.m4a", m["music"]["src"])]
for raw, src in jobs:
    dest = pathlib.Path("raw") / raw
    if dest.exists() and dest.stat().st_size:
        continue
    try:
        req = urllib.request.Request(m["base"] + src, headers={"User-Agent": "curl/8"})
        dest.write_bytes(urllib.request.urlopen(req, timeout=90).read())
        print("fetched", raw)
    except Exception as err:
        print("WARNING: could not fetch", raw, "-", err)
PY
python3 tools/build_assets.py design/assets.json raw public/assets
if [ -s raw/music.m4a ]; then
  # cross-fade the tail into the head so the track loops without a seam
  if command -v ffmpeg >/dev/null && ffmpeg -hide_banner -loglevel error -y -i raw/music.m4a -filter_complex \
      "[0]atrim=1.2:28.8,asetpts=N/SR/TB[body];[0]atrim=28.8:30,asetpts=N/SR/TB[tail];[0]atrim=0:1.2,asetpts=N/SR/TB[head];[tail][head]acrossfade=d=1.2:c1=tri:c2=tri[x];[body][x]concat=n=2:v=0:a=1[o]" \
      -map "[o]" -c:a aac -b:a 128k public/assets/music.m4a; then
    echo "music: looped"
  else
    cp raw/music.m4a public/assets/music.m4a
    echo "music: copied as-is"
  fi
fi
ls -la public/assets
