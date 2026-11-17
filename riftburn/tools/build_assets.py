#!/usr/bin/env python3
"""Turn the raw generated art into game-ready files.

  python3 tools/build_assets.py <manifest.json> <raw_dir> <out_dir> [--sheet contact.jpg]

Sprites are generated on a green backdrop (image models cannot output alpha),
so each one is chroma-keyed, despilled, cropped to its subject, squared and
resized. Floors are made seamless by cross-blending their wrapped edges.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def key_green(img, work=1024):
    img = img.convert("RGB").resize((work, work), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    other = np.maximum(r, b)
    green = g - other
    ratio = g / (other + 1.0)
    score = np.minimum((ratio - 1.08) / 0.22, green / 26.0)
    alpha = 1.0 - np.clip(score, 0.0, 1.0)
    # despill: no kept pixel may be greener than its strongest other channel
    spill = (alpha < 0.999) | (green > 0)
    g2 = np.where(spill, np.minimum(g, other), g)
    al = Image.fromarray((alpha * 255).astype(np.uint8))
    # open (erode then dilate) to drop specks, then a hair of feathering
    al = al.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    am = np.asarray(al).astype(np.float32) / 255.0
    am = np.minimum(am, alpha)  # never re-admit keyed pixels
    out = np.dstack([r, g2, b, am * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def keep_main(img):
    """Drop stray islands far from the subject (needs scipy; skipped without)."""
    try:
        from scipy import ndimage
    except Exception:
        return img
    a = np.asarray(img).copy()
    mask = a[..., 3] > 96
    labels, n = ndimage.label(mask)
    if n <= 1:
        return img
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= sizes.max() * 0.03
    grown = ndimage.binary_dilation(keep[labels], iterations=6)
    a[..., 3] = np.where(grown, a[..., 3], 0)
    return Image.fromarray(a, "RGBA")


def fit_square(img, size, rot=0, pad=0.04):
    if rot:
        img = img.rotate(rot, expand=True, resample=Image.BICUBIC)
    bbox = Image.fromarray((np.asarray(img)[..., 3] > 24).astype(np.uint8) * 255).getbbox()
    img = img.crop(bbox)
    side = int(max(img.size) * (1 + pad * 2))
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def seamless(img, size=512, darken=1.0):
    img = img.convert("RGB").resize((size, size), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    band = size // 6
    ramp = np.linspace(0.0, 1.0, band, dtype=np.float32)
    # blend each edge band with the opposite edge so the wrap is continuous
    for axis in (0, 1):
        a = np.swapaxes(a, 0, axis)
        head = a[:band].copy()
        tail = a[-band:].copy()
        w = ramp[:, None, None]
        a[:band] = head * (0.5 + 0.5 * w) + tail[::-1] * (0.5 - 0.5 * w)
        a[-band:] = tail * (1 - 0.5 * w) + head[::-1] * (0.5 * w)
        a = np.swapaxes(a, 0, axis)
    return Image.fromarray(np.clip(a * darken, 0, 255).astype(np.uint8), "RGB")


def main():
    manifest = json.loads(Path(sys.argv[1]).read_text())
    raw, out = Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    sheet_path = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    thumbs = []
    for row in manifest["assets"]:
        src = raw / row["raw"]
        if not src.exists():
            print("skip (missing raw):", row["id"])
            continue
        if row["type"] == "sprite":
            img = fit_square(keep_main(key_green(Image.open(src))), row.get("size", 256), row.get("rot", 0))
            img.save(out / f"{row['id']}.png", optimize=True)
            bg = Image.new("RGBA", img.size, (30, 36, 70, 255))
            thumbs.append((row["id"], Image.alpha_composite(bg, img).convert("RGB")))
        elif row["type"] == "floor":
            img = seamless(Image.open(src), 512, row.get("darken", 1.0))
            img.save(out / f"{row['id']}.jpg", quality=84, optimize=True)
            two = Image.new("RGB", (512, 512))
            half = img.resize((256, 256))
            for x in (0, 256):
                for y in (0, 256):
                    two.paste(half, (x, y))
            thumbs.append((row["id"], two))
        elif row["type"] == "image":
            img = Image.open(src).convert("RGB")
            w = row.get("width", 1600)
            img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
            img.save(out / f"{row['id']}.jpg", quality=row.get("quality", 84), optimize=True, progressive=True)
            thumbs.append((row["id"], img))
        print("ok", row["id"])
    if sheet_path and thumbs:
        cell = 256
        cols = 5
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * cell), (10, 12, 24))
        for i, (_, im) in enumerate(thumbs):
            im = im.copy()
            im.thumbnail((cell, cell))
            sheet.paste(im, ((i % cols) * cell + (cell - im.width) // 2, (i // cols) * cell + (cell - im.height) // 2))
        sheet.save(sheet_path, quality=74)


if __name__ == "__main__":
    main()
