#!/usr/bin/env python3
"""Compatibility entry point; the canonical audit is audit_product.py."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


if __name__ == "__main__":
    canonical = Path(__file__).with_name("audit_product.py")
    print("NOTICE audit_guide.py is deprecated; forwarding to audit_product.py")
    raise SystemExit(subprocess.call([sys.executable, str(canonical), *sys.argv[1:]]))
