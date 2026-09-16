/* Installable shell for the complete handbook; existing features stay intact. */
(()=>{'use strict';
 const $=s=>document.querySelector(s),THEME_KEY='travel-pwa-appearance-v1';
 let registration,installPrompt;
 const dark=matchMedia('(prefers-color-scheme: dark)');
 function preference(){try{return localStorage.getItem(THEME_KEY)||'auto'}catch{return'auto'}}
 function applyTheme(){
  const choice=preference(),tone=choice==='auto'?(dark.matches?'dark':'light'):choice;
  document.body.dataset.appTheme=tone;document.documentElement.style.colorScheme=tone;
  $('meta[name="theme-color"]').content=tone==='dark'?'#18251f':'#f5f3ed';
  document.querySelectorAll('[data-appearance]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.appearance===choice)));
  document.querySelectorAll('.utility-readable-fold').forEach(n=>{
   n.style.setProperty('background',tone==='dark'?'#26372e':'#faf8f1','important');n.style.setProperty('color',tone==='dark'?'#edf2e9':'#293e36','important');
   n.querySelectorAll('b,h3,strong').forEach(t=>{t.style.setProperty('color',tone==='dark'?'#edf2e9':'#293e36','important');t.style.setProperty('-webkit-text-fill-color',tone==='dark'?'#edf2e9':'#293e36','important');});
  });
 }
 function requestStatus(worker){return new Promise((resolve,reject)=>{if(!worker){reject(Error('worker unavailable'));return}const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('cache status timeout')),10000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);};worker.postMessage({type:'GET_CACHE_STATUS',requestId:'status-'+Date.now()},[channel.port2]);});}
 // iOS can report the previous visible height during a resize callback or resume
 // without a resize event. Re-read after layout settles, preserving reader scroll.
 function installViewportRecovery(){
  const root=document.documentElement,viewport=window.visualViewport;
  let frame=0,timers=[];
  function measure(){
   frame=0;if(document.visibilityState==='hidden')return;
   const height=viewport?viewport.height:window.innerHeight;
   if(Number.isFinite(height)&&height>0)root.style.setProperty('--phone-usable-height',height+'px');
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  function recover(){
   timers.forEach(clearTimeout);timers=[];schedule();
   if(document.visibilityState!=='hidden')timers=[120,350,700].map(delay=>setTimeout(schedule,delay));
  }
  viewport?.addEventListener('resize',recover,{passive:true});
  viewport?.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',recover,{passive:true});
  window.addEventListener('orientationchange',recover,{passive:true});
  window.addEventListener('pageshow',recover);
  document.addEventListener('visibilitychange',recover);
  document.addEventListener('focusout',recover);
  window.addEventListener('pagehide',()=>{timers.forEach(clearTimeout);timers=[];cancelAnimationFrame(frame);frame=0;});
  recover();
 }
 function init(){
  installViewportRecovery();
  const panel=document.createElement('dialog');panel.className='pwa-settings';panel.setAttribute('aria-label','安装与应用设置');
  panel.innerHTML='<header><div><small>TRAVEL APP</small><h2>安装与设置</h2></div><button type="button" data-settings-close aria-label="关闭设置">×</button></header><section><h3>离线状态</h3><p data-offline-status role="status">正在检查离线内容…</p><button type="button" data-cache-retry>重新检查</button><button type="button" data-install-update hidden>更新离线手册</button></section><section><h3>放到 iPhone 主屏幕</h3><ol><li>首次使用时在 Safari 打开手册网址。</li><li>点 Safari 的分享按钮，选择“添加到主屏幕”。</li><li>从新图标打开，保持联网直到显示“离线已就绪”，再断网使用。</li></ol><p data-standalone-status></p><button type="button" data-install-app hidden>安装旅行手册</button></section><section><h3>外观</h3><div class="pwa-appearance"><button type="button" data-appearance="auto">跟随系统</button><button type="button" data-appearance="light">浅色</button><button type="button" data-appearance="dark">深色</button></div></section><section><h3>随身数据</h3><p>记账、分摊、行李勾选、行程草稿和自存附件保存在这台设备。网页更新会保留这些记录。</p><p>正文、照片、每日地图和本机交互可离线使用；外部导航、网上预订、实时汇率需要网络。离线时汇率可手动填写，朗读取决于已安装的系统语音。</p></section>';
  document.body.append(panel);
  const top=$('.atlas-topbar'),settings=document.createElement('button');settings.type='button';settings.className='pwa-settings-trigger';settings.setAttribute('aria-label','安装与设置');settings.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="5"/></svg>';
  top.append(settings);settings.onclick=()=>{panel.showModal();refreshStatus();};
  panel.querySelector('[data-settings-close]').onclick=()=>panel.close();panel.addEventListener('click',e=>{if(e.target===panel)panel.close()});
  const notice=document.createElement('div');notice.className='pwa-cache-banner';notice.setAttribute('role','status');notice.innerHTML='<span data-cache-banner>正在准备离线手册…</span><button type="button">安装与设置</button>';
  $('#top').after(notice);notice.querySelector('button').onclick=settings.onclick;
  const setStatus=(text,ready=false)=>{$('[data-offline-status]').textContent=text;$('[data-cache-banner]').textContent=ready?'离线已就绪 · 正文、图片与地图已保存':text;document.documentElement.dataset.offlineReady=String(ready);notice.classList.toggle('is-ready',ready)};
  async function refreshStatus(){
   try{
    if(!registration?.active){setStatus(navigator.onLine?'正在下载离线内容，请保持联网…':'尚未完成离线准备，请先联网打开。');return;}
    const state=await requestStatus(registration.active);
    setStatus(state.complete?'离线已就绪。正文、图片、地图与工具已保存在这台设备。':'离线内容未齐全，请联网后重新打开。',state.complete);
    $('[data-install-update]').hidden=!registration.waiting;
   }catch{setStatus('暂时无法确认离线缓存，请联网后重试。');}
  }
  $('[data-cache-retry]').onclick=async()=>{if(registration)try{await registration.update()}catch{}await refreshStatus()};
  $('[data-install-update]').onclick=()=>{if(registration?.waiting){$('[data-install-update]').disabled=true;registration.waiting.postMessage({type:'SKIP_WAITING',userConfirmed:true});}};
  let updating=false;navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(updating)location.reload();else{updating=true;refreshStatus();}});
  panel.querySelector('[data-install-update]').addEventListener('click',()=>{updating=true});
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  $('[data-standalone-status]').textContent=standalone?'已在主屏幕 App 模式运行。':'当前在浏览器中，可按上面步骤添加到主屏幕。';
  panel.querySelectorAll('[data-appearance]').forEach(b=>b.onclick=()=>{try{localStorage.setItem(THEME_KEY,b.dataset.appearance)}catch{}applyTheme()});dark.addEventListener('change',applyTheme);applyTheme();
  $('[data-install-app]').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('[data-install-app]').hidden=true}};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('[data-install-app]').hidden=false});
  if(location.protocol==='file:'||!('serviceWorker' in navigator)||!window.isSecureContext){setStatus('请通过 HTTPS 网址打开，才能安装和保存离线内容。');return;}
  navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).then(async r=>{
   registration=r;await refreshStatus();
   r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'||worker.state==='activated')refreshStatus()})});
   navigator.serviceWorker.ready.then(refreshStatus);
  }).catch(()=>setStatus('离线准备失败，请保持联网后重新打开。'));
  window.addEventListener('online',refreshStatus);window.addEventListener('offline',refreshStatus);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
