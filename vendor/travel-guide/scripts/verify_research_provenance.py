#!/usr/bin/env python3
"""Verify that the production profile still matches complete compiled research packs."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("workbench",type=Path); a=ap.parse_args(); root=a.workbench.resolve(); failures=[]
    plan_path=root/"research-plan.json"; profile=root/"destination-profile.json"; proof=root/"RESEARCH_PROVENANCE.json"
    for path in (plan_path,profile,proof):
        if not path.is_file(): failures.append(f"missing {path.name}")
    if failures:
        for item in failures: print("FAIL "+item)
        return 2
    try: plan=json.loads(plan_path.read_text(encoding="utf-8")); record=json.loads(proof.read_text(encoding="utf-8"))
    except Exception as exc: print(f"FAIL invalid research provenance: {exc}"); return 2
    packs=plan.get("packs",[])
    if record.get("compiler")!="compile_destination_profile.py": failures.append("profile was not produced by the official compiler")
    if record.get("test_fixture_detected") is not False: failures.append("test fixture provenance detected")
    if record.get("research_plan_sha256")!=sha(plan_path): failures.append("research plan changed after compilation")
    if record.get("pack_count")!=len(packs): failures.append("research pack count does not match compilation record")
    recorded=record.get("pack_sha256",{})
    for item in packs:
        rel=str(item.get("file","")).replace("\\","/"); path=root/rel
        if not path.is_file(): failures.append(f"missing research pack: {rel}")
        elif recorded.get(rel)!=sha(path): failures.append(f"research pack changed after compilation: {rel}")
    if record.get("profile_sha256")!=sha(profile): failures.append("destination-profile.json was created or modified outside the official compiler")
    for failure in failures: print("FAIL "+failure)
    if failures: return 2
    print(f"PASS RESEARCH {len(packs)} compiled packs and profile signature verified")
    return 0

if __name__=="__main__": raise SystemExit(main())
