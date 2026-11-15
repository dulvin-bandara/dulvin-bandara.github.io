/* ============================================================
   Application shell.
   The page is laid out like a CFD package: a ribbon across the
   top, an outline tree down the left, the page in the main
   pane, a status bar along the bottom. This file:
     - turns the outline into a drawer on narrow screens
     - lists the current page's sections under its tree item
     - runs the status bar's iteration / residual readout from
       the scroll position
   Everything here is enhancement: the tree and ribbon are plain
   links in the HTML and work without it.
   ============================================================ */

(function () {
  var root = document.documentElement;
  root.classList.add('js-shell');

  var outline = document.getElementById('outline');
  var toggle = document.querySelector('.outlinetoggle');

  /* ---- drawer ---- */
  if (outline && toggle) {
    toggle.hidden = false;
    var setOpen = function (open) {
      root.classList.toggle('outline-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', function () {
      setOpen(!root.classList.contains('outline-open'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('outline-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    outline.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!root.classList.contains('outline-open')) return;
      if (!e.target.closest('#outline') && !e.target.closest('.outlinetoggle')) setOpen(false);
    });
  }

  /* ---- this page's sections, under the current tree item ---- */
  var current = outline && outline.querySelector('a[aria-current="page"]');
  var heads = document.querySelectorAll('main section h3');
  // only long-form pages: project write-ups, not card lists
  if (current && heads.length >= 3 && !document.querySelector('main .projlink:not(.noimg)')) {
    var sub = document.createElement('ul');
    sub.className = 'tsub';
    var links = [];
    Array.prototype.forEach.call(heads, function (h, n) {
      if (h.closest('.projlink')) return;
      if (!h.id) h.id = 's' + (n + 1) + '-' + h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      sub.appendChild(li);
      links.push({ h: h, a: a });
    });
    current.parentNode.appendChild(sub);

    if ('IntersectionObserver' in window && links.length) {
      var mark = function () {
        var best = links[0];
        links.forEach(function (l) {
          if (l.h.getBoundingClientRect().top < 140) best = l;
        });
        links.forEach(function (l) { l.a.classList.toggle('is-here', l === best); });
      };
      var q = 0;
      window.addEventListener('scroll', function () {
        if (!q) q = requestAnimationFrame(function () { q = 0; mark(); });
      }, { passive: true });
      mark();
    }
  }

  /* ---- status bar: scroll position as a solver run ---- */
  var nEl = document.querySelector('.sb-n');
  var rEl = document.querySelector('.sb-r');
  var bar = document.querySelector('.sb-bar i');
  if (nEl && rEl) {
    var raf = 0;
    var update = function () {
      raf = 0;
      var max = root.scrollHeight - window.innerHeight;
      var f = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      var it = Math.round(f * 1000);
      nEl.textContent = ('000' + it).slice(-4);
      rEl.textContent = f >= 0.999 ? 'converged' : Math.pow(10, -6 * f).toExponential(1);
      if (bar) bar.style.width = f * 100 + '%';
    };
    var queue = function () { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    window.addEventListener('load', queue);
    update();
  }
})();
