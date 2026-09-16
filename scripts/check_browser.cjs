// Tests generated public files and a private test browser. Never records the code.
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict'),os=require('os');
if(!process.argv[2]) throw Error('Usage: check_browser.cjs WORKBENCH; private JSON stdin ACCESS_CODE');
const wb=path.resolve(process.argv[2]),root=path.join(wb,'github-pages'),secret=JSON.parse(fs.readFileSync(0,'utf8'));
const engine=process.env.BROWSER_ENGINE||'chromium';
const profile=JSON.parse(fs.readFileSync(path.join(wb,'destination-profile.json')));
const ledgerKey=profile.handbook_id+'-shared-ledger-local-v1';
const build=JSON.parse(fs.readFileSync(path.join(wb,'qa/github-pages-build.json'))),meta=JSON.parse(fs.readFileSync(path.join(root,'payload.json')));
const result={status:'running',version:build.version,files:build.files,checks:[],errors:[],limitations:['Browser emulation, not an actual iPhone Home Screen installation','Protects published handbook; local ledger/photos retain the original browser storage model','GitHub Pages projects on the same account share an origin; access code/key are not persisted']};
result.engine=engine; result.checked_at=new Date().toISOString();
const save=()=>fs.writeFileSync(path.join(wb,'qa/mobile-browser-'+engine+'.json'),JSON.stringify(result,null,2)+'\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const decrypt=(key,iv,aad,data)=>{const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));d.setAAD(Buffer.from(aad));d.setAuthTag(data.subarray(-16));return Buffer.concat([d.update(data.subarray(0,-16)),d.final()])};
const wrap=code=>crypto.pbkdf2Sync(code,Buffer.from(meta.salt,'base64url'),meta.iterations,32,'sha256');
const check=async(name,fn)=>{await fn();result.checks.push({name,status:'passed'});save()};
let browser,server;
(async()=>{
 await check('Wrong access code and modified ciphertext rejected; correct bytes match complete handbook',()=>{
  assert.throws(()=>decrypt(wrap('incorrect'),meta.wrapIv,'travel-content-key-v1',Buffer.from(meta.wrappedKey,'base64url')));
  const key=decrypt(wrap(secret.ACCESS_CODE),meta.wrapIv,'travel-content-key-v1',Buffer.from(meta.wrappedKey,'base64url'));
  const plain=Buffer.concat(meta.parts.map(p=>decrypt(key,p.iv,p.aad,fs.readFileSync(path.join(root,p.file)))));assert.equal(sha(plain),meta.htmlSha256);assert.ok(plain.includes(Buffer.from('data-language-card'))) ;
  const part=meta.parts[0],corrupt=Buffer.from(fs.readFileSync(path.join(root,part.file)));corrupt[100]^=1;assert.throws(()=>decrypt(key,part.iv,part.aad,corrupt));
  for(const[name,h]of Object.entries(build.files)){const data=fs.readFileSync(path.join(root,name));assert.equal(sha(data),h);assert.ok(!data.includes(Buffer.from(secret.ACCESS_CODE)));assert.ok(!data.includes(key));assert.ok(!data.includes(wrap(secret.ACCESS_CODE)));}
  assert.deepEqual(fs.readdirSync(root).sort(),Object.keys(build.files).sort());
  assert.ok(!fs.readFileSync(path.join(root,'unlock.js'),'utf8').includes('indexedDB'));
 });
 const prefix='/guide/';
 server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname;if(!pathname.startsWith(prefix)){res.writeHead(404).end();return}const relative=decodeURIComponent(pathname.slice(prefix.length))||'index.html';if(!Object.hasOwn(build.files,relative)){res.writeHead(404).end();return}const file=path.join(root,relative),type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.bin':'application/octet-stream'}[path.extname(file)];res.writeHead(200,{'Content-Type':type||'text/plain','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+prefix;
 const pw=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
 browser=await pw[engine].launch(engine==='chromium'?{headless:true,executablePath:process.env.CHROME_EXECUTABLE}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>{result.errors.push(e.message);save()});
 await context.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 const unlock=async()=>{await page.locator('#code').fill(secret.ACCESS_CODE);await page.locator('button[type=submit]').click();await page.locator('.pwa-settings-trigger').waitFor({timeout:60000});await page.waitForFunction(()=>document.documentElement.dataset.offlineReady==='true',{},{timeout:60000})};
 await check('Anonymous visitor sees only access form; wrong code cannot show content; correct code opens app',async()=>{
  await page.goto(base);assert.equal(await page.locator('.pwa-settings-trigger').count(),0);assert.equal(await page.locator('[data-language-card]').count(),0);
  for(const width of[390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(wb,'qa/access-'+engine+'-'+width+'.png')})}
  await page.setViewportSize({width:390,height:844});await page.locator('#code').fill('incorrect');await page.locator('button[type=submit]').click();await page.getByText('访问码不正确，请重新输入。',{exact:true}).waitFor({timeout:60000});
  await unlock();assert.ok(await page.locator('[data-language-card]').count()>0);assert.equal(await page.locator('[data-supplied-flight]').count(),(profile.source_transport_plan||[]).length);
 });
 await check('Offline reload still requires code and restores full handbook and ledger UI',async()=>{
  result.stage='offline-reload';save();
  if(engine==='webkit'){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;result.offline_method='Local HTTP server stopped; WebKit offline emulation avoided due engine bug'}else await context.setOffline(true);
  await page.reload();await page.locator('#code').waitFor();await unlock();
  result.stage='offline-ledger';save();
  await page.locator('[data-dock="ledger"]').click();await page.getByText('旅行记账',{exact:true}).waitFor();
  for(const name of ['安全测试甲','安全测试乙']){await page.locator('.member-form [name="name"]').fill(name);await page.locator('.member-form [type="submit"]').click();await page.waitForFunction(value=>document.querySelector('[data-members]')?.textContent.includes(value),name)}
  const payer=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).members[0].id,ledgerKey);
  await page.locator('.expense-form [name="amount"]').fill('88');await page.locator('.expense-form [name="currency"]').selectOption(profile.currency||'USD');await page.locator('.expense-form [name="payer"]').selectOption(payer);await page.locator('.expense-form [name="note"]').fill('离线解锁后测试账目');
  for(const box of await page.locator('.expense-form [name="participant"]').all())await box.check();await page.locator('.expense-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('.expense-list')?.textContent.includes('离线解锁后测试账目'));
  result.stage='offline-images';save();
  const decoded=await page.evaluate(async()=>{const sources=[...new Set([...document.images].map(i=>i.src).filter(s=>s.startsWith('data:image')))];const sizes=await Promise.all(sources.map(async src=>{const img=new Image();img.src=src;try{await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('decode timeout')),7000))]);return img.naturalWidth}catch{return 0}}));return sizes.filter(Boolean).length});assert.ok(decoded>0);
  await page.screenshot({path:path.join(wb,'qa/offline-ledger-'+engine+'.png')});
 });
 await check('Relocking returns to access form; keys and access code are not persisted',async()=>{
  await page.keyboard.press('Escape');await page.locator('.pwa-settings-trigger').click();await page.locator('[data-lock-guide]').click();await page.locator('#code').waitFor();
  const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!storage.includes(secret.ACCESS_CODE));
  const dbs=await page.evaluate(()=>indexedDB.databases());assert.ok(!dbs.some(d=>d.name.startsWith('travel-unlock:')));
  await unlock();await page.locator('[data-dock="ledger"]').click();await page.getByText('离线解锁后测试账目',{exact:true}).waitFor();
  const ledger=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),ledgerKey);assert.equal(ledger.members.length,2);assert.ok(ledger.expenses.some(e=>e.amount===88));
 });
 assert.deepEqual(result.errors,[]);result.status='passed';save();console.log(JSON.stringify({status:result.status,checks:result.checks.length,version:result.version}));
})().catch(error=>{result.status='failed';result.failure=error.message;save();console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve))});
