/* ============================================================
   Image lightbox
   Auto-binds to every <img> inside a .plate or .gslide figure.
   No markup changes needed: each image is wrapped in a real
   <button>, so keyboard and screen-reader support are native.
   Uses <dialog> so Esc, focus trapping and focus return come
   for free.
   ============================================================ */

(function () {
  var images = document.querySelectorAll('.plate img, .gslide img');
  if (!images.length || !window.HTMLDialogElement) return;

  // build the dialog once
  var dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', 'Enlarged image');
  dlg.innerHTML =
    '<button class="lightbox-close" type="button" aria-label="Close image">&times;</button>' +
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

  Array.prototype.forEach.call(images, function (img) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zoom';
    // the image's alt text stays the button's name; this adds what it does
    btn.title = 'Expand image';
    img.parentNode.insertBefore(btn, img);
    btn.appendChild(img);
    btn.addEventListener('click', function () { open(img); });
  });

  closeBtn.addEventListener('click', function () { dlg.close(); });

  // click on the backdrop area (the dialog itself, not its contents),
  // or on the enlarged image, which shows a zoom-out cursor
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target === lbImg) dlg.close();
  });

  // release the image so a large file isn't held in memory
  dlg.addEventListener('close', function () {
    lbImg.removeAttribute('src');
  });
})();
