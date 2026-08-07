// Footer year (all pages)
var yr = document.getElementById('yr');
if (yr) yr.textContent = new Date().getFullYear();

// Theme toggle. No stored preference means "follow the system"; clicking pins an
// explicit choice, which the CSS honours over prefers-color-scheme in both
// directions. The pre-paint script in <head> applies the stored value.
(function () {
  var buttons = document.querySelectorAll('.theme-toggle');
  if (!buttons.length) return;

  var media = window.matchMedia('(prefers-color-scheme: dark)');

  function current() {
    var pinned = document.documentElement.getAttribute('data-theme');
    return pinned === 'light' || pinned === 'dark' ? pinned : (media.matches ? 'dark' : 'light');
  }

  function label() {
    var next = current() === 'dark' ? 'light' : 'dark';
    buttons.forEach(function (b) {
      b.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      b.setAttribute('title', 'Switch to ' + next + ' theme');
    });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      label();
    });
  });

  // Keep the label right when the system flips and nothing is pinned.
  if (media.addEventListener) media.addEventListener('change', label);
  label();
})();

// Draw-on animation for the Fig. 1 ROC curves (home only); skipped for reduced-motion users.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.draw').forEach(function (p, i) {
    var L = p.getTotalLength();
    p.style.strokeDasharray = L;
    p.style.strokeDashoffset = L;
    p.getBoundingClientRect(); // force layout
    p.style.transition = 'stroke-dashoffset 1.1s ' + (0.25 + i * 0.35) + 's cubic-bezier(.4,0,.2,1)';
    p.style.strokeDashoffset = '0';
  });
}

// One-page sidebar: expandable sub-navigation, mobile menu, and scroll spy.
(function () {
  var nav = document.getElementById('side-nav');
  if (!nav) return;

  var groups = Array.prototype.slice.call(nav.querySelectorAll('.side-group'));
  var toggle = document.querySelector('.nav-toggle');
  var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));

  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + id);
      }
      document.body.classList.remove('nav-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  });

  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var sections = Array.prototype.slice.call(document.querySelectorAll('.onepage-section[data-section]'));
  if (!('IntersectionObserver' in window)) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var id = entry.target.getAttribute('data-section');
      var active = nav.querySelector('[data-nav-section="' + id + '"]');
      groups.forEach(function (group) { group.classList.toggle('active', group === active); });
    });
  }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });

  sections.forEach(function (section) { observer.observe(section); });
})();

// Slide-to-reveal photo and time-lapse on the homepage.
(function () {
  var box = document.querySelector('.reveal');
  if (!box) return;
  var range = box.querySelector('.rv-range');
  var video = box.querySelector('video');

  function updateReveal() {
    box.style.setProperty('--pos', range.value + '%');
    if (parseFloat(range.value) >= 96) {
      box.classList.add('unlocked');
      if (video && video.paused) video.play().catch(function () {});
    } else {
      box.classList.remove('unlocked');
    }
  }

  range.addEventListener('input', updateReveal);
  updateReveal();
})();

(function () {
  var dialog = document.querySelector('.panorama-dialog');
  var openButtons = document.querySelectorAll('[data-panorama-open]');
  if (!dialog || !openButtons.length || typeof dialog.showModal !== 'function') return;

  var viewport = dialog.querySelector('.panorama-viewport');
  var image = dialog.querySelector('.panorama-image');
  var level = dialog.querySelector('[data-panorama-level]');
  var status = dialog.querySelector('[data-panorama-status]');
  var scale = 1;
  var offsetX = 0;
  var offsetY = 0;
  var fullLoaded = false;
  var pointers = new Map();
  var dragStart = null;
  var pinchStart = null;

  function baseSize() {
    return { width: image.offsetWidth, height: image.offsetHeight };
  }

  function clampOffsets() {
    var base = baseSize();
    var maxX = Math.max(0, (base.width * scale - viewport.clientWidth) / 2);
    var maxY = Math.max(0, (base.height * scale - viewport.clientHeight) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
    offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
  }

  function renderPanorama() {
    clampOffsets();
    image.style.transform = 'translate(-50%,-50%) translate3d(' + offsetX + 'px,' + offsetY + 'px,0) scale(' + scale + ')';
    level.textContent = Math.round(scale * 100) + '%';
  }

  function loadFull() {
    if (fullLoaded) return;
    fullLoaded = true;
    status.textContent = 'Loading 18,493px original…';
    var full = image.getAttribute('data-full-src');
    var loader = new Image();
    loader.onload = function () {
      image.src = full;
      status.textContent = 'Full-resolution original';
      renderPanorama();
    };
    loader.onerror = function () {
      fullLoaded = false;
      status.textContent = 'Preview mode · original unavailable';
    };
    loader.src = full;
  }

  function setZoom(next, clientX, clientY) {
    var previous = scale;
    scale = Math.max(1, Math.min(20, next));
    if (clientX != null && clientY != null) {
      var rect = viewport.getBoundingClientRect();
      var pointX = clientX - rect.left - rect.width / 2;
      var pointY = clientY - rect.top - rect.height / 2;
      offsetX = pointX - (pointX - offsetX) * (scale / previous);
      offsetY = pointY - (pointY - offsetY) * (scale / previous);
    }
    if (scale >= 2.5) loadFull();
    else if (scale > 1) status.textContent = image.naturalWidth > 3000 ? 'Zoomed view · full-resolution original' : 'Zoomed view · 3000px preview';
    renderPanorama();
  }

  function fitPanorama() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    status.textContent = image.naturalWidth > 3000 ? 'Fit view · full-resolution original' : 'Fit view · 3000px preview';
    renderPanorama();
  }

  openButtons.forEach(function (openButton) {
    openButton.addEventListener('click', function (event) {
      event.preventDefault();
      dialog.showModal();
      document.body.classList.add('panorama-open');
      requestAnimationFrame(fitPanorama);
    });
  });

  dialog.querySelector('[data-panorama-close]').addEventListener('click', function () { dialog.close(); });
  dialog.querySelector('[data-panorama-fit]').addEventListener('click', fitPanorama);
  dialog.querySelector('[data-panorama-in]').addEventListener('click', function () { setZoom(scale * 1.35); });
  dialog.querySelector('[data-panorama-out]').addEventListener('click', function () { setZoom(scale / 1.35); });
  dialog.querySelector('[data-panorama-actual]').addEventListener('click', function () {
    loadFull();
    setZoom(Math.min(20, 18493 / Math.max(1, baseSize().width)));
  });

  dialog.addEventListener('close', function () {
    document.body.classList.remove('panorama-open');
    fitPanorama();
  });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });

  viewport.addEventListener('wheel', function (event) {
    event.preventDefault();
    setZoom(scale * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY);
  }, { passive: false });

  viewport.addEventListener('dblclick', function (event) {
    setZoom(scale > 1.1 ? 1 : 2.5, event.clientX, event.clientY);
  });

  viewport.addEventListener('pointerdown', function (event) {
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.classList.add('is-dragging');
    if (pointers.size === 1) dragStart = { x: event.clientX, y: event.clientY, offsetX: offsetX, offsetY: offsetY };
    if (pointers.size === 2) {
      var points = Array.from(pointers.values());
      pinchStart = { distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y), scale: scale };
    }
  });

  viewport.addEventListener('pointermove', function (event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinchStart) {
      var points = Array.from(pointers.values());
      var distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      setZoom(pinchStart.scale * distance / Math.max(1, pinchStart.distance));
    } else if (dragStart && scale > 1) {
      offsetX = dragStart.offsetX + event.clientX - dragStart.x;
      offsetY = dragStart.offsetY + event.clientY - dragStart.y;
      renderPanorama();
    }
  });

  function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      dragStart = null;
      pinchStart = null;
      viewport.classList.remove('is-dragging');
    } else if (pointers.size === 1) {
      var point = Array.from(pointers.values())[0];
      dragStart = { x: point.x, y: point.y, offsetX: offsetX, offsetY: offsetY };
      pinchStart = null;
    }
  }

  viewport.addEventListener('pointerup', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  window.addEventListener('resize', renderPanorama);
})();
