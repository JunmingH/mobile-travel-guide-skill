import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {build} from '../scripts/build_encrypted.mjs';
import {verify} from '../scripts/verify_release.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'travel-crypto-'));
  fs.mkdirSync(path.join(root,'pwa/icons'),{recursive:true});fs.mkdirSync(path.join(root,'qa'));
  const files={'index.html':'<html><head><link rel="stylesheet" href="style.css"></head><body>FICTIONAL_PRIVATE_CANARY<script src="app.js" defer></script></body></html>',
    'app.js':'const value="<h3>随身数据</h3>";','style.css':'body{color:green}',
    'manifest.json':JSON.stringify({name:'Generic handbook',icons:[{src:'icons/icon-192.png'}]}),'service-worker.js':'test fixture'};
  for(const name of ['icon-192.png','icon-512.png','apple-touch-icon.png'])files['icons/'+name]='synthetic icon';
  for(const [name,text]of Object.entries(files))fs.writeFileSync(path.join(root,'pwa',name),text);
  fs.writeFileSync(path.join(root,'mobile-app.json'),JSON.stringify({publication:{mode:'encrypted'},app:{short_name:'<test>'}}));
  fs.writeFileSync(path.join(root,'qa/pwa-build.json'),JSON.stringify({version:'fixture',files:Object.fromEntries(Object.entries(files).map(([n,v])=>[n,sha(v)]))}));
  return root;
}
function decrypt(key,iv,aad,data){const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));d.setAAD(Buffer.from(aad));d.setAuthTag(data.subarray(-16));return Buffer.concat([d.update(data.subarray(0,-16)),d.final()]);}
test('randomized encrypted release, tamper detection, exact allowlist, safe rebuild',async()=>{
  const root=fixture(),code=crypto.randomBytes(24).toString('base64url');
  try{
    const first=build(root,code),meta=JSON.parse(fs.readFileSync(path.join(root,'github-pages/payload.json')));
    const wrap=value=>crypto.pbkdf2Sync(value,Buffer.from(meta.salt,'base64url'),meta.iterations,32,'sha256');
    assert.throws(()=>decrypt(wrap('wrong'),meta.wrapIv,'travel-content-key-v1',Buffer.from(meta.wrappedKey,'base64url')));
    const key=decrypt(wrap(code),meta.wrapIv,'travel-content-key-v1',Buffer.from(meta.wrappedKey,'base64url'));
    const part=meta.parts[0],data=fs.readFileSync(path.join(root,'github-pages',part.file));
    const plain=decrypt(key,part.iv,part.aad,data);
    assert.equal(sha(plain),meta.htmlSha256);assert.ok(plain.includes(Buffer.from('FICTIONAL_PRIVATE_CANARY')));
    const changed=Buffer.from(data);changed[1]^=1;assert.throws(()=>decrypt(key,part.iv,part.aad,changed));
    assert.throws(()=>decrypt(key,part.iv,part.aad+'wrong',data));
    for(const name of Object.keys(first.files)){
      const bytes=fs.readFileSync(path.join(root,'github-pages',name));
      for(const secret of [Buffer.from(code),key,wrap(code),Buffer.from('FICTIONAL_PRIVATE_CANARY')])assert.ok(!bytes.includes(secret));
    }
    assert.ok(fs.readFileSync(path.join(root,'github-pages/index.html'),'utf8').includes('&lt;test&gt;'));
    await verify(root);
    const second=build(root,code);assert.notEqual(first.version,second.version);
    assert.equal(first.encrypted_html_sha256,second.encrypted_html_sha256);
    assert.equal(fs.readdirSync(path.join(root,'.mobile-history')).length,1);
    fs.writeFileSync(path.join(root,'github-pages/private.txt'),'do not publish');
    await assert.rejects(verify(root),/Extra/);assert.throws(()=>build(root,code),/Unexpected files/);
    assert.ok(fs.existsSync(path.join(root,'github-pages/private.txt')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('invalid secrets and changed PWA are rejected before replacing output',()=>{
  const root=fixture();try{
    assert.throws(()=>build(root,'123456'),/random/);
    assert.throws(()=>build(root,'aaaaaaaaaaaaaaaa'),/random/);
    fs.appendFileSync(path.join(root,'pwa/index.html'),'changed');
    assert.throws(()=>build(root,crypto.randomBytes(24).toString('base64url')),/differs/);
    assert.ok(!fs.existsSync(path.join(root,'github-pages')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
