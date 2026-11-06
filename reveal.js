/* ============================================================
   Scroll reveal.
   Content is visible by default. This script opts the page in
   by adding .js-reveal to <html>, so a JS failure or a crawler
   still sees everything.
   ============================================================ */

(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;

  var targets = document.querySelectorAll(
    'section, .entry, .plate, .plaperow, .gallery, .figures, .dtable, .projlink'
  );
  if (!targets.length) return;

  document.documentElement.classList.add('js-reveal');

  Array.prototype.forEach.call(targets, function (el) {
    el.classList.add('reveal');
  });

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.04 }
  );

  Array.prototype.forEach.call(targets, function (el) {
    io.observe(el);
  });

  // Anything already in view on load reveals immediately, without waiting
  // for a scroll event.
  window.addEventListener('load', function () {
    Array.prototype.forEach.call(targets, function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add('is-visible');
        io.unobserve(el);
      }
    });
  });
})();

/* ============================================================
   Full-bleed hero: size it to the space actually left below the
   nav, so it ends exactly at the fold instead of overshooting by
   however tall the nav happens to render.
   ============================================================ */

(function () {
  var hero = document.querySelector('.hero[data-wall="full"], .hero[data-wall="collage"]');
  if (!hero) return;

  function measure() {
    hero.style.removeProperty('--hero-offset');
    var top = hero.getBoundingClientRect().top + window.scrollY;
    hero.style.setProperty('--hero-offset', Math.round(top) + 'px');
  }

  measure();
  // fonts change the nav height once they swap in
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener('load', measure);

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(measure, 120);
  });
})();
