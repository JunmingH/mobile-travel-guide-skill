// Read-only verification of the dedicated encrypted output and optional HTTPS site.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
export async function verify(root,url){
  root=path.resolve(root);
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'qa/github-pages-build.json'),'utf8'));
  const directory=path.join(root,'github-pages');
  if(fs.lstatSync(directory).isSymbolicLink())throw Error('Refusing symbolic-link publication root');
  const meta=JSON.parse(fs.readFileSync(path.join(directory,'payload.json'),'utf8'));
  if(meta.format!==1||meta.iterations!==600000||meta.parts.length<1)throw Error('Unexpected encryption metadata');
  const allowed=new Set(['index.html','unlock.js','payload.json','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png','service-worker.js','.nojekyll',...meta.parts.map(p=>p.file)]);
  const files=Object.keys(receipt.files);
  if(files.length!==allowed.size||files.some(n=>!allowed.has(n)))throw Error('Build receipt contains unexpected files');
  if(JSON.stringify(fs.readdirSync(directory).sort())!==JSON.stringify([...allowed].sort()))throw Error('Extra or missing publication files');
  for(const part of meta.parts)if(!/^encrypted-[a-f0-9]{64}\.bin$/.test(part.file))throw Error('Invalid ciphertext path');
  let base;
  if(url){base=new URL(url);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/'))throw Error('Use an explicit HTTPS base URL ending with /, without credentials or query parameters');}
  for(const name of files){
    if(path.basename(name)!==name)throw Error('Path leaves publication directory');
    const file=path.join(directory,name);
    if(fs.lstatSync(file).isSymbolicLink()||sha(fs.readFileSync(file))!==receipt.files[name])throw Error('File hash mismatch: '+name);
    if(base){
      const target=new URL(name,base),response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok||sha(Buffer.from(await response.arrayBuffer()))!==receipt.files[name])throw Error('Live file differs: '+name);
    }
  }
  const result={status:'passed',scope:base?'public_inventory_and_live_hashes':'public_inventory_and_local_hashes',
    version:receipt.version,files:receipt.files,checked_at:new Date().toISOString(),url:base?.href||null,
    limitations:['Does not replace browser/offline checks or source-data review','Does not verify the remote repository history; inspect its exact upload allowlist separately']};
  fs.writeFileSync(path.join(root,'qa/publication-check.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(!process.argv[2])throw Error('Usage: node verify_release.mjs WORKBENCH [--url https://host/path/]');const result=await verify(process.argv[2],process.argv[3]==='--url'?process.argv[4]:undefined);console.log(JSON.stringify({status:result.status,version:result.version,files:Object.keys(result.files).length,url:result.url}));}
  catch(error){console.error(error.message);process.exitCode=2;}
}
