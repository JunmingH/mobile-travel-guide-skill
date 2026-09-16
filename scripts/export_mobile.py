#!/usr/bin/env python3
"""Keep every runtime; inline static images and put mobile metadata first."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile

from _mobile import runtime, read, write


def export(root):
    root = Path(root).resolve()
    sys.path.insert(0, str(runtime(root) / 'scripts'))
    from package_handbook import package
    with tempfile.TemporaryDirectory(prefix='travel-offline-export-') as temp:
        temporary = Path(temp) / 'handbook.html'
        package(root, temporary)
        doc = temporary.read_text(encoding='utf-8')
        receipt = read(root / 'offline-export.json')
    metas = re.findall(r'<meta\b[^>]*(?:charset=|name=["\x27]viewport)[^>]*>', doc, re.I)
    for tag in metas:
        doc = doc.replace(tag, '', 1)
    doc = re.sub(r'(<head\b[^>]*>)', lambda m: m[1] + ''.join(metas), doc, count=1, flags=re.I)
    table = {}
    if 'const assets = ' in doc:
        pos = doc.index('const assets = ') + len('const assets = ')
        table, _ = json.JSONDecoder().raw_decode(doc[pos:])
    count = 0

    def embed(match):
        nonlocal count
        if match[2] not in table:
            raise ValueError('Unresolved static image token')
        count += 1
        return match[1] + table[match[2]] + match[3]

    parts = re.split(r'(<script\b.*?</script>|<style\b.*?</style>)', doc, flags=re.I | re.S)
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r'(<img\b[^>]*?\bsrc=["\x27])(data:application/x-travel-asset,[a-f0-9]{64})(["\x27])', embed, parts[i], flags=re.I)
    output = root / 'handbook-offline.html'
    payload = ''.join(parts).encode('utf-8')
    if output.is_symlink():
        raise ValueError('Refusing symbolic-link output')
    output.write_bytes(payload)
    receipt.update(file=str(output), sha256=hashlib.sha256(payload).hexdigest(), bytes=len(payload),
                   mobile_transforms={'head_metadata_first': True, 'static_images_unpacked': count,
                                      'retained_all_runtime_scripts': True}, exporter='export_mobile.py')
    write(root / 'offline-export.json', receipt)
    print(json.dumps({'output': str(output), 'bytes': len(payload), 'sha256': receipt['sha256']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbench', type=Path)
    export(parser.parse_args().workbench)
