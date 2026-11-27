/* Photos in the sky's medium. At rest each photo is printed as one-bit dots in the page's ink on the
   page's paper, the way the hero draws its sky. Pointing at it, focusing it, or tapping it develops
   the real photo, the dots giving way in an ordered pattern; moving away prints it again (a second
   tap does the same on a touch screen). The panorama stays developed once its time-lapse slider has
   been used, since the dots would no longer match what it shows. Under reduced motion the change is
   immediate; when the browser asks to save data, or in print, the photos are shown as they are. */
(function () {
  'use strict';
  var frames = document.querySelectorAll('[data-develop]');
  if (!frames.length || !window.requestAnimationFrame) return;
  if (navigator.connection && navigator.connection.saveData) return;

  var root = document.documentElement;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RUN = 560;                 // ms for a full develop or print
  // 8×8 Bayer matrix as thresholds in (0, 1)
  var BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map(function (v) { return (v + 0.5) / 64; });

  var probe = document.createElement('canvas').getContext('2d');
  function rgb(css, fallback) {
    probe.fillStyle = fallback;
    if (css) probe.fillStyle = css;                    // a string the canvas cannot read leaves the fallback
    var c = probe.fillStyle;
    if (c.charAt(0) === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    var m = c.match(/[\d.]+/g);
    return [+m[0], +m[1], +m[2]];
  }
  function colours() {
    var s = getComputedStyle(root), light = root.getAttribute('data-theme') === 'light';
    return {
      light: light,
      ink: rgb(s.getPropertyValue('--ink').trim(), light ? '#161616' : '#ededed'),
      paper: rgb(s.getPropertyValue('--bg').trim(), light ? '#f5f4f0' : '#050507')
    };
  }
  function hash(x, y) {
    var h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function percentile(hist, n, q) {
    for (var i = 0, seen = 0; i < 256; i++) { seen += hist[i]; if (seen >= q * n) return i; }
    return 255;
  }

  Array.prototype.forEach.call(frames, function (frame) {
    var img = frame.querySelector('img');
    if (!img) return;
    var sticky = !!frame.querySelector('input');        // a frame you work with (the panorama's slider)
    var canvas = null, ctx, data, lum, rank, cols, rows, look;
    var shown = 0, target = 0, from = 0, t0 = 0, raf = 0, kept = false, resizeTimer = 0;

    // the photo at one sample per dot, cropped as the page shows it (object-fit: cover, centred)
    function sample() {
      var w = frame.clientWidth, h = frame.clientHeight;
      if (!w || !h || !img.naturalWidth) return false;
      var cell = w < 420 ? 2 : 3;                       // finer dots on a small photo, so a face still reads
      cols = Math.max(8, Math.round(w / cell));
      rows = Math.max(8, Math.round(h / cell));
      var off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      var octx = off.getContext('2d');
      var s = Math.max(cols / img.naturalWidth, rows / img.naturalHeight), sw = cols / s, sh = rows / s;
      octx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, rows);
      var px;
      try { px = octx.getImageData(0, 0, cols, rows).data; } catch (error) { return false; }
      var n = cols * rows, hist = new Uint32Array(256), i;
      lum = new Float32Array(n);
      rank = new Float32Array(n);
      for (i = 0; i < n; i++) {
        var y = 0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2];
        lum[i] = y;
        hist[y | 0]++;
      }
      // stretch the tones between the 2nd and 98th percentiles so the dots carry the picture
      var lo = percentile(hist, n, 0.02), span = Math.max(1, percentile(hist, n, 0.98) - lo);
      for (i = 0; i < n; i++) {
        var x = i % cols, yy = (i / cols) | 0;
        lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / span));
        // the order in which dots give way: a coarse Bayer pattern, loosened a little
        rank[i] = 0.72 * BAYER[((yy >> 2) & 7) * 8 + ((x >> 2) & 7)] + 0.28 * hash(x, yy);
      }
      return true;
    }

    // p is the share of dots that have given way to the photo: 0 printed, 1 the photo itself
    function paint(p) {
      var d = data.data, ink = look.ink, paper = look.paper, light = look.light;
      for (var i = 0, n = cols * rows; i < n; i++) {
        var o = 4 * i;
        if (rank[i] < p) { d[o + 3] = 0; continue; }
        var x = i % cols, y = (i / cols) | 0;
        var c = (light ? 1 - lum[i] : lum[i]) > BAYER[(y & 7) * 8 + (x & 7)] ? ink : paper;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      canvas.style.visibility = p >= 1 ? 'hidden' : '';
    }

    function mount() {
      look = colours();
      if (!sample()) return;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'develop-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        img.insertAdjacentElement('afterend', canvas);
      }
      canvas.width = cols; canvas.height = rows;
      ctx = canvas.getContext('2d');
      data = ctx.createImageData(cols, rows);
      paint(shown);
    }

    function step(now) {
      var t = RUN ? Math.min(1, (now - t0) / (RUN * Math.abs(target - from))) : 1;
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(2 - 2 * t, 2) / 2;
      shown = from + (target - from) * e;
      paint(shown);
      if (t < 1) raf = requestAnimationFrame(step);
      else raf = 0;
    }
    function go(to) {
      if (!canvas || kept && to === 0 || to === target) return;
      target = to;
      cancelAnimationFrame(raf);
      if (calm) { shown = to; paint(shown); return; }
      from = shown; t0 = performance.now();
      raf = requestAnimationFrame(step);
    }

    // a mouse or pen develops on the way in and prints on the way out; keyboard focus does the same
    frame.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') go(1); });
    frame.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') go(0); });
    frame.addEventListener('focusin', function () { go(1); });
    frame.addEventListener('focusout', function (e) { if (!frame.contains(e.relatedTarget)) go(0); });
    // a tap develops; on a plain photo a second tap prints it again
    frame.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch') return;
      if (target === 0) go(1);
      else if (!sticky) go(0);
    });
    if (sticky) frame.addEventListener('input', function () { go(1); kept = true; });

    // a theme switch reprints the dots in the new ink
    new MutationObserver(function () {
      if (!canvas) return;
      look = colours();
      paint(shown);
    }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (canvas) mount(); }, 150);
    });

    if (img.complete && img.naturalWidth) mount();
    else img.addEventListener('load', mount, { once: true });
  });
})();
