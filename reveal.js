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
