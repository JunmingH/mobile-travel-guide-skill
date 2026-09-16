/* Public shell; the access code and decrypted handbook are never hosted here. */
(()=>{'use strict';
 const $=s=>document.querySelector(s),status=text=>{$('#status').textContent=text},utf8=new TextEncoder();
 const bytes=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 async function derive(code,meta){
  const seed=await crypto.subtle.importKey('raw',utf8.encode(code),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(meta.salt),iterations:meta.iterations,hash:'SHA-256'},seed,{name:'AES-GCM',length:256},false,['decrypt']);
 }
 async function unwrap(key,meta){
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(meta.wrapIv),additionalData:utf8.encode('travel-content-key-v1')},key,bytes(meta.wrappedKey));
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 }
 async function manifest(){const response=await fetch('payload.json');if(!response.ok)throw Error('无法读取离线手册，请恢复网络后重试。');return response.json()}
 async function render(key,meta){
  const decoder=new TextDecoder(),parts=[];
  for(let i=0;i<meta.parts.length;i++){
   const part=meta.parts[i];status('正在打开手册 '+Math.round((i+1)/meta.parts.length*100)+'%…');
   const response=await fetch(part.file);if(!response.ok)throw Error('手册文件尚未保存完整，请恢复网络后重试。');
   const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(part.iv),additionalData:utf8.encode(part.aad)},key,await response.arrayBuffer());
   parts.push(decoder.decode(decrypted,{stream:true}));
  }
  parts.push(decoder.decode());const html=parts.join('');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(html))),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==meta.htmlSha256)throw Error('手册文件校验未通过，请联网重新保存。');
  document.open();document.write(html);document.close();
 }
 let preparation;
 async function prepare(){
  if(location.protocol==='file:'||!isSecureContext||!('serviceWorker'in navigator))throw Error('请用 Safari 打开正式 HTTPS 网址；不能直接打开 ZIP 内的文件。');
  await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'});
  await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('离线准备尚未完成，请检查网络后重新打开。')),120000))]);
 }
 async function start(){
  preparation=prepare();preparation.catch(error=>status(error.message));
  $('#unlock-form').addEventListener('submit',async event=>{
   event.preventDefault();const button=$('button[type=submit]');button.disabled=true;
   try{
    status('正在准备手册，请保持联网…');await preparation;const meta=await manifest();
    const wrapKey=await derive($('#code').value,meta);let key;
    try{key=await unwrap(wrapKey,meta)}catch{throw Error('访问码不正确，请重新输入。')}
    $('#code').value='';await render(key,meta);
   }catch(error){status(error.message||'暂时无法打开，请恢复网络后重试。');button.disabled=false}
  });
 }
 start();
})();
