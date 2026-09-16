#!/usr/bin/env python3
"""Replace only reusable language fields while preserving authored local notes."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbench", type=Path)
    parser.add_argument("--language", default="japanese")
    args = parser.parse_args()
    skill_root = Path(__file__).resolve().parent.parent
    target = args.workbench.resolve() / "research/modules/language-notes.json"
    payload = json.loads(target.read_text(encoding="utf-8"))
    templates = json.loads((skill_root / "references/language-local-templates.json").read_text(encoding="utf-8"))
    fallback = json.loads((skill_root / "references/english-fallback-library.json").read_text(encoding="utf-8"))
    if args.language not in templates:
        raise SystemExit(f"unknown language template: {args.language}")
    language = payload.setdefault("language", {})
    language.update(templates[args.language])
    language["english_keyword_groups"] = fallback["english_keyword_groups"]
    language["english_phrase_groups"] = fallback["english_phrase_groups"]
    language.pop("_draft", None)
    language.pop("_review_required", None)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS applied {args.language} language template; destination-specific terms still require review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
