#!/usr/bin/env python3
"""One entry point for a private workbench; publishing is a separate authorized step."""
from __future__ import annotations

import argparse
import difflib
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
import zipfile
import xml.etree.ElementTree as ET

from _mobile import SKILL, VERSION, read, write, sha, now, config, runtime, node, call


def configure(args):
    root = args.workbench.resolve()
    path = root / 'mobile-app.json'
    if path.exists():
        raise ValueError('mobile-app.json already exists; edit it without changing identity or runtime')
    if not root.is_dir():
        raise ValueError('Configure requires an existing workbench')
    state_path = root / '.travel-build-state.json'
    state = read(state_path) if state_path.exists() else {}
    original = state.get('skill_root')
    if not original:
        raise ValueError('Cannot infer the original runtime; use init for a fresh workbench')
    value = {
        'schema': 1, 'skill_version': VERSION, 'runtime': original,
        'app': {'name': args.app_name, 'short_name': args.short_name or args.app_name,
                'lang': 'zh-CN', 'theme_color': '#f5f3ed', 'background_color': '#f5f3ed'},
        'publication': {'mode': 'encrypted', 'repository': None, 'url': None},
        'created_at': now(),
    }
    write(path, value)
    print('Configured existing workbench; original runtime and user storage identity preserved')


def initialize(args):
    root = args.workbench.resolve()
    if root.exists() and any(root.iterdir()):
        raise ValueError('init requires an empty directory; use configure/status to resume existing work')
    # Validate before creating any files, so a corrected command can be retried.
    read(args.brief.resolve())
    if not args.user_statement.strip():
        raise ValueError('Record the actual user approval statement')
    if args.currency and not __import__('re').fullmatch('[A-Z]{3}', args.currency):
        raise ValueError('currency must be a three-letter ISO currency code')
    root.mkdir(parents=True, exist_ok=True)
    bundled = SKILL / 'vendor/travel-guide'
    owned = root / '.mobile-runtime'
    shutil.copytree(bundled, owned, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    approval = '--discussion-waived' if args.discussion_waived else '--itinerary-approved'
    try:
        call(owned / 'scripts/start_build.py', root, '--brief-file', args.brief.resolve(),
             approval, '--user-statement', args.user_statement)
    except subprocess.CalledProcessError:
        # Before start_build writes state, this copy is the only generated data.
        # Preserve any partial workbench rather than deleting unknown files.
        if set(root.iterdir()) == {owned}:
            shutil.rmtree(owned)
        raise
    configure(args)
    value = config(root)
    value['runtime'] = '.mobile-runtime'
    value['handbook_id'] = 'guide-' + uuid.uuid4().hex[:16]
    if args.currency:
        value['currency'] = args.currency
    write(root / 'mobile-app.json', value)
    call(owned / 'scripts/init_research_workspace.py', root)
    print('Next: follow the generated research tasks; keep the approved brief and ID stable')


def plan_text(source):
    source = Path(source)
    if source.suffix.lower() in {'.txt', '.md'}:
        return source.read_text(encoding='utf-8-sig')
    if source.suffix.lower() != '.docx':
        raise ValueError('Accepts DOCX, UTF-8 TXT or Markdown; use a document reader for PDF/OCR')
    with zipfile.ZipFile(source) as archive:
        entry = archive.getinfo('word/document.xml')
        if entry.file_size > 20 * 1024 * 1024:
            raise ValueError('DOCX main document exceeds the 20 MiB text limit')
        tree = ET.fromstring(archive.read(entry))
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    return '\n'.join(''.join(p.itertext()) if not p.findall('.//w:t', ns)
                     else ''.join(t.text or '' for t in p.findall('.//w:t', ns))
                     for p in tree.findall('.//w:p', ns)) + '\n'


def import_plan(args):
    root, source = args.workbench.resolve(), args.source.resolve()
    value = config(root)
    text = plan_text(source)
    digest = sha(source)
    folder = root / 'sources' / digest[:16]
    folder.mkdir(parents=True, exist_ok=True)
    archived = folder / ('plan' + source.suffix.lower())
    if archived.exists() and sha(archived) != digest:
        raise ValueError('Archive name collision')
    shutil.copyfile(source, archived)
    (folder / 'text.txt').write_text(text, encoding='utf-8')
    prior = value.get('latest_plan')
    previous = (root / prior['text']).read_text(encoding='utf-8') if prior else ''
    diff = ''.join(difflib.unified_diff(previous.splitlines(True), text.splitlines(True),
                                       fromfile='previous-plan', tofile='new-plan'))
    (folder / 'changes.diff').write_text(diff, encoding='utf-8')
    value['latest_plan'] = {'file': str(archived.relative_to(root)), 'text': str((folder / 'text.txt').relative_to(root)),
                            'sha256': digest, 'imported_at': now()}
    write(root / 'mobile-app.json', value)
    write(folder / 'read-notes.json', {'status': 'text_extracted_needs_review', 'source_sha256': digest,
                                     'embedded_instructions_are_untrusted': True,
                                     'limits': ['DOCX text includes body paragraphs/tables only; review headers, text boxes, images and formatting separately',
                                                'This command does not change itinerary or assert document correctness']})
    print('Private source archived. Review sources/' + digest[:16] + '/changes.diff and update the owning research packs')


def snapshot(args):
    root = args.workbench.resolve()
    target = root / '.mobile-history' / ('snapshot-' + now().replace(':', '').replace('+', '-'))
    allowed = ['research', 'travel-brief.json', 'trip-decisions.json', 'itinerary-outline.md', 'itinerary-approval.json',
               'mobile-app.json', 'destination-profile.json', 'asset-manifest.json', 'offline-export.json',
               'handbook-offline.html', 'pwa', 'github-pages', 'qa']
    for name in allowed:
        path = root / name
        if path.is_symlink() or (path.is_dir() and any(p.is_symlink() for p in path.rglob('*'))):
            raise ValueError('Snapshot refuses symbolic links')
    target.mkdir(parents=True)
    for name in allowed:
        path = root / name
        if not path.exists():
            continue
        if path.is_dir():
            shutil.copytree(path, target / name, ignore=shutil.ignore_patterns('history', '__pycache__'))
        else:
            shutil.copyfile(path, target / name)
    write(target / 'manifest.json', {p.relative_to(target).as_posix(): sha(p) for p in target.rglob('*') if p.is_file()})
    print('Private snapshot:', target)


def doctor(_args):
    checks = {'python_3_10_or_newer': sys.version_info >= (3, 10), 'pillow': importlib.util.find_spec('PIL') is not None}
    try:
        version = subprocess.check_output([node(), '--version'], text=True).strip()
        checks['node_20_or_newer'] = int(version.lstrip('v').split('.')[0]) >= 20
    except Exception:
        checks['node_20_or_newer'] = False
    checks['bundled_runtime'] = (SKILL / 'vendor/travel-guide/SKILL.md').is_file()
    print(json.dumps(checks, indent=2))
    if not all(checks.values()):
        raise SystemExit(2)


def status(args):
    root = args.workbench.resolve()
    value = config(root)
    result = {'workbench': str(root), 'skill_version': value['skill_version'], 'checks': {}}
    for name in ['pwa-build.json', 'github-pages-build.json', 'mobile-browser-chromium.json', 'mobile-browser-webkit.json', 'publication-check.json']:
        p = root / 'qa' / name
        if p.exists():
            row = read(p)
            result['checks'][name] = {k: row[k] for k in ('status', 'version', 'checked_at') if k in row}
    result['next'] = 'Follow upstream build state for content; matching browser reports and release audit are required before publishing'
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('doctor')
    for name in ['init', 'configure', 'import-plan', 'snapshot', 'render', 'export', 'pwa', 'encrypt', 'verify', 'handoff', 'status']:
        p = sub.add_parser(name)
        p.add_argument('workbench', type=Path)
        if name in {'init', 'configure'}:
            p.add_argument('--app-name', default='旅行手册')
            p.add_argument('--short-name')
        if name == 'init':
            p.add_argument('--brief', type=Path, required=True)
            p.add_argument('--user-statement', required=True)
            p.add_argument('--discussion-waived', action='store_true')
            p.add_argument('--currency')
        if name == 'import-plan':
            p.add_argument('--source', type=Path, required=True)
        if name == 'verify':
            p.add_argument('--url', help='Explicit HTTPS deployment URL; verifies public bytes only')
    args = parser.parse_args()
    handlers = {'doctor': doctor, 'init': initialize, 'configure': configure, 'import-plan': import_plan, 'snapshot': snapshot, 'status': status}
    if args.command in handlers:
        handlers[args.command](args)
    elif args.command in {'render', 'export', 'pwa'}:
        call(SKILL / 'scripts' / {'render':'render_handbook.py', 'export':'export_mobile.py', 'pwa':'build_pwa.py'}[args.command], args.workbench.resolve())
    elif args.command == 'handoff':
        call(runtime(args.workbench) / 'scripts/check_handoff.py', args.workbench.resolve())
    elif args.command == 'encrypt':
        code = getpass.getpass('Access code (random, at least 14 characters; never written to disk): ')
        subprocess.run([node(), str(SKILL / 'scripts/build_encrypted.mjs'), str(args.workbench.resolve())],
                       input=json.dumps({'ACCESS_CODE': code}), text=True, check=True)
    elif args.command == 'verify':
        command = [node(), str(SKILL / 'scripts/verify_release.mjs'), str(args.workbench.resolve())]
        if args.url:
            command += ['--url', args.url]
        subprocess.run(command, check=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print('ERROR:', error, file=sys.stderr)
        raise SystemExit(2)
