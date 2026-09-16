#!/usr/bin/env python3
"""Keep only Google restaurant ratings for the Standard handbook profile."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbench", type=Path)
    args = parser.parse_args()
    path = args.workbench.resolve() / "research/places/restaurants.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    places = payload if isinstance(payload, list) else payload.get("places", [])
    changed = 0
    for place in places:
        ratings = place.get("ratings", [])
        google = [item for item in ratings if str(item.get("platform", "")).lower() == "google"]
        if google != ratings:
            place["ratings"] = google
            changed += 1
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS normalized {changed} restaurant records to Google-only ratings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
