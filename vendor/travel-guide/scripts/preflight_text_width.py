#!/usr/bin/env python3
"""Reject predictable cover-copy collisions before browser rendering."""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path


def normalized(value: object) -> str:
    return re.sub(r"[^\w\u3400-\u9fff]", "", str(value or "").casefold())


def visual_units(value: object) -> int:
    total = 0
    for char in str(value or "").strip():
        if char.isspace():
            total += 1
        elif unicodedata.east_asian_width(char) in {"W", "F", "A"}:
            total += 2
        else:
            total += 1
    return total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", type=Path)
    args = parser.parse_args()
    data = json.loads(args.profile.read_text(encoding="utf-8"))
    cover = data.get("cover", {}) if isinstance(data.get("cover"), dict) else {}
    title = cover.get("title") or data.get("display_name") or data.get("destination")
    subtitle = cover.get("subtitle") or cover.get("summary") or cover.get("lede")
    failures: list[str] = []
    title_key, subtitle_key = normalized(title), normalized(subtitle)
    if title_key and subtitle_key and len(title_key) >= 4 and (title_key in subtitle_key or subtitle_key in title_key):
        failures.append("cover title and subtitle/summary repeat the same normalized phrase")
    if visual_units(title) > 32:
        failures.append(f"cover title exceeds the 32-unit mobile width budget: {visual_units(title)}")
    if visual_units(subtitle) > 96:
        failures.append(f"cover subtitle/summary exceeds the 96-unit width budget: {visual_units(subtitle)}")
    if failures:
        print("TEXT WIDTH PREFLIGHT FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 2
    print("PASS cover copy has distinct title/subtitle and fits the pre-render width budget")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
