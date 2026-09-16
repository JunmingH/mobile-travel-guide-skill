"""Project maintenance source transforms applied by the renderer and its audits.

Patches contain reviewed source edits, never QA outcomes. Context must match the
upstream-generated runtime exactly; validation still compares every final byte.
"""
from pathlib import Path
import re,json
from html import escape

HERE=Path(__file__).resolve().parent

def runtime_label(value):
    """Text substituted into HTML-bearing JavaScript string/template literals."""
    text=escape(str(value),quote=False)
    return ''.join('\\u%04x'%ord(c) if c in "\\\"'`$\n\r\u2028\u2029" else c for c in text)

def patch_sources(sources,patch):
    lines=patch.splitlines(keepends=True);i=0;name=None
    while i<len(lines):
        if lines[i].startswith('+++ b/'):
            name=lines[i][6:].strip();i+=1;continue
        if lines[i].startswith('@@ '):
            if name not in sources:raise ValueError('Unregistered patch source '+str(name))
            old=[];new=[];i+=1
            while i<len(lines) and not lines[i].startswith(('@@ ','--- a/','+++ b/')):
                line=lines[i]
                if line.startswith(' '):old.append(line[1:]);new.append(line[1:])
                elif line.startswith('-'):old.append(line[1:])
                elif line.startswith('+'):new.append(line[1:])
                elif line.startswith('\\ No newline'):
                    if old:old[-1]=old[-1].rstrip('\n')
                    if new:new[-1]=new[-1].rstrip('\n')
                i+=1
            before=''.join(old);after=''.join(new)
            # Unified diffs may have no final newline even without a marker.
            if before not in sources[name] and before.endswith('\n') and sources[name].endswith(before[:-1]):
                before=before[:-1];after=after[:-1] if after.endswith('\n') else after
            if not before or sources[name].count(before)!=1:
                raise ValueError('Maintenance patch context mismatch: '+name)
            sources[name]=sources[name].replace(before,after,1)
            continue
        i+=1

def apply_runtime_overlay(records, profile):
    sources={r['path']:r['content'] for r in records}
    for name in ['mobile-runtime.patch','mobile-ledger.patch']:
        patch = (HERE/name).read_text().replace('@@DISPLAY_NAME@@', runtime_label(profile['display_name'])).replace('@@YEAR@@', str(profile['year'])).replace('@@NAMESPACE@@', profile.get('handbook_id') or (re.sub('[^a-z0-9]+', '-', profile['destination'].lower()).strip('-') or 'travel') + '-' + str(profile['year']))
        patch_sources(sources, patch)
    source=sources['audit-itinerary-data.js']
    match=re.search(r'window\.HANDBOOK_CONFIG=(\{[^\n]+?\});',source)
    if not match:raise ValueError('Missing runtime config')
    config=json.loads(match[1])
    if profile.get('currency'): config['currency']=profile['currency']
    if profile.get('currencies'): config['currencies']=profile['currencies']
    sources['audit-itinerary-data.js']=source[:match.start(1)]+json.dumps(config,ensure_ascii=False)+source[match.end(1):]
    return [{**r,'content':sources[r['path']]} for r in records]
