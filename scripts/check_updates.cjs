/* Real Service Worker lifecycle, using temporary browser storage and a local
 * read-only server. Serves modified worker bytes in memory; never edits a guide. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
if(!process.argv[2])throw Error('Usage: check_updates.cjs WORKBENCH');
const wb=path.resolve(process.argv[2]),root=path.join(wb,'pwa');
const build=JSON.parse(fs.readFileSync(path.join(wb,'qa/pwa-build.json')));
const original=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
let version=build.version,failAsset=null,browser,server;
const result={status:'running',version:build.version,files:build.files,checks:[],errors:[],limitation:'Desktop Chromium lifecycle; not physical iOS persistence'};
const save=()=>fs.writeFileSync(path.join(wb,'qa/mobile-updates.json'),JSON.stringify(result,null,2)+'\n');
(async()=>{
  server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice('/guide/'.length))||'index.html';
    if(!req.url.startsWith('/guide/')||!Object.hasOwn(build.files,name)){res.writeHead(404).end();return}
    if(name===failAsset){res.writeHead(503).end('Test fault');return}
    const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(name)]||'text/plain';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
    res.end(name==='service-worker.js'?original.replace(build.version,version):fs.readFileSync(path.join(root,name)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/guide/';
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
  const context=await browser.newContext();
  await context.route(/^https?:\/\//,route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>result.errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(()=>document.documentElement.dataset.offlineReady==='true');
  const rpc=(type='GET_CACHE_STATUS',target='active',extra={})=>page.evaluate(async({type,target,extra})=>{
    const reg=await navigator.serviceWorker.getRegistration(),worker=reg[target];
    if(!worker)throw Error('Missing worker '+target);
    return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Worker timeout')),8000);
      channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};worker.postMessage({type,...extra},[channel.port2]);});
  },{type,target,extra});
  const install=async(newVersion,fail)=>{
    version=newVersion;failAsset=fail;
    return page.evaluate(async()=>{
      const reg=await navigator.serviceWorker.getRegistration();await reg.update();const worker=reg.installing;
      if(!worker)return reg.waiting?'installed':'missing';
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Install timeout')),30000);
        const changed=()=>{if(['installed','redundant'].includes(worker.state)){clearTimeout(timer);resolve(worker.state)}};
        worker.addEventListener('statechange',changed);changed();});
    });
  };
  const check=async(name,fn)=>{await fn();result.checks.push({name,status:'passed'});save()};
  await check('Complete initial cache; isolated localStorage and IndexedDB sentinels',async()=>{
    const status=await rpc();assert.equal(status.version,build.version);assert.equal(status.complete,true);assert.equal(status.cachedCount,7);
    await page.evaluate(async()=>{
      localStorage.setItem('qa-preserved-record','sentinel');
      await(await caches.open('qa-unrelated-cache')).put('/qa-sentinel',new Response('sentinel'));
      await new Promise((resolve,reject)=>{const req=indexedDB.open('qa-preserved-attachments',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onerror=()=>reject(req.error);
        req.onsuccess=()=>{const db=req.result,tx=db.transaction('files','readwrite');tx.objectStore('files').put('sentinel','attachment');
          tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error);};});
    });
  });
  await check('Incomplete update rejected; active cache survives',async()=>{
    assert.equal(await install(build.version+'-broken','style.css'),'redundant');
    const status=await rpc();assert.equal(status.version,build.version);assert.equal(status.complete,true);
    assert.equal(await page.evaluate(()=>caches.keys().then(names=>names.some(n=>n.endsWith('-broken')))),false);
  });
  await check('Explicit update confirmation; local data and unrelated caches retained',async()=>{
    assert.equal(await install(build.version+'-next',null),'installed');
    assert.equal((await rpc()).version,build.version);
    assert.equal((await rpc('SKIP_WAITING','waiting')).type,'UPDATE_NOT_APPLIED');
    assert.equal((await rpc()).version,build.version);
    const navigation=page.waitForEvent('load');
    assert.equal((await rpc('SKIP_WAITING','waiting',{userConfirmed:true})).type,'UPDATE_APPLYING');
    await navigation;
    await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.waiting&&r.active?.state==='activated'});
    assert.equal((await rpc()).version,build.version+'-next');
    const saved=await page.evaluate(async()=>({local:localStorage.getItem('qa-preserved-record'),cache:await caches.has('qa-unrelated-cache'),
      idb:await new Promise((resolve,reject)=>{const r=indexedDB.open('qa-preserved-attachments',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').get('attachment');q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)}})}));
    assert.deepEqual(saved,{local:'sentinel',cache:true,idb:'sentinel'});
  });
  assert.deepEqual(result.errors,[]);result.status='passed';result.checked_at=new Date().toISOString();save();console.log('PASS update lifecycle: '+result.checks.length+' checks');
})().catch(e=>{result.status='failed';result.failure=e.message;save();console.error(e);process.exitCode=1}).finally(async()=>{
  if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}
});
