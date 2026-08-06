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

(function () {
  var map = document.querySelector('.journeymap');
  var buttons = document.querySelectorAll('[data-map-layer]');
  if (!map || !buttons.length) return;

  var captions = {
    life: 'Shanghai → Atlanta → Bay Area',
    travel: 'China · Southeast Asia · United States',
    all: 'Where life and curiosity have taken me'
  };
  var caption = map.querySelector('[data-map-caption]');

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var layer = button.getAttribute('data-map-layer');
      map.setAttribute('data-layer', layer);
      buttons.forEach(function (item) {
        var active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (caption) caption.textContent = captions[layer];
    });
  });

  map.setAttribute('data-layer', 'life');
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
