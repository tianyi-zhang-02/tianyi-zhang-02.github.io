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
  var regionToolbar = document.querySelector('.map-region-toolbar');
  var regionButtons = document.querySelectorAll('[data-map-region]');
  var regionStatus = document.querySelector('.map-region-status');
  var svg = document.getElementById('journey-map-svg');
  if (!map || !buttons.length) return;

  var captions = {
    life: 'Shanghai → Atlanta → Bay Area',
    travel: 'China · Asia-Pacific · Europe · United States',
    all: 'Where life and curiosity have taken me'
  };
  var views = {
    world: { box: '380 120 1240 380', label: 'Choose a region to separate nearby stops.' },
    china: { box: '440 230 411 126', label: 'China & East Asia — western landscapes, major cities, Hong Kong, Macau, and Taiwan.' },
    europe: { box: '960 245 205 63', label: 'Europe — northern Italy, Milan, Florence, Siena, Rome, Vatican City, Pompeii, and Santorini.' },
    us: { box: '1175 245 410 126', label: 'United States — California, the Grand Circle, the Southeast, Florida, Chicago, and DC.' },
    asia: { box: '560 330 360 110', label: 'Asia-Pacific — Thailand, Brunei, Bali, and Australia\'s Gold Coast.' }
  };
  var caption = map.querySelector('[data-map-caption]');

  function setRegion(region) {
    var view = views[region] || views.world;
    map.setAttribute('data-view', region);
    if (svg) svg.setAttribute('viewBox', view.box);
    regionButtons.forEach(function (item) {
      var active = item.getAttribute('data-map-region') === region;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (regionStatus) regionStatus.textContent = view.label;
    map.scrollLeft = 0;
  }

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
      if (regionToolbar) regionToolbar.hidden = layer === 'life';
      if (layer === 'life') setRegion('world');
    });
  });

  regionButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setRegion(button.getAttribute('data-map-region'));
    });
  });

  map.setAttribute('data-layer', 'life');
  setRegion('world');
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
