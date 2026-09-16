#!/usr/bin/env python3
"""Verify that research parallelism never crosses dependency barriers."""
from research_status import select_phase_batch


def main() -> int:
    ids = ["framing", "places-core", "places-shopping", "places-experiences", "places-food", "itinerary", "modules-discovery", "modules-practical", "modules-language-notes"]
    pending = [{"id": item} for item in ids]
    phase, batch = select_phase_batch(pending, 2)
    assert (phase, [x["id"] for x in batch]) == (1, ["framing"])
    pending = [x for x in pending if x["id"] != "framing"]
    phase, batch = select_phase_batch(pending, 2)
    assert (phase, [x["id"] for x in batch]) == (2, ["places-core", "places-shopping"])
    pending = [x for x in pending if x["id"] not in {"places-core", "places-shopping"}]
    phase, batch = select_phase_batch(pending, 2)
    assert (phase, [x["id"] for x in batch]) == (3, ["places-experiences", "places-food"])
    pending = [x for x in pending if x["id"] not in {"places-experiences", "places-food"}]
    phase, batch = select_phase_batch(pending, 2)
    assert (phase, [x["id"] for x in batch]) == (4, ["itinerary"])
    print("PASS research queue preserves dependency barriers and safe parallel pairs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
