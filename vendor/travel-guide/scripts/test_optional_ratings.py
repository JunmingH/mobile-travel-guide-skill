#!/usr/bin/env python3
"""Prove that a production-shaped profile remains complete with zero ratings."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def run(script: Path, *args: str) -> None:
    result = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("valid_profile", type=Path)
    args = parser.parse_args()
    profile = json.loads(args.valid_profile.read_text(encoding="utf-8"))
    profile.pop("test_fixture", None)
    for place in profile.get("places", []):
        place.pop("rating", None)
        place.pop("review_count", None)
        place.pop("rating_source", None)
        place.pop("ratings", None)
    scripts = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix="travel-no-rating-") as raw:
        root = Path(raw)
        workbench = root / "workbench"
        profile["render_bindings_file"] = "render-bindings.json"
        profile_path = root / "profile.json"
        bindings_path = root / "render-bindings.json"
        profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        run(scripts / "validate_destination_data.py", str(profile_path))
        run(scripts / "install_ui_system.py", str(workbench))
        run(scripts / "build_render_bindings.py", str(profile_path), str(bindings_path))
        run(scripts / "render_destination.py", str(profile_path), str(workbench))
        html = (workbench / "index.html").read_text(encoding="utf-8")
        if "评分暂不展示" in html or "未取得可核实数据" in html or 'aria-hidden="true">★' in html:
            raise SystemExit("zero-rating output contains a rating placeholder or score")
        expected_sights = sum(1 for item in profile.get("places", []) if item.get("type") == "sight")
        expected_restaurants = sum(1 for item in profile.get("places", []) if item.get("type") == "restaurant")
        if html.count('class="sight-card') != expected_sights or html.count('class="restaurant"') != expected_restaurants:
            raise SystemExit("zero-rating output lost sight or restaurant cards")
        if "Google Maps" not in html:
            raise SystemExit("zero-rating output lost stable map actions")
    print("PASS production-shaped handbook validates and renders with zero Google ratings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
