/* The page below the sky. A still field of faint stars sits behind it, drawn once per size, and the
   top bar takes on the page's colours once the sky has scrolled away. Nothing here runs per frame,
   so scrolling costs nothing. */
(function () {
  'use strict';
  var root = document.documentElement;
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  function css(name, d) { return getComputedStyle(root).getPropertyValue(name).trim() || d; }

  /* ---- the bar: transparent over the sky, the page's colours below it ------------------------ */
  var hero = document.querySelector('.sky-hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { root.classList.toggle('past-hero', !e[0].isIntersecting); },
      { rootMargin: '-60px 0px 0px 0px' }).observe(hero);
  } else root.classList.add('past-hero');

  /* ---- the field ------------------------------------------------------------------------------ */
  var field = document.querySelector('canvas.page-field');
  function drawField() {
    if (!field) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    field.width = Math.round(w * dpr); field.height = Math.round(h * dpr);
    var c = field.getContext('2d'), rgb = css('--field', '190, 200, 225'), k = parseFloat(css('--field-strength', '1')) || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.font = '9px ' + MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
    var seed = 20261027;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0, n = Math.round(w * h / 5200); i < n; i++) {
      var m = Math.pow(rnd(), 4);
      c.fillStyle = 'rgba(' + rgb + ',' + ((0.1 + 0.42 * m) * k).toFixed(3) + ')';
      c.fillText(m > 0.6 ? '+' : (m > 0.25 ? '·' : '.'), Math.round(rnd() * w), Math.round(rnd() * h));
    }
  }

  /* ---- redraw on resize and on a theme switch ------------------------------------------------- */
  drawField();
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawField, 200); });
  new MutationObserver(drawField).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();
