#!/usr/bin/env python3
"""Fail early when the selected Python cannot run the handbook pipeline."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def ensure_runtime() -> Path:
    if sys.version_info < (3, 10):
        raise SystemExit("RUNTIME PREFLIGHT FAILED: Python 3.10+ is required.")
    if importlib.util.find_spec("PIL") is None:
        raise SystemExit(
            "RUNTIME PREFLIGHT FAILED: this Python environment does not provide Pillow (PIL). "
            "Switch to an existing Python environment with Pillow, then rerun the same command. "
            "Do not restart the build or install packages automatically."
        )
    return Path(__file__).resolve().parent.parent


if __name__ == "__main__":
    root = ensure_runtime()
    print(f"RUNTIME PASS: {sys.executable}; skill_root={root}")
