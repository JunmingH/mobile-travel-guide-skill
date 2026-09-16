(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const hasGSAP = typeof window.gsap !== 'undefined';
  const enter = (el, options = {}) => {
    const y = options.y == null ? 20 : options.y;
    const duration = options.duration || 620;
    const delay = options.delay || 0;
    if (hasGSAP) {
      window.gsap.fromTo(el, { opacity: 0, y }, {
        opacity: 1, y: 0, duration: duration / 1000, delay: delay / 1000,
        ease: 'power2.out', clearProps: 'transform,opacity'
      });
      return;
    }
    el.animate([
      { opacity: 0, transform: `translate3d(0,${y}px,0)` },
      { opacity: 1, transform: 'translate3d(0,0,0)' }
    ], { duration, delay, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' })
      .finished.then(() => { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); })
      .catch(() => {});
  };

  const intro = [
    ['.jungle-cover-kicker', 0, 14, 520],
    ['.jungle-cover h1', 150, 28, 820],
    ['.jungle-cover .lede', 330, 16, 620],
    ['.jungle-cover-tags', 430, 14, 560],
    ['.jungle-cover-bottom', 520, 12, 520]
  ];
  intro.forEach(([selector, delay, y, duration]) => {
    const el = document.querySelector(selector);
    if (el) enter(el, { delay, y, duration });
  });

  const selector = '.contents-grid a,.section-heading,.tips-page.tips-fold,.food-chapter,.movement-card,.spa-card,.sight-card';
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        enter(entry.target, { y: 22, duration: 640 });
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    document.querySelectorAll(selector).forEach(el => observer.observe(el));
  }

  document.querySelectorAll('summary,.contents-grid a,.route-glass-button').forEach(el => {
    el.addEventListener('pointerdown', () => {
      if (hasGSAP) window.gsap.to(el, { scale: .975, duration: .12, ease: 'power1.out' });
      else el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.975)' }], { duration: 120, fill: 'forwards' });
    });
    const release = () => {
      if (hasGSAP) window.gsap.to(el, { scale: 1, duration: .28, ease: 'back.out(2)' });
      else el.animate([{ transform: 'scale(.975)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.25,1.3)' });
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  });
})();
