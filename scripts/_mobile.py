"""Shared paths and atomic output helpers. No credentials are stored here."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

SKILL = Path(__file__).resolve().parent.parent
VERSION = '1.0.0'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def config(root):
    value = read(Path(root) / 'mobile-app.json')
    if value.get('schema') != 1:
        raise ValueError('Unsupported mobile-app.json schema')
    return value


def runtime(root):
    value = config(root)
    target = Path(value['runtime'])
    target = target if target.is_absolute() else Path(root) / target
    target = target.resolve()
    if not (target / 'scripts/start_build.py').is_file():
        raise ValueError('Original runtime is unavailable; restore it, do not substitute another version')
    state = Path(root) / '.travel-build-state.json'
    if state.exists() and Path(read(state)['skill_root']).resolve() != target:
        raise ValueError('Runtime differs from original build state; explicit migration required')
    return target


def node():
    result = os.environ.get('TRAVEL_GUIDE_NODE') or shutil.which('node')
    if not result:
        raise ValueError('Node.js 20+ required; set TRAVEL_GUIDE_NODE or put node on PATH')
    return result


def call(script, *args):
    subprocess.run([sys.executable, str(script), *map(str, args)], check=True)


def safe_generated(root, name):
    root = Path(root).resolve()
    target = root / name
    if target.is_symlink() or target.resolve().parent != root:
        raise ValueError('Generated output must be a direct workbench child')
    return target


def commit_directory(root, stage, name):
    """Swap a completely built output, preserving the previous generated release."""
    root, stage = Path(root).resolve(), Path(stage)
    target = safe_generated(root, name)
    old = None
    if target.exists():
        receipt = root / 'qa' / ('pwa-build.json' if name == 'pwa' else 'github-pages-build.json')
        if not receipt.is_file():
            raise ValueError('Existing output has no build receipt; move or inspect it explicitly first')
        expected = read(receipt)['files']
        actual = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
        if actual != set(expected) or any(p.is_symlink() for p in target.rglob('*')):
            raise ValueError('Output contains untracked files; refusing replacement')
        if any(sha(target / p) != h for p, h in expected.items()):
            raise ValueError('Output differs from its receipt; preserve or review edits first')
        old = root / '.mobile-history' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '-' + name)
        old.parent.mkdir(parents=True, exist_ok=True)
        target.rename(old)
    try:
        stage.rename(target)
    except Exception:
        if old is not None:
            old.rename(target)
        raise

