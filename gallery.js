/* Renders albums + photos from gallery-data.js, with an in-page album view and
   a lightbox. No dependencies. Data lives in gallery-data.js (ALBUMS). */
(function () {
  var albumsEl = document.getElementById('albums');
  var viewEl   = document.getElementById('album-view');
  var lb       = document.getElementById('lightbox');
  if (!albumsEl || typeof ALBUMS === 'undefined') return;

  var current = null;   // photos of the album currently open
  var idx = 0;          // lightbox index

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c];
    });
  }

  /* ---------- album grid ---------- */
  function renderAlbums() {
    viewEl.hidden = true;
    albumsEl.hidden = false;
    albumsEl.innerHTML = '';
    if (!ALBUMS.length) {
      albumsEl.appendChild(el('p', 'lede', 'No albums yet.'));
      return;
    }
    ALBUMS.forEach(function (a, i) {
      var card = el('button', 'album-card');
      card.type = 'button';
      card.setAttribute('aria-label', 'Open album: ' + a.title);
      var cover = a.cover || (a.photos && a.photos[0] && a.photos[0].src) || '';
      var count = (a.photos || []).length;
      card.innerHTML =
        '<span class="album-thumb"><img loading="lazy" src="' + esc(cover) + '" alt=""></span>' +
        '<span class="album-meta">' +
          '<span class="album-title">' + esc(a.title) + '</span>' +
          (a.name ? '<span class="album-name">' + esc(a.name) + '</span>' : '') +
          '<span class="album-count">' + count + (count === 1 ? ' photo' : ' photos') + '</span>' +
        '</span>';
      card.addEventListener('click', function () { openAlbum(i); });
      albumsEl.appendChild(card);
    });
  }

  /* ---------- single album ---------- */
  function openAlbum(i) {
    var a = ALBUMS[i];
    current = a.photos || [];
    albumsEl.hidden = true;
    viewEl.hidden = false;
    viewEl.innerHTML = '';

    var back = el('button', 'back', '← All albums');
    back.type = 'button';
    back.addEventListener('click', renderAlbums);
    viewEl.appendChild(back);

    var head = el('header', 'album-head');
    head.innerHTML = '<h2>' + esc(a.title) + '</h2>' +
      (a.name ? '<p class="album-name">' + esc(a.name) + '</p>' : '');
    viewEl.appendChild(head);

    var grid = el('div', 'photo-grid');
    current.forEach(function (p, k) {
      var fig = el('figure', 'photo');
      fig.innerHTML =
        '<button type="button" class="photo-btn" aria-label="View photo">' +
          '<img loading="lazy" src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '">' +
        '</button>' +
        '<figcaption>' +
          (p.title ? '<span class="ph-title">' + esc(p.title) + '</span>' : '') +
          (p.location ? '<span class="ph-loc">' + esc(p.location) + '</span>' : '') +
        '</figcaption>';
      fig.querySelector('.photo-btn').addEventListener('click', function () { openLightbox(k); });
      grid.appendChild(fig);
    });
    viewEl.appendChild(grid);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- lightbox ---------- */
  function openLightbox(k) {
    idx = k;
    paint();
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lb.querySelector('.lb-close').focus();
  }
  function closeLightbox() {
    lb.hidden = true;
    document.body.style.overflow = '';
  }
  function step(d) {
    if (!current || !current.length) return;
    idx = (idx + d + current.length) % current.length;
    paint();
  }
  function paint() {
    var p = current[idx];
    lb.querySelector('.lb-img').src = p.src;
    lb.querySelector('.lb-img').alt = p.title || '';
    lb.querySelector('.lb-title').textContent = p.title || '';
    lb.querySelector('.lb-loc').textContent = p.location || '';
    lb.querySelector('.lb-count').textContent = (idx + 1) + ' / ' + current.length;
  }

  lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
  lb.querySelector('.lb-prev').addEventListener('click', function () { step(-1); });
  lb.querySelector('.lb-next').addEventListener('click', function () { step(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  renderAlbums();
})();
