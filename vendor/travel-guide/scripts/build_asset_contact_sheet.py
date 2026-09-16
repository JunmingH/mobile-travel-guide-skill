#!/usr/bin/env python3
"""Build a labelled contact sheet for manual place/image identity review."""
from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size: int):
    candidates = [
        Path("C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("asset_root", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=3)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    assets = manifest.get("assets", [])
    cols = max(1, args.columns)
    cell_w, image_h, label_h = 440, 280, 120
    rows = max(1, (len(assets) + cols - 1) // cols)
    sheet = Image.new("RGB", (cell_w * cols, (image_h + label_h) * rows), "#f4f0e8")
    draw = ImageDraw.Draw(sheet)
    title_font, body_font = font(18), font(13)
    for index, asset in enumerate(assets):
        x = (index % cols) * cell_w
        y = (index // cols) * (image_h + label_h)
        path = args.asset_root / str(asset.get("file", ""))
        try:
            with Image.open(path) as source:
                source = source.convert("RGB")
                source.thumbnail((cell_w - 20, image_h - 20))
                px = x + (cell_w - source.width) // 2
                py = y + (image_h - source.height) // 2
                sheet.paste(source, (px, py))
        except Exception:
            draw.rectangle((x + 10, y + 10, x + cell_w - 10, y + image_h - 10), fill="#d9d5cc")
            draw.text((x + 24, y + 120), "MISSING / UNDECODABLE", fill="#8b2f2f", font=title_font)
        label = f'{asset.get("place_id", "?")} · {asset.get("venue", "?")}'
        draw.text((x + 14, y + image_h + 8), label, fill="#173b35", font=title_font)
        source_text = str(asset.get("source_page", ""))
        evidence = f'source-bound={asset.get("source_identity_bound", False)} · visual={asset.get("visually_confirmed", False)} · watermark={asset.get("watermark_checked", False)} · verified={asset.get("subject_verified", False)}'
        draw.multiline_text((x + 14, y + image_h + 38), "\n".join(textwrap.wrap(source_text, 55)[:2]), fill="#465c57", font=body_font, spacing=3)
        draw.text((x + 14, y + image_h + 92), evidence, fill="#765c32", font=body_font)
        draw.rectangle((x, y, x + cell_w - 1, y + image_h + label_h - 1), outline="#c9c2b5", width=1)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, quality=92)
    index_records = [
        {
            "asset_index": index + 1,
            "row": index // cols + 1,
            "column": index % cols + 1,
            "file": asset.get("file"),
            "place_id": asset.get("place_id"),
            "venue": asset.get("venue"),
        }
        for index, asset in enumerate(assets)
    ]
    sidecar = args.output.with_suffix(args.output.suffix + ".json")
    sidecar.write_text(json.dumps({"contact_sheet": str(args.output), "columns": cols, "assets": index_records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS contact sheet: {args.output} ({len(assets)} assets)")
    print(f"PASS contact sheet index: {sidecar}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
