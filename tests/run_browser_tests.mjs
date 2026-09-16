// One ephemeral random test code, delivered to child processes through stdin.
// No user data, persistent credential file, shell expansion, or remote publishing.
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {build} from '../scripts/build_encrypted.mjs';
const root=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(path.join(root,'TEST_FIXTURE.json')))throw Error('Requires an explicitly fictional fixture workbench');
const scripts=fileURLToPath(new URL('../scripts/',import.meta.url));
const code=randomBytes(24).toString('base64url');
build(root,code);
for(const engine of ['chromium','webkit']){
  if(!process.argv.includes('--skip-features'))run('check_features.cjs',[root,'--engine',engine]);
  run('check_browser.cjs',[root],{BROWSER_ENGINE:engine},JSON.stringify({ACCESS_CODE:code}));
}
run('check_updates.cjs',[root]);
function run(script,args,env={},input=''){
  const r=spawnSync(process.execPath,[path.join(scripts,script),...args],{input,encoding:'utf8',env:{...process.env,...env},maxBuffer:8*1024*1024});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw Error(script+' failed: '+(r.error?.message||r.status));
}
