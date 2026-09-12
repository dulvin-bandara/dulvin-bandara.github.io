/* ============================================================
   Rotating project gallery
   Markup: <div class="gallery" data-interval="5000"> with
   <figure class="gslide"> children. Controls and dots are
   generated. Autoplay pauses on hover, focus, and when the
   tab is hidden; disabled entirely under reduced-motion.
   ============================================================ */

(function () {
  var galleries = document.querySelectorAll('.gallery');
  if (!galleries.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  Array.prototype.forEach.call(galleries, function (gal) {
    var slides = gal.querySelectorAll('.gslide');
    if (slides.length < 2) {
      if (slides[0]) slides[0].classList.add('is-active');
      return;
    }

    var interval = parseInt(gal.dataset.interval, 10) || 5000;
    var i = 0;
    var timer = null;

    // ---- build controls ----
    var nav = document.createElement('div');
    nav.className = 'gnav';

    var prev = document.createElement('button');
    prev.className = 'gbtn gprev';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous image');
    prev.innerHTML = '&#8249;';

    var next = document.createElement('button');
    next.className = 'gbtn gnext';
    next.type = 'button';
    next.setAttribute('aria-label', 'Next image');
    next.innerHTML = '&#8250;';

    var dots = document.createElement('div');
    dots.className = 'gdots';
    dots.setAttribute('role', 'tablist');

    Array.prototype.forEach.call(slides, function (s, n) {
      var d = document.createElement('button');
      d.className = 'gdot';
      d.type = 'button';
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', 'Image ' + (n + 1) + ' of ' + slides.length);
      d.addEventListener('click', function () { go(n); restart(); });
      dots.appendChild(d);
    });

    nav.appendChild(prev);
    nav.appendChild(dots);
    nav.appendChild(next);
    gal.appendChild(nav);

    var dotEls = dots.querySelectorAll('.gdot');

    // ---- state ----
    function go(n) {
      i = (n + slides.length) % slides.length;
      Array.prototype.forEach.call(slides, function (s, k) {
        s.classList.toggle('is-active', k === i);
        s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
      });
      Array.prototype.forEach.call(dotEls, function (d, k) {
        d.classList.toggle('is-active', k === i);
        d.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
    }

    function start() {
      if (reduced || timer) return;
      timer = setInterval(function () { go(i + 1); }, interval);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function restart() { stop(); start(); }

    prev.addEventListener('click', function () { go(i - 1); restart(); });
    next.addEventListener('click', function () { go(i + 1); restart(); });

    gal.addEventListener('mouseenter', stop);
    gal.addEventListener('mouseleave', start);
    gal.addEventListener('focusin', stop);
    gal.addEventListener('focusout', start);

    gal.setAttribute('tabindex', '0');
    gal.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); restart(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); restart(); }
    });

    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });

    go(0);
    start();
  });
})();
