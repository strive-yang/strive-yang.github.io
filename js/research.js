(function () {
  const slides = Array.from(document.querySelectorAll('[data-slide]'));
  const count = document.querySelector('[data-slide-count]');
  const previous = document.querySelector('[data-slide-prev]');
  const next = document.querySelector('[data-slide-next]');
  const present = document.querySelector('[data-present-toggle]');
  if (!slides.length || !count || !previous || !next || !present) return;

  let current = 0;
  let ticking = false;

  function update() {
    const target = 150;
    current = slides.reduce((best, slide, index) =>
      Math.abs(slide.getBoundingClientRect().top - target) <
      Math.abs(slides[best].getBoundingClientRect().top - target) ? index : best, 0);
    count.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
    previous.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    ticking = false;
  }

  function go(delta) {
    const index = Math.max(0, Math.min(slides.length - 1, current + delta));
    slides[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', '#' + slides[index].id);
    current = index;
    update();
  }

  previous.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  present.addEventListener('click', async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.querySelector('.site-shell').requestFullscreen) await document.querySelector('.site-shell').requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    present.textContent = document.fullscreenElement ? '退出全屏' : '全屏演示';
  });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); go(1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(-1); }
  });
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
