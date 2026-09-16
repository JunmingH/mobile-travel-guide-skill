(function(){
  var root=document.documentElement;
  root.classList.add('motion-ready');

  var progress=document.querySelector('.reading-progress');
  function updateProgress(){if(!progress)return;var max=root.scrollHeight-innerHeight;progress.style.transform='scaleX('+(max>0?scrollY/max:0)+')'}
  addEventListener('scroll',updateProgress,{passive:true});updateProgress();

  if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window){
    var revealObserver=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.08});
    document.querySelectorAll('[data-reveal]').forEach(function(el,index){el.classList.add('reveal-item');el.style.setProperty('--reveal-order',index%6);revealObserver.observe(el)});
  }else{document.querySelectorAll('[data-reveal]').forEach(function(el){el.classList.add('is-visible')})}

  document.querySelectorAll('[data-gallery]').forEach(function(gallery){
    var images=[].slice.call(gallery.querySelectorAll('img')),index=0,count=gallery.querySelector('[data-gallery-count]');
    function show(next){if(!images.length)return;index=(next+images.length)%images.length;images.forEach(function(img,i){img.hidden=i!==index;img.setAttribute('aria-hidden',String(i!==index))});if(count)count.textContent=(index+1)+' / '+images.length}
    gallery.querySelectorAll('[data-gallery-prev]').forEach(function(btn){btn.addEventListener('click',function(){show(index-1)})});
    gallery.querySelectorAll('[data-gallery-next]').forEach(function(btn){btn.addEventListener('click',function(){show(index+1)})});show(0);
  });

  document.querySelectorAll('[data-check-item] input[type="checkbox"]').forEach(function(input,index){var key='travel-guide-check-'+(input.id||index);input.checked=localStorage.getItem(key)==='1';input.addEventListener('change',function(){localStorage.setItem(key,input.checked?'1':'0')})});

  var navLinks=[].slice.call(document.querySelectorAll('[data-guide-nav] a[href^="#"]'));
  if('IntersectionObserver' in window&&navLinks.length){var sections=navLinks.map(function(a){return document.querySelector(a.getAttribute('href'))}).filter(Boolean);var navObserver=new IntersectionObserver(function(entries){var visible=entries.filter(function(e){return e.isIntersecting}).sort(function(a,b){return b.intersectionRatio-a.intersectionRatio})[0];if(visible)navLinks.forEach(function(a){a.classList.toggle('is-active',a.getAttribute('href')==='#'+visible.target.id)})},{rootMargin:'-18% 0px -62% 0px',threshold:[0,.08,.2]});sections.forEach(function(section){navObserver.observe(section)})}
})();
