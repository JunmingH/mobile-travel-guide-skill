#!/usr/bin/env python3
"""Create a deterministic, audited .skill archive without overwriting any file."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from audit_package import audit

def package(root, output):
    root,output=Path(root).resolve(),Path(output).resolve()
    files=audit(root)
    if output.exists():raise ValueError('Archive already exists; choose a new version or inspect it')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as archive:
        for name,digest in files.items():
            raw=(root/name).read_bytes()
            if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('Source changed during packaging')
            info=zipfile.ZipInfo('build-mobile-travel-guide/'+name,date_time=(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            archive.writestr(info,raw)
    with zipfile.ZipFile(output) as archive:
        assert len(archive.infolist())==len(files)
        for name,digest in files.items():assert hashlib.sha256(archive.read('build-mobile-travel-guide/'+name)).hexdigest()==digest
    receipt={'archive':output.name,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'files':files}
    output.with_suffix(output.suffix+'.manifest.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print('PASS verified archive:',output,'('+str(len(files))+' files)')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);a=p.parse_args();package(a.root,a.output)
