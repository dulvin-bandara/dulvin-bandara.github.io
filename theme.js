/* ============================================================
   Theme toggle.
   The initial theme is set by the inline snippet in <head> so
   there is no flash. This file only wires the button.
   ============================================================ */

(function () {
  var btn = document.querySelector('.themetoggle');
  if (!btn) return;

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
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      /* private mode — the choice just won't persist */
    }
    label();
  });

  label();
})();
