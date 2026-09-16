#!/usr/bin/env python3
"""Fail closed on package inventory, accidental private files and credential patterns.

This is a release check, not a proof of absence of all possible sensitive text.
Review the resulting file list and changes before publishing.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

FILES={'SKILL.md','README.md','LICENSE','THIRD_PARTY_NOTICES.md','UPSTREAM.md','UPSTREAM.lock.json',
       'requirements.txt','package.json','package-lock.json','.gitignore'}
DIRS={'agents','assets','references','scripts','tests','vendor','.github'}
IGNORED={'.git','__pycache__','node_modules','.venv','.DS_Store','config.toml'}
PRIVATE_NAMES={'destination-profile.json','render-bindings.json','travel-brief.json','mobile-app.json',
               'offline-export.json','payload.json','.env','github-pages','pwa-build.json','sources','workbenches'}
EXTENSIONS={'.md','.json','.py','.js','.cjs','.mjs','.html','.css','.svg','.yaml','.yml','.patch','.txt','.sh','.sql','.ps1'}
PATTERNS={
  'github_token':re.compile(r'\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b'),
  'private_key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
}


def audit(root, deny=()):
    root=Path(root).resolve(); output={};errors=[]
    for path in sorted(root.rglob('*')):
        relative=path.relative_to(root);parts=relative.parts
        if any(p in IGNORED or p.endswith('.pyc') for p in parts):continue
        name=relative.as_posix()
        if path.is_symlink():errors.append(name+': symbolic link');continue
        if path.is_dir():
            if len(parts)==1 and parts[0] not in DIRS:errors.append(name+': unregistered directory')
            continue
        if not (len(parts)==1 and name in FILES) and parts[0] not in DIRS:
            errors.append(name+': unregistered file');continue
        if any(p in PRIVATE_NAMES or p.startswith('.env.') for p in parts):
            errors.append(name+': private workbench artifact');continue
        if path.suffix not in EXTENSIONS and path.name not in {'LICENSE','.gitignore','.gitattributes','_headers'}:
            errors.append(name+': unapproved file type');continue
        raw=path.read_bytes()
        try:text=raw.decode('utf-8')
        except UnicodeDecodeError:errors.append(name+': unexpected binary');continue
        for label,pattern in PATTERNS.items():
            if pattern.search(text):errors.append(name+': '+label)
        if str(Path.home())+'/' in text:errors.append(name+': personal absolute home path')
        if any(term and term in text for term in deny):errors.append(name+': private deny-list match')
        output[name]=hashlib.sha256(raw).hexdigest()
    for required in ['SKILL.md','README.md','LICENSE','UPSTREAM.lock.json','agents/openai.yaml']:
        if required not in output:errors.append(required+': missing')
    lock=json.loads((root/'UPSTREAM.lock.json').read_text())
    vendored={p.removeprefix('vendor/travel-guide/'):h for p,h in output.items() if p.startswith('vendor/travel-guide/')}
    originals=lock['upstream_files'];modified=sorted(p for p,h in originals.items() if vendored.get(p)!=h)
    added=sorted(set(vendored)-set(originals))
    if modified!=sorted(lock['modified']) or added!=sorted(lock['added']):
        errors.append('UPSTREAM.lock.json: maintained changes do not match inventory')
    if set(originals)-set(vendored):errors.append('Vendored upstream file missing')
    if errors:raise ValueError('\n'.join(errors))
    return output


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('root',type=Path,nargs='?',default=Path(__file__).resolve().parents[1]);p.add_argument('--manifest',type=Path);p.add_argument('--deny-file',type=Path,help='Private JSON list of forbidden strings; never echo matched strings')
    args=p.parse_args()
    try:
        files=audit(args.root,json.loads(args.deny_file.read_text()) if args.deny_file else [])
        if args.manifest:args.manifest.write_text(json.dumps(files,indent=2,ensure_ascii=False)+'\n')
        print('PASS package inventory and privacy patterns: '+str(len(files))+' text files')
    except (ValueError,KeyError,OSError) as e:raise SystemExit(str(e))
