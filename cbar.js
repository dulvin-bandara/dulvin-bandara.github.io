/* ============================================================
   Colourbar scroll indicator.
   A vertical inferno colourbar on the viewport edge with a tick
   at the current scroll fraction. Decorative: the scrollbar
   already carries the same information, so it is aria-hidden
   and skipped entirely under reduced motion and on narrow
   screens.
   ============================================================ */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 860) return;

  var bar = document.createElement('div');
  bar.className = 'cbar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<div class="cbar-tick"></div><div class="cbar-val">0.00</div>';
  document.body.appendChild(bar);

  var tick = bar.querySelector('.cbar-tick');
  var val = bar.querySelector('.cbar-val');
  var raf = 0;

  function update() {
    raf = 0;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var f = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    tick.style.top = f * 100 + '%';
    val.style.top = f * 100 + '%';
    val.textContent = f.toFixed(2);
  }

  function queue() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('load', queue);
  update();
})();
