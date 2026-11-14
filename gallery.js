/* ============================================================
   Rotating project gallery
   Markup: <div class="gallery" data-interval="5000"> with
   <figure class="gslide"> children. Controls and dots are
   generated. Autoplay pauses on hover, focus, and when the
   tab is hidden; the pause button stops it for good; it is
   disabled entirely under reduced-motion.
   ============================================================ */

(function () {
  var galleries = document.querySelectorAll('.gallery');
  if (!galleries.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ICON_PAUSE = '<svg class="i-pause" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9"/><rect x="7" y="1.5" width="3" height="9"/></svg>';
  var ICON_PLAY = '<svg class="i-play" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.5 1.5v9l8-4.5z"/></svg>';

  function button(cls, label, html) {
    var b = document.createElement('button');
    b.className = cls;
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = html;
    return b;
  }

  Array.prototype.forEach.call(galleries, function (gal) {
    var slides = gal.querySelectorAll('.gslide');
    if (slides.length < 2) {
      if (slides[0]) slides[0].classList.add('is-active');
      return;
    }

    var stage = gal.querySelector('.gstage');
    var interval = parseInt(gal.dataset.interval, 10) || 5000;
    var i = 0;
    var timer = null;
    var userPaused = reduced;   // set by the pause button; hover/focus only hold

    gal.setAttribute('role', 'group');
    gal.setAttribute('aria-roledescription', 'carousel');
    if (!gal.hasAttribute('aria-label')) gal.setAttribute('aria-label', 'Project images');

    // ---- build controls ----
    var nav = document.createElement('div');
    nav.className = 'gnav';

    var prev = button('gbtn gprev', 'Previous image', '&#8249;');
    var next = button('gbtn gnext', 'Next image', '&#8250;');
    var play = button('gbtn gplay', 'Pause slideshow', ICON_PAUSE + ICON_PLAY);
    play.setAttribute('aria-pressed', 'false');

    var dots = document.createElement('div');
    dots.className = 'gdots';

    Array.prototype.forEach.call(slides, function (s, n) {
      var d = button('gdot', 'Show image ' + (n + 1) + ' of ' + slides.length, '');
      d.addEventListener('click', function () { go(n); restart(); });
      dots.appendChild(d);
    });

    nav.appendChild(prev);
    nav.appendChild(dots);
    if (!reduced) nav.appendChild(play);
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
        if (k === i) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
    }

    function start() {
      if (userPaused || timer) return;
      timer = setInterval(function () { go(i + 1); }, interval);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function restart() { stop(); start(); }

    function setPaused(p) {
      userPaused = p;
      play.setAttribute('aria-pressed', p ? 'true' : 'false');
      play.setAttribute('aria-label', p ? 'Play slideshow' : 'Pause slideshow');
      // announce slide changes only when the user is driving
      if (stage) stage.setAttribute('aria-live', p ? 'polite' : 'off');
      p ? stop() : start();
    }

    prev.addEventListener('click', function () { go(i - 1); restart(); });
    next.addEventListener('click', function () { go(i + 1); restart(); });
    play.addEventListener('click', function () { setPaused(!userPaused); });

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
    setPaused(reduced);
  });
})();
