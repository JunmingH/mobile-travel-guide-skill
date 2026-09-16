#!/usr/bin/env python3
"""Regression check for the bounded four-option experience fallback."""
from __future__ import annotations

import json
from pathlib import Path

from validate_research_pack import validate


ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    discovery = {
        "experience_mode": "constrained",
        "shopping": [{"title": "购物", "items": [{"place_id": "shop-1"}]}],
        "experiences": [
            {"title": "演出", "items": [{"place_id": "exp-1"}, {"place_id": "exp-2"}]},
            {"title": "手作", "items": [{"place_id": "exp-3"}, {"place_id": "exp-4"}]},
        ],
    }
    errors = validate("modules-discovery", discovery)
    assert not errors, errors
    broken = {**discovery, "experiences": discovery["experiences"][:1]}
    assert validate("modules-discovery", broken), "incomplete constrained inventory must fail"
    schema = json.loads((ROOT / "assets" / "destination-profile.schema.json").read_text(encoding="utf-8"))
    modes = schema["properties"]["trip"]["properties"]["experience_mode"]["enum"]
    assert "constrained" in modes, modes
    print("PASS constrained experience fallback accepts 2x2 and rejects incomplete inventory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
