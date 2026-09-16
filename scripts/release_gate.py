#!/usr/bin/env python3
"""Require current, real reports before a travel release is published."""
import argparse
from pathlib import Path
from _mobile import read, sha, runtime, call


def check(root, require_live=False):
    root=Path(root).resolve()
    if (root/'TEST_FIXTURE.json').exists():
        raise ValueError('Synthetic fixture cannot be published as a real handbook')
    build=read(root/'qa/github-pages-build.json')
    for name,digest in build['files'].items():
        if Path(name).name!=name or sha(root/'github-pages'/name)!=digest:
            raise ValueError('Build bytes changed')
    for engine in ['chromium','webkit']:
        features=read(root/'qa'/f'mobile-features-{engine}.json')
        if (features.get('status')!='passed' or features.get('page_errors') or
            features.get('selected_tests') or len(features.get('checks',[])) < 12 or
            features.get('sha256')!=sha(root/'handbook-offline.html')):
            raise ValueError('Missing, incomplete or stale full-feature '+engine+' report')
        report=read(root/'qa'/f'mobile-browser-{engine}.json')
        if report.get('status')!='passed' or report.get('errors') or report.get('version')!=build['version'] or report.get('files')!=build['files']:
            raise ValueError('Missing, failed or stale '+engine+' report')
    audit=read(root/'qa/publication-check.json')
    if audit.get('status')!='passed' or audit.get('version')!=build['version'] or audit.get('files')!=build['files']:
        raise ValueError('Missing, failed or stale publication inventory check')
    pwa=read(root/'qa/pwa-build.json');updates=read(root/'qa/mobile-updates.json')
    if (updates.get('status')!='passed' or updates.get('errors') or
        updates.get('version')!=pwa['version'] or updates.get('files')!=pwa['files'] or
        any(sha(root/'pwa'/name)!=digest for name,digest in pwa['files'].items())):
        raise ValueError('Missing, failed or stale cache-update report')
    if require_live and (not audit.get('url') or audit.get('scope')!='public_inventory_and_live_hashes'):
        raise ValueError('Live HTTPS verification required')
    # Recompute the owning engine's source/media/export gates; never trust a stale boolean.
    call(runtime(root)/'scripts/check_handoff.py',root)
    print('MOBILE RELEASE GATE PASS:',build['version'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('workbench',type=Path);parser.add_argument('--require-live',action='store_true')
    args=parser.parse_args()
    try:check(args.workbench,args.require_live)
    except (ValueError,OSError,KeyError) as error:raise SystemExit('RELEASE BLOCKED: '+str(error))
