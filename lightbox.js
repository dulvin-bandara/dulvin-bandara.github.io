/* ============================================================
   Image lightbox
   Auto-binds to every <img> inside a .plate figure.
   No markup changes needed. Uses native <dialog> so Esc
   and focus trapping come for free.
   ============================================================ */

(function () {
  var figures = document.querySelectorAll('.plate img');
  if (!figures.length || !window.HTMLDialogElement) return;

  // build the dialog once
  var dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.innerHTML =
    '<button class="lightbox-close" aria-label="Close image">&times;</button>' +
    '<figure class="lightbox-inner">' +
      '<img alt="">' +
      '<figcaption></figcaption>' +
    '</figure>';
  document.body.appendChild(dlg);

  var lbImg = dlg.querySelector('img');
  var lbCap = dlg.querySelector('figcaption');
  var closeBtn = dlg.querySelector('.lightbox-close');

  function open(img) {
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt || '';

    var fig = img.closest('figure');
    var cap = fig ? fig.querySelector('figcaption') : null;
    if (cap && cap.textContent.trim()) {
      lbCap.textContent = cap.textContent.trim();
      lbCap.hidden = false;
    } else {
      lbCap.hidden = true;
    }

    dlg.showModal();
  }

  Array.prototype.forEach.call(figures, function (img) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Expand image');
    img.addEventListener('click', function () { open(img); });
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(img);
      }
    });
  });

  closeBtn.addEventListener('click', function () { dlg.close(); });

  // click on the backdrop area (the dialog itself, not its contents)
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) dlg.close();
  });

  // release the image so a large file isn't held in memory
  dlg.addEventListener('close', function () {
    lbImg.removeAttribute('src');
  });
})();
