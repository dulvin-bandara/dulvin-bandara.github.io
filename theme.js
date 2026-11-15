/* ============================================================
   Theme toggle.
   The initial theme is set by the inline snippet in <head> so
   there is no flash. This file wires the button, keeps the
   browser-chrome colour (theme-color) in step, and wires the
   hero's pause control where there is one.
   ============================================================ */

(function () {
  var btn = document.querySelector('.themetoggle');
  if (!btn) return;

  var CHROME = { light: '#FAF9F6', dark: '#0E1114' };

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function label() {
    var next = current() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.setAttribute('title', 'Switch to ' + next + ' theme');
  }

  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    // a page can carry its own pair (data-light / data-dark), as the index does
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', meta.getAttribute('data-' + next) || CHROME[next]);
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      /* private mode: the choice just won't persist */
    }
    label();
  });

  label();
})();

/* ============================================================
   Hero pause control: the collage cards drift indefinitely, so
   there is a button to stop them.
   ============================================================ */

(function () {
  var btn = document.querySelector('.heropause');
  var hero = btn && btn.closest('.hero');
  if (!hero) return;

  btn.addEventListener('click', function () {
    var paused = hero.classList.toggle('is-paused');
    btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    btn.setAttribute('aria-label', paused ? 'Play background motion' : 'Pause background motion');
  });
})();
