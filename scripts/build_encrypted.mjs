// Private stdin: {"ACCESS_CODE": "..."}. Never place credentials in argv or files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');

export function build(root,code){
  root=fs.realpathSync(root);
  if(typeof code!=='string'||code.length<14||/^(.)\1+$/.test(code))throw Error('Use a random access code of at least 14 characters. Length alone does not prove entropy.');
  const settings=read(path.join(root,'mobile-app.json'));
  if(settings.publication?.mode!=='encrypted')throw Error('This builder only publishes encrypted handbooks');
  const receipt=read(path.join(root,'qa/pwa-build.json'));
  const names=Object.keys(receipt.files);
  const expected=['index.html','app.js','style.css','manifest.json','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','service-worker.js'];
  if(JSON.stringify(names.sort())!==JSON.stringify(expected.sort()))throw Error('Unexpected PWA source inventory');
  for(const [name,hash] of Object.entries(receipt.files)){
    const file=path.join(root,'pwa',name);
    if(fs.lstatSync(file).isSymbolicLink()||sha(fs.readFileSync(file))!==hash)throw Error('PWA source differs from its receipt: '+name);
  }
  let html=fs.readFileSync(path.join(root,'pwa/index.html'),'utf8');
  let app=fs.readFileSync(path.join(root,'pwa/app.js'),'utf8');
  if(!app.includes('<h3>随身数据</h3>'))throw Error('Settings anchor changed');
  app=app.replace('<h3>随身数据</h3>','<h3>访问码</h3><p>每次重新加载需输入访问码，断网时也可解锁。</p><button type="button" data-lock-guide>重新锁定手册</button></section><section><h3>随身数据</h3>');
  app+='\ndocument.addEventListener("click",event=>{if(event.target.closest("[data-lock-guide]"))location.reload()});';
  if(!html.includes('<script src="app.js" defer></script>')||!html.includes('<link rel="stylesheet" href="style.css">'))throw Error('PWA shell anchors changed');
  html=html.replace('<script src="app.js" defer></script>','<script>'+app.replace(/<\/script/gi,'<\\/script')+'</script>')
    .replace('<link rel="stylesheet" href="style.css">','<style>'+fs.readFileSync(path.join(root,'pwa/style.css'),'utf8').replace(/<\/style/gi,'<\\/style')+'</style>')
    .replaceAll('href="icons/','href="');
  const raw=Buffer.from(html),key=crypto.randomBytes(32),salt=crypto.randomBytes(16);
  const wrapKey=crypto.pbkdf2Sync(code,salt,600000,32,'sha256');
  const seal=(data,key,aad)=>{
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(aad));
    return {iv:iv.toString('base64url'),data:Buffer.concat([cipher.update(data),cipher.final(),cipher.getAuthTag()])};
  };
  const out=path.join(root,'github-pages');
  if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw Error('Refusing symbolic-link publication directory');
  const stage=fs.mkdtempSync(path.join(root,'.encrypted-stage-'));
  let backup;
  try{
    const wrapped=seal(key,wrapKey,'travel-content-key-v1');
    const meta={format:1,iterations:600000,salt:salt.toString('base64url'),wrapIv:wrapped.iv,wrappedKey:wrapped.data.toString('base64url'),htmlSha256:sha(raw),parts:[]};
    for(let offset=0;offset<raw.length;offset+=4*1024*1024){
      const aad='travel-html:'+meta.htmlSha256+':'+offset;
      const part=seal(raw.subarray(offset,Math.min(offset+4*1024*1024,raw.length)),key,aad);
      const file='encrypted-'+sha(part.data)+'.bin';
      fs.writeFileSync(path.join(stage,file),part.data);meta.parts.push({file,iv:part.iv,aad});
    }
    write(path.join(stage,'payload.json'),meta);
    const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    fs.writeFileSync(path.join(stage,'index.html'),fs.readFileSync(path.join(skill,'assets/access/index.html'),'utf8').replaceAll('__APP_NAME__',escape(settings.app.short_name)));
    fs.copyFileSync(path.join(skill,'assets/access/unlock.js'),path.join(stage,'unlock.js'));
    const manifest=read(path.join(root,'pwa/manifest.json'));
    for(const icon of manifest.icons)icon.src=icon.src.replace('icons/','');
    write(path.join(stage,'manifest.json'),manifest);
    for(const name of ['icon-192.png','icon-512.png','apple-touch-icon.png'])fs.copyFileSync(path.join(root,'pwa/icons',name),path.join(stage,name));
    fs.writeFileSync(path.join(stage,'.nojekyll'),'');
    const files=['index.html','unlock.js','payload.json','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png',...meta.parts.map(p=>p.file)];
    const version='encrypted-'+sha(Buffer.from(JSON.stringify(files.map(n=>[n,sha(fs.readFileSync(path.join(stage,n)))])))).slice(0,16);
    let sw=fs.readFileSync(path.join(skill,'assets/pwa/service-worker.js'),'utf8').replace('__BUILD_VERSION__',version)
      .replace(/const ASSETS = \[[\s\S]*?\];/,'const ASSETS = '+JSON.stringify(files)+';');
    fs.writeFileSync(path.join(stage,'service-worker.js'),sw);files.push('service-worker.js','.nojekyll');
    const hashes=Object.fromEntries(files.map(n=>[n,sha(fs.readFileSync(path.join(stage,n)))]));
    for(const file of files){
      const data=fs.readFileSync(path.join(stage,file));
      if(data.includes(Buffer.from(code))||data.includes(key)||data.includes(wrapKey))throw Error('Secret material unexpectedly found in publication');
    }
    if(fs.existsSync(out)){
      const old=read(path.join(root,'qa/github-pages-build.json'));
      if(JSON.stringify(fs.readdirSync(out).sort())!==JSON.stringify(Object.keys(old.files).sort()))throw Error('Unexpected files in existing publication; inspect before replacement');
      for(const [file,hash] of Object.entries(old.files)){
        if(path.basename(file)!==file||fs.lstatSync(path.join(out,file)).isSymbolicLink()||sha(fs.readFileSync(path.join(out,file)))!==hash)throw Error('Existing publication changed outside builder');
      }
      backup=path.join(root,'.mobile-history','encrypted-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex'));
      fs.mkdirSync(path.dirname(backup),{recursive:true});fs.renameSync(out,backup);
    }
    try{fs.renameSync(stage,out);}catch(error){if(backup)fs.renameSync(backup,out);throw error;}
    const result={version,status:'built_needs_browser_review',files:hashes,pwa_version:receipt.version,
      encrypted_html_sha256:meta.htmlSha256,protected_bytes:raw.length,built_at:new Date().toISOString(),
      protection:'AES-256-GCM; PBKDF2-SHA256 600000 iterations; random content key, salt and 96-bit IVs',public_directory:'github-pages'};
    fs.mkdirSync(path.join(root,'qa'),{recursive:true});write(path.join(root,'qa/github-pages-build.json'),result);
    const assetsPath=path.join(root,'asset-manifest.json');
    if(fs.existsSync(assetsPath)){
      const assets=read(assetsPath);
      for(const icon of assets.ui_assets||[])if(icon.role==='app_icon')icon.publication_copies=['github-pages/'+path.basename(icon.file)];
      write(assetsPath,assets);
    }
    return result;
  }finally{
    key.fill(0);wrapKey.fill(0);
    if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true});
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(!process.argv[2])throw Error('Usage: node build_encrypted.mjs WORKBENCH < private-stdin');
    let secret;try{secret=JSON.parse(fs.readFileSync(0,'utf8'));}catch{throw Error('stdin must be a JSON object with ACCESS_CODE');}
    const result=build(process.argv[2],secret.ACCESS_CODE);
    console.log(JSON.stringify({version:result.version,files:Object.keys(result.files).length,protected_bytes:result.protected_bytes,status:result.status}));
  }catch(error){console.error(error.message);process.exitCode=2;}
}
