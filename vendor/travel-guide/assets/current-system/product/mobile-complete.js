/* Expose the existing full runtime through reachable phone controls. */
(()=>{'use strict';
 function init(){
  const $=s=>document.querySelector(s),toggle=$('.atlas-menu-toggle'),dock=$('.atlas-mobile-dock'),sidebar=$('.atlas-sidebar');
  if(!toggle||!dock||!sidebar)return;
  if(!toggle.querySelector('span')){const label=document.createElement('span');label.textContent='目录';toggle.append(label);}
  function closeDirectory(){document.body.classList.remove('atlas-menu-open');toggle.setAttribute('aria-expanded','false');}
  function travel(view){
   closeDirectory();
   if(!$('.trip-mode-overlay'))$('.trip-mode-launch')?.click();
   if(view==='expense'){
    const mount=()=>{const tab=$('.trip-mode-overlay [data-trip-view="expense"]');if(tab){tab.click();return true;}return false;};
    if(!mount())requestAnimationFrame(()=>{if(!mount())window.miniToolToast?.('记账未能启动，请重新打开手册。');});
   }
  }
  if(!dock.querySelector('[data-dock="ledger"]')){
   const button=document.createElement('button');button.type='button';button.dataset.dock='ledger';
   button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5ZM8 7h8M8 11h3M14 11h2M8 15h3M14 15h2M8 18h8"/></svg><span>记账</span>';
   button.onclick=()=>travel('expense');dock.querySelector('[data-dock="trip"]').after(button);
  }
  const tools=document.createElement('div');tools.className='complete-directory-tools';tools.setAttribute('aria-label','完整旅行工具');
  const actions=[['旅行模式',()=>travel('itinerary')],['记账与分摊',()=>travel('expense')],['搜索手册',()=>{closeDirectory();$('.atlas-search-trigger')?.click();}],['调整行程',()=>{closeDirectory();window.BaliCustomizer?.open();}]];
  actions.forEach(([label,action])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;tools.append(b);});
  sidebar.querySelector('nav').after(tools);
  const status=document.createElement('p');status.className='complete-storage-status';status.hidden=true;status.setAttribute('role','status');tools.after(status);
  try{const key='travel-mobile-storage-probe';localStorage.setItem(key,'1');if(localStorage.getItem(key)!=='1')throw Error('storage');localStorage.removeItem(key);}
  catch{status.hidden=false;status.textContent='当前打开方式不允许本机保存。记账、清单和草稿无法可靠留存，请在允许本地网页存储的浏览器中打开。';}
  function viewport(){const v=window.visualViewport;document.documentElement.style.setProperty('--phone-usable-height',(v?v.height:innerHeight)+'px');}
  viewport();window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);
  document.documentElement.dataset.completeMobile='ready';
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
