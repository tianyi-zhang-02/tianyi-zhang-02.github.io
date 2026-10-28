/* The hero, drawn in characters. A ringed gas giant, far larger than the frame, fills the right of the
   sky; a small long-hulled ship with a spinning habitat ring orbits it on an ellipse, drifting slowly
   past up close, then falling behind the planet, and leaves a long curved trail of exhaust. Behind it
   a band of glowing gas crosses the sky and a few bright stars flare. The scene leans gently toward
   the pointer, a click jumps to warp, and now and then a meteor, a comet or a satellite goes by.

   The look follows the visitor's clock and calendar, which theme-init.js works out before the first
   paint, while the scene itself stays the same. With the hour, the light swings round the planet (a
   fuller face by day, a thin crescent at night), the sky brightens and darkens, the stars and gas fade
   by day, and the planet's glow warms at dawn and dusk. With the season, the gas changes colour and a
   sparse weather drifts across the frame: snow in winter, petals in spring, fireflies in summer,
   falling leaves in autumn.

   Everything shares one camera. The planet and its ring are ray-cast per character cell; the ship is a
   cloud of surface points; both write into one depth buffer, so occlusion is real. Glyphs come from a
   small pre-drawn atlas (one row per colour). The scene runs only while the hero is on screen and shows
   a single still frame under reduced motion; ?t=seconds renders a still at that time for checking.
   The gas is drawn once per size into two off-screen layers, after the first frame, so it costs two
   image copies a frame and never delays the first paint. */
(function () {
  'use strict';
  var canvas = document.querySelector('canvas.ascii-sky');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var hero = canvas.closest('.sky-hero') || canvas.parentNode;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var RAMP = ' .:-=+*#%@';
  var FIRE = ' .:-~+*#%@';
  var EXTRA = '|/\\o[]()\',`';
  var INK = 0, DIM = 1, FLAME = 2, HOT = 3, PLANET = 4, BLINK = 5, EMBER = 6, SAND = 7, WEATHER = 8;
  var palette = [], nebPalette = [], light = false;
  var DPR = 1, W = 0, H = 0, CW = 5.4, CH = 9.9, FONT = 9, cols = 0, rows = 0, gw = 0, gh = 0, atlas = null;
  var zbuf, lbuf, cbuf, glyph, heat;

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, d) { return (cs.getPropertyValue(name) || '').trim() || d; }
    palette = [v('--ascii-ink', '#eef1f6'), v('--ascii-dim', '#5d6680'), v('--ascii-fire', '#ff9446'),
               v('--ascii-hot', '#fff0c2'), v('--ascii-planet', '#b8c6e4'), v('--ascii-blink', '#ff6157'), v('--ascii-ember', '#b8442e'), v('--ascii-sand', '#d8c49c'), clock.season.tint];
    light = v('--ascii-light', '0') === '1';
    nebPalette = clock.season.gas.map(hex);
  }
  function hex(s) { s = s.replace('#', ''); if (s.length === 3) s = s.replace(/./g, '$&$&'); var n = parseInt(s, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function buildAtlas() {
    gw = Math.ceil(CW * DPR); gh = Math.ceil(CH * DPR);
    var chars = RAMP + FIRE.slice(1) + EXTRA;
    atlas = document.createElement('canvas');
    atlas.width = gw * chars.length; atlas.height = gh * palette.length;
    var a = atlas.getContext('2d');
    a.font = (FONT * DPR) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    a.textBaseline = 'middle'; a.textAlign = 'center';
    palette.forEach(function (col, row) {
      a.fillStyle = col;
      for (var i = 1; i < chars.length; i++) a.fillText(chars[i], i * gw + gw / 2, row * gh + gh / 2);
    });
    atlas.chars = chars;
  }
  function gi(ch) { return atlas.chars.indexOf(ch); }
  var G_FIRE0 = RAMP.length - 1;   // index offset of FIRE glyphs in the atlas

  /* ---- camera and layout --------------------------------------------------------------------- */
  var cam = { f: 1, cx: 0, cy: 0 }, planet = { x: 0, y: 0, z: 9, r: 1 };
  var view = { yaw: 0, pitch: 0, ty: 0, tp: 0 }, scr = { x: 0, y: 0, r: 1 };
  function layout() {
    var narrow = W < 760;
    var rPx = narrow ? Math.min(W * 0.6, H * 0.3) : Math.min(H * 0.47, W * 0.32);
    var px = narrow ? W * 0.86 : W * 0.8, py = narrow ? H * 0.3 : H * 0.5;
    cam.cx = W / 2; cam.cy = H / 2;
    cam.f = rPx * planet.z;                       // a unit sphere at depth z appears rPx wide
    scr.x = px; scr.y = py; scr.r = rPx;
    planet.x = (px - cam.cx) * planet.z / cam.f;
    planet.y = -(py - cam.cy) * planet.z / cam.f;
    buildHalo();
  }
  // rotate a world point about the planet centre by the pointer-driven view angles
  function viewXf(p) {
    var x = p[0] - planet.x, y = p[1] - planet.y, z = p[2] - planet.z;
    var cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    return [x1 + planet.x, y2 + planet.y, z2 + planet.z];
  }
  function viewXfDir(n) {
    var cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    var x1 = n[0] * cy + n[2] * sy, z1 = -n[0] * sy + n[2] * cy;
    return [x1, n[1] * cp - z1 * sp, n[1] * sp + z1 * cp];
  }
  function project(p) { return [cam.cx + p[0] / p[2] * cam.f, cam.cy - p[1] / p[2] * cam.f]; }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    nebLayers = null; halo = null; clearTimeout(nebTimer);
    if (!W || !H) { cols = rows = 0; return; }                   // not laid out yet (a hidden tab or frame)
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    FONT = W < 640 ? 7.5 : 9; CW = FONT * 0.6; CH = FONT * 1.1;
    cols = Math.ceil(W / CW); rows = Math.ceil(H / CH);
    var n = cols * rows;
    zbuf = new Float32Array(n); lbuf = new Float32Array(n); cbuf = new Uint8Array(n); glyph = new Int16Array(n); heat = new Float32Array(n);
    readTheme(); buildAtlas(); layout(); makeStars(); makeSpikes(); makeWeather();
    nebFade = 0;
    nebTimer = setTimeout(function () { buildNebula(); if (!running) { nebFade = 1; frame(lastT); } }, 80);
  }

  // glyph -1: pick from RAMP by luminance; -2: an empty but opaque cell; > 0: a fixed atlas glyph
  function put(x, y, z, l, c, g) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    var i = y * cols + x;
    if (glyph[i] !== 0 && z >= zbuf[i]) return;
    zbuf[i] = z; lbuf[i] = l; cbuf[i] = c; glyph[i] = g === undefined ? -1 : g;
  }

  /* ---- the visitor's clock and calendar, worked out in theme-init.js before the first paint ----- */
  var clock = window.skyClock || { hour: 22, day: 0, warm: 0, period: 'Night',
    season: { name: 'Autumn', gas: ['#6a5cff', '#e2589a', '#f2a541'], weather: 'leaves', tint: '#f2a541' } };
  // the sun swings round the planet with the hour: a fuller face by day, a thin crescent at night
  var SUN = (function () { var a = 0.184 - 0.42 * Math.cos(2 * Math.PI * (clock.hour - 13) / 24); return norm([-Math.cos(a), 0.4, Math.sin(a)]); })();

  /* ---- stars ---------------------------------------------------------------------------------- */
  var stars = [];
  function makeStars() {
    stars = [];
    var n = Math.round(cols * rows / 46);
    for (var i = 0; i < n; i++) {
      var m = Math.pow(Math.random(), 5);
      stars.push({ x: Math.random() * cols, y: Math.random() * rows, m: m, z: 0.15 + 0.85 * Math.random(), p: Math.random() * 6.28, s: 0.5 + Math.random() * 2.5 });
    }
  }
  function drawStars(t, dt, warp) {
    var ox = -view.yaw * 40, oy = view.pitch * 30;
    var fx = cam.cx / CW, fy = cam.cy / CH;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.x -= dt * (0.25 + warp * 90) * s.z;
      if (s.x < 0) { s.x += cols; s.y = Math.random() * rows; }
      var tw = 0.6 + 0.4 * Math.sin(t * s.s + s.p);
      var b = (0.22 + 0.78 * s.m) * tw * (1.1 - 0.35 * clock.day);   // fewer, fainter stars by day
      var x = s.x + ox * s.z, y = s.y + oy * s.z;
      if (warp > 0.03) {                                  // streaks radiating from the centre of view
        var dx = x - fx, dy = (y - fy) * (CH / CW), len = Math.hypot(dx, dy) || 1, L = warp * (4 + 26 * s.z) * Math.min(1, len / 30);
        var sc = Math.abs(dy) < Math.abs(dx) * 0.45 ? '-' : (Math.abs(dx) < Math.abs(dy) * 0.45 ? '|' : (dx * dy > 0 ? '\\' : '/'));
        for (var k = 0; k < L; k++) put(Math.round(x + dx / len * k), Math.round(y + dy / len * k * (CW / CH)), 1e9, b * (1 - k / (L + 1)) + 0.2, k < 2 ? INK : DIM, gi(sc));
        continue;
      }
      var ch = s.m > 0.7 ? (tw > 0.85 ? '*' : '+') : (s.m > 0.3 ? (tw > 0.75 ? ':' : '.') : '.');
      put(Math.round(x), Math.round(y), 1e9, b, s.m > 0.3 ? INK : DIM, gi(ch));
    }
  }

  // a few bright stars with diffraction spikes, kept clear of the planet and the text
  var spikes = [];
  function makeSpikes() {
    spikes = [];
    for (var tries = 0; spikes.length < (W < 760 ? 3 : 5) && tries < 300; tries++) {
      var x = Math.random() * cols, y = Math.random() * rows, px = x * CW, py = y * CH;
      if (py < 80 || py > H * 0.9 || Math.hypot(px - scr.x, py - scr.y) < scr.r * 1.15) continue;
      if (W >= 760 ? (px < W * 0.62 && py > H * 0.5) : py > H * 0.5) continue;
      if (spikes.some(function (s) { return Math.hypot((s.x - x) * CW, (s.y - y) * CH) < 160; })) continue;
      spikes.push({ x: x, y: y, p: Math.random() * 6.28, s: 0.5 + Math.random(), len: 2 + Math.round(Math.random() * 2), c: [INK, PLANET, HOT][spikes.length % 3] });
    }
  }
  function drawSpikes(t, warp) {
    if (warp > 0.2) return;
    var ox = -view.yaw * 40, oy = view.pitch * 30;
    for (var i = 0; i < spikes.length; i++) {
      var s = spikes[i], tw = 0.55 + 0.45 * Math.sin(t * s.s + s.p), x = Math.round(s.x + ox * 0.6), y = Math.round(s.y + oy * 0.6);
      put(x, y, 1e9, 1, s.c, gi(tw > 0.5 ? '*' : '+'));
      var L = Math.round(s.len * (0.5 + tw * 0.7));
      for (var k = 1; k <= L; k++) {
        var a = tw * (1 - k / (L + 1));
        put(x - k, y, 1e9, a, k < 2 ? s.c : DIM, gi('-')); put(x + k, y, 1e9, a, k < 2 ? s.c : DIM, gi('-'));
        if (k <= L >> 1) { put(x, y - k, 1e9, a, DIM, gi('|')); put(x, y + k, 1e9, a, DIM, gi('|')); }
      }
    }
  }

  /* ---- nebula --------------------------------------------------------------------------------- */
  // A band of gas from the upper left, behind the planet, out to the right; the text side stays dark.
  // Density and hue come from layered value noise, with ridged noise cutting dark dust lanes. The two
  // layers differ only in fine grain, so cross-fading them makes the gas shimmer and breathe.
  var NEB = ' .,:;+*%', NEB_K = 16, NEB_M = 24;            // glyphs, colour steps, drift margin (px)
  var nebD = null, nebHue = null, nebLayers = null, nebFade = 0, nebCols = 0, nebRows = 0, nebMc = 0, nebMr = 0, nebTimer = 0;
  function hash(x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, o) {
    var s = 0, amp = 0.5;
    for (var i = 0; i < o; i++) { s += amp * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; amp *= 0.5; }
    return s / (1 - Math.pow(0.5, o));
  }
  function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function buildNebula() {
    var narrow = W < 760, S = Math.min(W, H);
    nebMc = Math.ceil(NEB_M / CW); nebMr = Math.ceil(NEB_M / CH);
    nebCols = cols + 2 * nebMc; nebRows = rows + 2 * nebMr;
    nebD = new Float32Array(nebCols * nebRows); nebHue = new Float32Array(nebCols * nebRows);
    var ax = (narrow ? -0.05 : 0.78) * W, ay = (narrow ? 0.0 : -0.12) * H, bx = (narrow ? 1.05 : -0.12) * W, by = (narrow ? 0.4 : 0.62) * H;
    var lx = bx - ax, ly = by - ay, ll = Math.hypot(lx, ly), wid = (narrow ? 0.34 : 0.21) * S;
    var gy, gx, i;
    for (gy = 0; gy < nebRows; gy++) for (gx = 0; gx < nebCols; gx++) {
      var px = (gx - nebMc + 0.5) * CW, py = (gy - nebMr + 0.5) * CH, u = px / S, v = py / S;
      var q = fbm(u * 1.6 + 3.1, v * 1.6 + 7.7, 3);
      var d = ((px - ax) * ly - (py - ay) * lx) / ll + (q - 0.5) * 0.9 * S;
      var dens = Math.exp(-d * d / (wid * wid)) * smooth(0.4, 0.7, fbm(u * 2.4 + q * 1.8, v * 2.4 - q * 1.3, 5));
      dens *= 0.15 + 0.85 * smooth(0.012, 0.07, Math.abs(fbm(u * 3.6 + 11.3, v * 3.6 + 4.9, 4) - 0.5));
      dens *= 1 - 0.9 * smooth(H * (narrow ? 0.44 : 0.46), H * (narrow ? 0.56 : 0.58), py) * (narrow ? 1 : 1 - smooth(W * 0.5, W * 0.62, px));
      i = gy * nebCols + gx;
      nebD[i] = Math.min(1, dens * 1.3);
      nebHue[i] = smooth(0.3, 0.7, fbm(u * 1.2 + 20.5, v * 1.2 + 9.2, 3));
    }
    // a glyph atlas in NEB_K colours from teal through violet to rose
    var atl = document.createElement('canvas'), a;
    atl.width = gw * NEB.length; atl.height = gh * NEB_K; a = atl.getContext('2d');
    a.font = (FONT * DPR) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    a.textBaseline = 'middle'; a.textAlign = 'center';
    for (var k = 0; k < NEB_K; k++) {
      var f = k / (NEB_K - 1) * 2, c0 = nebPalette[f < 1 ? 0 : 1], c1 = nebPalette[f < 1 ? 1 : 2], m = f < 1 ? f : f - 1;
      a.fillStyle = 'rgb(' + [0, 1, 2].map(function (j) { return Math.round(c0[j] + (c1[j] - c0[j]) * m); }).join(',') + ')';
      for (var c = 1; c < NEB.length; c++) a.fillText(NEB[c], c * gw + gw / 2, k * gh + gh / 2);
    }
    // a soft glow under the glyphs: the density field one pixel per cell, scaled up smoothly
    var glow = document.createElement('canvas'), gctx, img;
    glow.width = nebCols; glow.height = nebRows; gctx = glow.getContext('2d'); img = gctx.createImageData(nebCols, nebRows);
    for (i = 0; i < nebCols * nebRows; i++) {
      var hk0 = Math.max(0, Math.min(1, 0.7 * nebHue[i] + 0.45 * nebD[i] - 0.1)) * 2, ca = nebPalette[hk0 < 1 ? 0 : 1], cb = nebPalette[hk0 < 1 ? 1 : 2], mm = hk0 < 1 ? hk0 : hk0 - 1;
      for (var j = 0; j < 3; j++) img.data[i * 4 + j] = ca[j] + (cb[j] - ca[j]) * mm;
      img.data[i * 4 + 3] = Math.min(255, nebD[i] * nebD[i] * (light ? 70 : 120));
    }
    gctx.putImageData(img, 0, 0);
    nebLayers = [0, 1].map(function (L) {
      var cv = document.createElement('canvas'), c2;
      cv.width = Math.ceil(nebCols * CW * DPR); cv.height = Math.ceil(nebRows * CH * DPR); c2 = cv.getContext('2d');
      c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
      if (L === 0) c2.drawImage(glow, 0, 0, cv.width, cv.height);      // the glow lives in one layer and
      for (var y = 0; y < nebRows; y++) for (var x = 0; x < nebCols; x++) {   // is drawn at half strength in each
        var D = nebD[y * nebCols + x], r = hash(x * 7 + L * 101, y * 13 + L * 59);
        if (D < 0.02 || r > D * 2.2) continue;                         // faint gas is a sparse sprinkle
        var dd = D * (0.6 + 0.8 * hash(x * 3 + L * 211, y * 5 + L * 17));
        var lev = Math.max(1, Math.min(NEB.length - 1, Math.round(dd * (NEB.length - 1))));
        var hk = Math.max(0, Math.min(1, 0.7 * nebHue[y * nebCols + x] + 0.45 * dd - 0.1));
        c2.globalAlpha = Math.min(0.9, (light ? 0.12 : 0.2) + (light ? 0.5 : 0.65) * dd);
        c2.drawImage(atl, lev * gw, Math.round(hk * (NEB_K - 1)) * gh, gw, gh, Math.round(x * CW * DPR), Math.round(y * CH * DPR), gw, gh);
      }
      return cv;
    });
    // more faint stars where the band is, as in the Milky Way
    for (var n = Math.round(cols * rows / 70), tries = 0; n > 0 && tries < n * 20; tries++) {
      var sx = Math.random() * cols, sy = Math.random() * rows;
      if (Math.random() > nebD[(Math.floor(sy) + nebMr) * nebCols + Math.floor(sx) + nebMc]) continue;
      stars.push({ x: sx, y: sy, m: Math.pow(Math.random(), 3) * 0.6, z: 0.15 + 0.5 * Math.random(), p: Math.random() * 6.28, s: 0.5 + Math.random() * 2.5 });
      n--;
    }
  }
  // draws the gas under everything else; returns the cell shift used, so glyphs can clear their cell
  var nebShift = [0, 0];
  function drawNebula(t, dt) {
    if (!nebLayers) return false;
    nebFade = Math.min(1, nebFade + dt * 0.5);
    var mb = 0.5 + 0.5 * Math.sin(t * 0.33);
    var ox = -view.yaw * 18 + Math.sin(t * 0.045) * (NEB_M - 8), oy = view.pitch * 12;
    var X = Math.round((ox - nebMc * CW) * DPR), Y = Math.round((oy - nebMr * CH) * DPR);
    var k = nebFade * (1 - 0.3 * clock.day);                      // the gas is richer at night
    ctx.globalAlpha = k * (1 - 0.6 * mb); ctx.drawImage(nebLayers[0], X, Y);
    ctx.globalAlpha = k * mb; ctx.drawImage(nebLayers[1], X, Y);
    ctx.globalAlpha = 1;
    // the planet hides the gas behind it
    var C = [planet.x, planet.y, planet.z], c = project(C), r = cam.f / Math.sqrt(C[0] * C[0] + C[1] * C[1] + C[2] * C[2] - 1);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(c[0] * DPR, c[1] * DPR, r * DPR, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    nebShift[0] = Math.round(ox / CW); nebShift[1] = Math.round(oy / CH);
    return true;
  }

  /* ---- planet and ring, ray-cast per cell ----------------------------------------------------- */
  // A gas giant far larger than the frame, with turbulent bands and a slow storm; a wide ring system
  // with the classic gaps sweeps across the sky. Ring and planet shadow each other, and a thin
  // atmosphere glows at the limb (glyphs at the edge, a soft halo drawn once per size beneath them).
  var RING_IN = 1.28, RING_OUT = 2.3;
  var ringN = (function () { var tilt = 0.17, roll = -0.34; var n = [0, Math.cos(tilt), -Math.sin(tilt)];
    return [n[0] * Math.cos(roll) - n[1] * Math.sin(roll), n[0] * Math.sin(roll) + n[1] * Math.cos(roll), n[2]]; })();
  var B1 = (function () { var a = [ringN[1] * 1 - 0, 0 - ringN[0] * 1, 0], n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; })();   // N x z
  var B2 = [ringN[1] * B1[2] - ringN[2] * B1[1], ringN[2] * B1[0] - ringN[0] * B1[2], ringN[0] * B1[1] - ringN[1] * B1[0]];
  function ringDensity(f) {                       // inner C ring, bright B ring, Cassini gap, A ring with Encke gap, F ring
    if (f < 0.16) return 0.2 + 0.06 * Math.sin(f * 70);
    if (f < 0.52) return 0.72 + 0.1 * Math.sin(f * 44);
    if (f < 0.585) return 0.03;
    if (f < 0.93) return (f > 0.84 && f < 0.855) ? 0.05 : 0.5 + 0.06 * Math.sin(f * 50);
    if (f > 0.965 && f < 0.985) return 0.5;
    return 0;
  }
  var halo = null;
  function buildHalo() {                          // the atmosphere's glow, strongest toward the sun
    var r = scr.r, pad = r * 0.16, size = Math.ceil((r + pad) * 2 * DPR);
    halo = document.createElement('canvas'); halo.width = halo.height = size;
    var h = halo.getContext('2d'), c = size / 2, g = h.createRadialGradient(c, c, r * 0.985 * DPR, c, c, (r + pad) * DPR);
    var hue = [150 + 105 * clock.warm, 190 - 30 * clock.warm, 255 - 125 * clock.warm].map(Math.round).join(', ');   // warmer at dawn and dusk
    g.addColorStop(0, 'rgba(' + hue + ', 0)'); g.addColorStop(0.06, 'rgba(' + hue + ', 0.34)');
    g.addColorStop(0.3, 'rgba(' + hue + ', 0.1)'); g.addColorStop(1, 'rgba(' + hue + ', 0)');
    h.fillStyle = g; h.fillRect(0, 0, size, size);
    h.globalCompositeOperation = 'destination-in';                 // fade it away on the night side
    var lg = h.createLinearGradient(c + SUN[0] * c, c - SUN[1] * c, c - SUN[0] * c, c + SUN[1] * c);
    lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(0.55, 'rgba(0,0,0,0.5)'); lg.addColorStop(1, 'rgba(0,0,0,0.08)');
    h.fillStyle = lg; h.fillRect(0, 0, size, size);
  }
  function drawPlanet(t) {
    var C = viewXf([planet.x, planet.y, planet.z]);       // centre is fixed under the view rotation
    var N = viewXfDir(ringN), sun = viewXfDir(SUN), b1 = viewXfDir(B1), b2 = viewXfDir(B2);
    var c0 = project(C), rr = RING_OUT * cam.f / C[2] * 1.05;
    var x0 = Math.max(0, Math.floor((c0[0] - rr) / CW)), x1 = Math.min(cols - 1, Math.ceil((c0[0] + rr) / CW));
    var y0 = Math.max(0, Math.floor((c0[1] - rr) / CH)), y1 = Math.min(rows - 1, Math.ceil((c0[1] + rr) / CH));
    var spin = t * 0.018, CC = C[0] * C[0] + C[1] * C[1] + C[2] * C[2];
    var ringLit = 0.35 + 0.65 * Math.abs(sun[0] * N[0] + sun[1] * N[1] + sun[2] * N[2]);
    for (var gy = y0; gy <= y1; gy++) for (var gx = x0; gx <= x1; gx++) {
      var dx = ((gx + 0.5) * CW - cam.cx) / cam.f, dy = -((gy + 0.5) * CH - cam.cy) / cam.f, dz = 1;
      var dn = Math.hypot(dx, dy, dz); dx /= dn; dy /= dn; dz /= dn;
      var b = dx * C[0] + dy * C[1] + dz * C[2], disc = b * b - CC + 1;
      var tS = disc >= 0 ? b - Math.sqrt(disc) : Infinity;
      if (tS < Infinity) {
        var hx = dx * tS - C[0], hy = dy * tS - C[1], hz = dz * tS - C[2];
        var lit = hx * sun[0] + hy * sun[1] + hz * sun[2];
        var lat = hx * N[0] + hy * N[1] + hz * N[2], lon = Math.atan2(hx * b2[0] + hy * b2[1] + hz * b2[2], hx * b1[0] + hy * b1[1] + hz * b1[2]) + spin;
        var band = 0.8 + 0.13 * Math.sin(lat * 11 + 0.8 * Math.sin(lon * 2 + lat * 26 + spin * 4)) + 0.07 * Math.sin(lat * 41 + lon);
        var sl = lat + 0.36, so = Math.atan2(Math.sin(lon - 2.2), Math.cos(lon - 2.2)), e = so * so / 0.09 + sl * sl / 0.011;
        if (e < 1) band *= 0.72 + 0.32 * Math.sin(e * 10 - t * 0.8 + Math.atan2(sl * 3, so));     // the storm
        // ring shadow on the planet: march toward the sun to the ring plane
        var sh = 1, den = sun[0] * N[0] + sun[1] * N[1] + sun[2] * N[2];
        if (Math.abs(den) > 1e-3) {
          var tp = -lat / den;
          if (tp > 0) { var qr = Math.hypot(hx + sun[0] * tp, hy + sun[1] * tp, hz + sun[2] * tp);
            if (qr > RING_IN && qr < RING_OUT) sh = 1 - 0.75 * ringDensity((qr - RING_IN) / (RING_OUT - RING_IN)); }
        }
        var rim = Math.pow(1 - Math.abs(hz), 4) * 0.45 * Math.max(0, lit + 0.35);   // the lit limb brightens
        var l = Math.max(0, lit) * band * sh + rim + (hash(gx * 3, gy * 7) - 0.5) * 0.07;   // a little dither breaks up flat runs
        var warm = Math.sin(lat * 11 + 0.8 * Math.sin(lon * 2 + lat * 26 + spin * 4)) > 0.35 || e < 0.7;
        if (l > 0.1) put(gx, gy, dz * tS, Math.min(1, l * (0.8 + 0.2 * clock.day)), warm ? SAND : PLANET);
        else if (hash(gx, gy) < 0.1 + 0.12 * band) put(gx, gy, dz * tS, 0.12, DIM, gi('.'));   // night side: faint dots
        else put(gx, gy, dz * tS, 0, PLANET, -2);                                            // empty, but opaque
      } else {
        var miss = Math.sqrt(Math.max(0, CC - b * b));                // the atmosphere, just past the limb
        if (miss < 1.018) {
          var mx = dx * b - C[0], my = dy * b - C[1], mz = dz * b - C[2];
          var la = (mx * sun[0] + my * sun[1] + mz * sun[2]) / miss;
          if (la > -0.2) put(gx, gy, dz * b, 0.3 + 0.5 * (la + 0.2), PLANET, gi(la > 0.4 ? ':' : '.'));
        }
      }
      // ring
      var dd = dx * N[0] + dy * N[1] + dz * N[2];
      if (Math.abs(dd) > 1e-4) {
        var tR = (C[0] * N[0] + C[1] * N[1] + C[2] * N[2]) / dd;
        if (tR > 0 && tR < tS) {
          var px = dx * tR - C[0], py = dy * tR - C[1], pz = dz * tR - C[2], r = Math.hypot(px, py, pz);
          if (r > RING_IN && r < RING_OUT) {
            var dens = ringDensity((r - RING_IN) / (RING_OUT - RING_IN));
            if (dens < 0.08) continue;
            var tb = px * sun[0] + py * sun[1] + pz * sun[2];             // planet shadow on the ring
            var shadow = (tb < 0 && Math.hypot(px - sun[0] * tb, py - sun[1] * tb, pz - sun[2] * tb) < 1) ? 0.12 : 1;
            var l2 = dens * shadow * ringLit;
            if (l2 > 0.07) put(gx, gy, dz * tR, Math.min(1, 0.25 + l2 * 0.8), l2 > 0.45 ? SAND : PLANET, gi(l2 > 0.5 ? '=' : (l2 > 0.2 ? '-' : '.')));
          }
        }
      }
    }
  }

  /* ---- the ship ------------------------------------------------------------------------------- */
  var hull = [], ring = [], spokes = [], panels = [], bells = [];
  function hullR(x) {          // x from -0.5 (stern) to 0.5 (nose)
    if (x > 0.3) return 0.07 * Math.pow(Math.max(0, 1 - Math.pow((x - 0.3) / 0.2, 2)), 0.55);
    if (x > 0.12) return 0.07;
    if (x > 0.08) return 0.07 - (0.12 - x) / 0.04 * 0.022;
    if (x > -0.3) return 0.048;
    if (x > -0.33) return 0.048 + (-0.3 - x) / 0.03 * 0.034;
    return 0.082;
  }
  (function build() {
    var i, j;
    for (i = 0; i <= 260; i++) for (j = 0; j < 44; j++) hull.push([-0.5 + i / 260, j / 44 * Math.PI * 2]);
    for (i = 0; i < 420; i++) for (j = 0; j < 18; j++) ring.push([i / 420 * Math.PI * 2, j / 18 * Math.PI * 2]);
    for (i = 0; i < 3; i++) for (j = 0; j < 40; j++) spokes.push([i * Math.PI * 2 / 3, 0.05 + 0.13 * j / 40]);
    for (i = 0; i < 2; i++) for (j = 0; j < 1600; j++) panels.push([i ? 1 : -1, Math.random(), Math.random()]);
    for (i = 0; i < 3; i++) for (j = 0; j < 220; j++) bells.push([i, j / 220]);
  })();
  var NOZ = [0, 1, 2].map(function (i) { var a = i / 3 * Math.PI * 2 + Math.PI / 2; return [Math.cos(a) * 0.038, Math.sin(a) * 0.038]; });

  // orbit: an ellipse with the planet at one focus. Its far point is toward the camera, so the ship
  // drifts slowly past up close, then falls toward the planet, whips round behind it and climbs back.
  var ORB_A = 1.8, ORB_E = 0.4, ORB_PERIOD = 38, ORB_M0 = 1.6;
  var orbN = norm([0.28, 0.95, -0.06]), e1 = norm([0.6, 0, 0.8]);
  e1 = norm([e1[0] - orbN[0] * dot(e1, orbN), e1[1] - orbN[1] * dot(e1, orbN), e1[2] - orbN[2] * dot(e1, orbN)]);   // toward the near point
  var e2 = [orbN[1] * e1[2] - orbN[2] * e1[1], orbN[2] * e1[0] - orbN[0] * e1[2], orbN[0] * e1[1] - orbN[1] * e1[0]];
  function norm(v) { var n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  var exhaust = [], boost = 0;
  var SHIP_LEN = 0.32;

  function drawShip(t, dt, warp) {
    var A = W < 760 ? 1.45 : ORB_A, Ec = W < 760 ? 0.28 : ORB_E;      // a tighter orbit fits a narrow screen
    var M = t / ORB_PERIOD * Math.PI * 2 + ORB_M0, E = M;
    for (var it = 0; it < 6; it++) E -= (E - Ec * Math.sin(E) - M) / (1 - Ec * Math.cos(E));
    var ox = A * (Math.cos(E) - Ec), oy = A * Math.sqrt(1 - Ec * Ec) * Math.sin(E);
    var pos = [planet.x + ox * e1[0] + oy * e2[0], planet.y + ox * e1[1] + oy * e2[1], planet.z + ox * e1[2] + oy * e2[2]];
    var q = Math.sqrt(1 - Ec * Ec), F = norm([-Math.sin(E) * e1[0] + q * Math.cos(E) * e2[0],
                                              -Math.sin(E) * e1[1] + q * Math.cos(E) * e2[1],
                                              -Math.sin(E) * e1[2] + q * Math.cos(E) * e2[2]]);          // direction of travel
    var U = orbN.slice(), bank = 0.35 + 0.08 * Math.sin(t * 0.9);                                  // bank into the turn
    var Rt = [F[1] * U[2] - F[2] * U[1], F[2] * U[0] - F[0] * U[2], F[0] * U[1] - F[1] * U[0]];
    var cb = Math.cos(bank), sb = Math.sin(bank);
    var U2 = [U[0] * cb + Rt[0] * sb, U[1] * cb + Rt[1] * sb, U[2] * cb + Rt[2] * sb];
    var R2 = [Rt[0] * cb - U[0] * sb, Rt[1] * cb - U[1] * sb, Rt[2] * cb - U[2] * sb];
    var sun = viewXfDir(SUN), S = SHIP_LEN;
    function toWorld(p) { return viewXf([pos[0] + S * (p[0] * F[0] + p[1] * U2[0] + p[2] * R2[0]),
                                         pos[1] + S * (p[0] * F[1] + p[1] * U2[1] + p[2] * R2[1]),
                                         pos[2] + S * (p[0] * F[2] + p[1] * U2[2] + p[2] * R2[2])]); }
    function dirWorld(n) { return viewXfDir([n[0] * F[0] + n[1] * U2[0] + n[2] * R2[0], n[0] * F[1] + n[1] * U2[1] + n[2] * R2[1], n[0] * F[2] + n[1] * U2[2] + n[2] * R2[2]]); }
    function splat(p, n, alb, two) {
      var w = toWorld(p), nw = dirWorld(n);
      var vx = w[0], vy = w[1], vz = w[2], vn = Math.hypot(vx, vy, vz);
      var facing = (nw[0] * vx + nw[1] * vy + nw[2] * vz) / vn;      // > 0 faces away
      if (facing > 0.1) { if (!two) return; nw = [-nw[0], -nw[1], -nw[2]]; }
      var lit = nw[0] * sun[0] + nw[1] * sun[1] + nw[2] * sun[2];
      var hx = sun[0] - vx / vn, hy = sun[1] - vy / vn, hz = sun[2] - vz / vn, hn = Math.hypot(hx, hy, hz);
      var spec = Math.pow(Math.max(0, (nw[0] * hx + nw[1] * hy + nw[2] * hz) / hn), 18);
      var l = alb * (0.1 + 0.9 * Math.pow(Math.max(0, lit), 0.7)) + 0.5 * spec;
      if (l < 0.06) l = 0.06;
      var s = project(w);
      put(Math.floor(s[0] / CW), Math.floor(s[1] / CH), w[2], Math.min(1, l), INK);
    }
    var k, p;
    for (k = 0; k < hull.length; k++) {
      p = hull[k]; var x = p[0], a = p[1], r = hullR(x), ca = Math.cos(a), sa = Math.sin(a);
      var alb = 0.8;
      if (x > 0.17 && x < 0.26 && ca > 0.25 && ca < 0.75 && Math.sin(a * 22) > 0.2) alb = 0.25;   // windows
      if (Math.abs(x + 0.12) < 0.005 || Math.abs(x - 0.02) < 0.005 || Math.abs(x + 0.24) < 0.005) alb = 0.4;
      splat([x, ca * r, sa * r], [x > 0.3 ? (x - 0.3) * 3 : 0, ca, sa], alb);
    }
    var spin = t * 0.6, RR = 0.21, rr = 0.03, rx0 = -0.06;
    for (k = 0; k < ring.length; k++) {
      p = ring[k]; var u = p[0] + spin, v = p[1], cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
      var rad = RR + rr * cv, seam = ((p[0] / (Math.PI * 2)) * 12) % 1 < 0.04 ? 0.35 : 0.9;
      splat([rx0 + rr * sv, cu * rad, su * rad], [sv, cu * cv, su * cv], seam);
    }
    for (k = 0; k < spokes.length; k++) { p = spokes[k]; var su2 = p[0] + spin; splat([rx0, Math.cos(su2) * p[1], Math.sin(su2) * p[1]], [0.2, Math.cos(su2 + 1), Math.sin(su2 + 1)], 0.55, true); }
    for (k = 0; k < panels.length; k++) {
      p = panels[k]; var px = -0.29 + 0.15 * p[1], reach = p[0] * (0.07 + 0.2 * p[2]);
      var grid = (Math.abs((p[1] * 5) % 1 - 0.5) < 0.08 || Math.abs((p[2] * 4) % 1 - 0.5) < 0.09) ? 0.3 : 0.85;
      splat([px, 0, reach], [0, 1, 0], grid, true);
    }
    for (k = 0; k < bells.length; k++) {
      p = bells[k]; var nz = NOZ[p[0]], f = p[1], a2 = f * Math.PI * 2 * 11, along = (f * 11) % 1, rn = 0.011 + 0.014 * along;
      splat([-0.5 - 0.045 * along, nz[0] + Math.cos(a2) * rn, nz[1] + Math.sin(a2) * rn], [-0.4, Math.cos(a2), Math.sin(a2)], 0.55, true);
    }
    // exhaust stays where it was emitted, so it traces the orbit
    boost += ((warp > 0.03 ? 1 : 0) - boost) * Math.min(1, dt * 5);
    var n = reduce ? 0 : Math.round(dt * 700 * (1 + boost * 1.5));
    for (var q = 0; q < n; q++) {
      var nzl = NOZ[q % 3], j1 = (Math.random() - 0.5) * 0.03, j2 = (Math.random() - 0.5) * 0.03;
      var ws = [pos[0] + S * (-0.55 * F[0] + (nzl[0] + j1) * U2[0] + (nzl[1] + j2) * R2[0]),
                pos[1] + S * (-0.55 * F[1] + (nzl[0] + j1) * U2[1] + (nzl[1] + j2) * R2[1]),
                pos[2] + S * (-0.55 * F[2] + (nzl[0] + j1) * U2[2] + (nzl[1] + j2) * R2[2])];
      var sp = (0.32 + Math.random() * 0.22) * (1 + boost * 1.5);
      exhaust.push({ p: ws, v: [-F[0] * sp + (Math.random() - 0.5) * 0.04, -F[1] * sp + (Math.random() - 0.5) * 0.04, -F[2] * sp + (Math.random() - 0.5) * 0.04],
                     age: Math.random() * dt, max: 1.2 + Math.random() * 1.8 });
    }
    heat.fill(0);
    for (k = exhaust.length - 1; k >= 0; k--) {
      var e = exhaust[k];
      if (!reduce) { e.age += dt; e.p[0] += e.v[0] * dt; e.p[1] += e.v[1] * dt; e.p[2] += e.v[2] * dt; e.v[0] *= 0.985; e.v[1] *= 0.985; e.v[2] *= 0.985; }
      if (e.age > e.max) { exhaust.splice(k, 1); continue; }
      var w = viewXf(e.p), sc = project(w), gx = Math.floor(sc[0] / CW), gy = Math.floor(sc[1] / CH);
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      var life = 1 - e.age / e.max, i0 = gy * cols + gx;
      // hidden behind the planet or the hull?
      if (glyph[i0] !== 0 && zbuf[i0] < w[2]) continue;
      heat[i0] += 0.04 * (0.15 + life * life * 1.6) * (1 + boost * 0.8);
      if (gx > 0) heat[i0 - 1] += 0.03 * life;
      if (gx < cols - 1) heat[i0 + 1] += 0.03 * life;
    }
    for (var c = 0, nn = cols * rows; c < nn; c++) {
      var h = heat[c];
      if (h < 0.04) continue;
      var lv = Math.min(1, h);
      var g = G_FIRE0 + Math.max(1, Math.min(FIRE.length - 1, Math.round(lv * (FIRE.length - 1))));
      if (glyph[c] !== 0 && cbuf[c] === INK) continue;          // the hull stays in front of its own burn
      glyph[c] = g; lbuf[c] = Math.max(0.3, lv); cbuf[c] = lv > 0.75 ? HOT : (lv > 0.22 ? FLAME : EMBER);
    }
    // a blinking light at the tip of the near panel
    if (Math.sin(t * 3.4) > 0.8) { var tip = toWorld([-0.22, 0, 0.27]), ts = project(tip); put(Math.floor(ts[0] / CW), Math.floor(ts[1] / CH), tip[2] - 0.01, 1, BLINK, gi('*')); }
  }

  /* ---- meteors, a comet and a satellite ------------------------------------------------------ */
  // a line of glyphs from (x, y) along (dx, dy) in cells: '-' where the row holds, a slash where it steps
  function streak(x, y, dx, dy, n, z, l0, colours) {
    var len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, prev = Math.round(y);
    var slash = gi(ux * uy > 0 ? '\\' : '/'), dash = gi(Math.abs(uy) * CH > Math.abs(ux) * CW * 2.4 ? '|' : '-');
    for (var k = 0; k < n; k++) {
      var cx = Math.round(x + ux * k), cy = Math.round(y + uy * k), f = 1 - k / n;
      put(cx, cy, z, l0 * f, colours(k, f), cy !== prev ? slash : dash);
      prev = cy;
    }
  }
  var meteors = [], nextMeteor = 2.5;
  function drawMeteors(t, dt) {
    if (t > nextMeteor) {
      nextMeteor = t + 4 + Math.random() * 7;
      var ang = 0.25 + Math.random() * 0.45, sp = 70 + Math.random() * 30;      // pixel angle below the horizontal
      meteors.push({ x: cols * (0.35 + Math.random() * 0.63), y: rows * Math.random() * 0.4, vx: -Math.cos(ang) * sp, vy: Math.sin(ang) * sp * (CW / CH), life: 0, max: 0.5 + Math.random() * 0.5 });
    }
    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.life > m.max || m.x < -20 || m.x > cols + 20 || m.y > rows) { meteors.splice(i, 1); continue; }
      var fade = Math.min(1, (m.max - m.life) * 4, m.life * 8);
      streak(m.x, m.y, -m.vx, -m.vy, 18, 1e8, fade, function (k) { return k < 3 ? HOT : (k < 8 ? INK : DIM); });
      put(Math.round(m.x), Math.round(m.y), 1e8 - 1, fade, HOT, gi('*'));
    }
  }
  // a comet now and then: a bright head, a straight blue ion tail and a curved dust tail, both
  // pointing away from the sun; it is far away, so the planet hides it as it passes behind
  var comet = null, nextComet = 10;
  function drawComet(t, dt) {
    if (!comet && t > nextComet) comet = { x: cols + 4, y: rows * (0.12 + Math.random() * 0.2), vx: -(7 + Math.random() * 3), vy: 0.9 + Math.random() * 0.8 };
    if (!comet) return;
    comet.x += comet.vx * dt; comet.y += comet.vy * dt;
    if (comet.x < -40) { comet = null; nextComet = t + 24 + Math.random() * 16; return; }
    var sx = -SUN[0] / CW, sy = SUN[1] / CH, sl = Math.hypot(sx, sy); sx /= sl; sy /= sl;   // away from the sun, in cells
    var hx = Math.round(comet.x), hy = Math.round(comet.y), z = 5e8;
    streak(comet.x + sx, comet.y + sy, sx, sy, 30, z, 0.85, function (k) { return k < 4 ? INK : PLANET; });
    for (var k = 2; k < 22; k++) {                                // dust: bends back along the path
      var bend = k * k * 0.012, f = 1 - k / 22;
      put(Math.round(comet.x + sx * k * 0.9 - comet.vx * bend * 0.03), Math.round(comet.y + sy * k * 0.9 - bend * 0.6), z, 0.6 * f, k < 8 ? INK : DIM, gi(k < 9 ? ':' : '.'));
    }
    put(hx, hy, z - 1, 1, HOT, gi('@'));
    put(hx - 1, hy, z, 0.5, INK, gi('('));
  }
  var sat = null, nextSat = 6;
  function drawSatellite(t, dt) {
    if (!sat && t > nextSat) sat = { x: -10, y: rows * (0.06 + Math.random() * 0.1), v: 5 + Math.random() * 3 };
    if (!sat) return;
    sat.x += sat.v * dt;
    if (sat.x > cols + 10) { sat = null; nextSat = t + 14 + Math.random() * 14; return; }
    var body = '[=]-o-[=]', x0 = Math.round(sat.x), y0 = Math.round(sat.y);
    for (var i = 0; i < body.length; i++) put(x0 + i, y0, 1e7, 0.75, body[i] === 'o' ? INK : DIM, gi(body[i]));
    if (Math.sin(t * 6) > 0.7) put(x0 + 4, y0 - 1, 1e7, 1, BLINK, gi('.'));
  }

  /* ---- the season's weather ------------------------------------------------------------------ */
  // a sparse drift in front of everything: snow falls and sways, petals blow down and across, fireflies
  // wander and blink, leaves fall turning over
  var flakes = [];
  function makeWeather() {
    flakes = [];
    for (var i = 0, n = Math.round(cols * rows / 480); i < n; i++)
      flakes.push({ x: Math.random() * cols, y: Math.random() * rows, p: Math.random() * 6.28, s: 0.6 + Math.random() * 0.8 });
  }
  function drawWeather(t, dt, warp) {
    if (warp > 0.2) return;
    var kind = clock.season.weather;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i], g, l;
      if (kind === 'snow') { f.y += dt * 2.2 * f.s; f.x += dt * Math.sin(t * 0.8 + f.p) * 0.9; g = f.s > 1.1 ? '*' : '.'; l = 0.55; }
      else if (kind === 'petals') { f.y += dt * 1.6 * f.s; f.x += dt * (2.2 + Math.sin(t * 1.3 + f.p) * 1.6); g = Math.sin(t * 3 + f.p) > 0 ? ',' : '.'; l = 0.6; }
      else if (kind === 'leaves') { f.y += dt * 2.6 * f.s; f.x += dt * Math.sin(t * 0.9 + f.p) * 2.2; g = ",'`."[Math.floor(t * 2.5 * f.s + f.p) & 3]; l = 0.7; }
      else { f.x += dt * Math.sin(t * 0.5 + f.p * 3) * 1.4; f.y += dt * Math.cos(t * 0.4 + f.p * 2) * 0.7; l = Math.max(0, Math.sin(t * 1.4 * f.s + f.p)); g = l > 0.7 ? '*' : '.'; }
      if (f.y > rows + 1) { f.y = -1; f.x = Math.random() * cols; }
      if (f.x > cols + 1) f.x = -1; else if (f.x < -1) f.x = cols + 1;
      if (f.y < -1) f.y = rows + 1;
      if (l > 0.08) put(Math.round(f.x), Math.round(f.y), 0.5, l, WEATHER, gi(g));
    }
  }

  /* ---- frame ---------------------------------------------------------------------------------- */
  var warpStart = -10, lastT = 0;
  var hudSky = document.querySelector('[data-hud-sky]');
  if (hudSky) hudSky.textContent = clock.season.name + ' · ' + clock.period;
  function frame(t) {
    if (!cols) return;
    var dt = Math.min(0.08, Math.max(0, t - lastT)); lastT = t;
    view.yaw += (view.ty + 0.03 * Math.sin(t * 0.07) - view.yaw) * Math.min(1, dt * 4);
    view.pitch += (view.tp - view.pitch) * Math.min(1, dt * 4);
    glyph.fill(0);
    var wt = t - warpStart, warp = wt >= 0 && wt < 1.8 ? Math.pow(Math.sin(Math.PI * wt / 1.8), 1.5) : 0;
    drawPlanet(t);
    drawShip(t, dt, warp);
    drawComet(t, dt);
    drawMeteors(t, dt);
    drawSatellite(t, dt);
    drawWeather(t, dt, warp);
    drawSpikes(t, warp);
    drawStars(t, dt, warp);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var gas = drawNebula(t, dt), sx = nebMc - nebShift[0], sy = nebMr - nebShift[1];
    if (halo) ctx.drawImage(halo, Math.round(scr.x * DPR - halo.width / 2), Math.round(scr.y * DPR - halo.height / 2));
    for (var i = 0, n = cols * rows; i < n; i++) {
      var g = glyph[i];
      if (g <= 0 && g !== -1) continue;
      var l = lbuf[i], c = cbuf[i], gx = i % cols, gy = (i - gx) / cols;
      var X = Math.round(gx * CW * DPR), Y = Math.round(gy * CH * DPR);
      if (gas && l > 0.45 && zbuf[i] < 8e8 && c !== PLANET && c !== SAND && c !== DIM && c !== WEATHER && nebD[(gy + sy) * nebCols + gx + sx] > 0.03) ctx.clearRect(X, Y, gw, gh);   // the ship, fire and meteors own their cell; stars and weather sit in the gas
      if (g < 0) {
        var ll = light ? 1 - l * 0.9 : l;
        g = Math.max(1, Math.min(RAMP.length - 1, Math.round(ll * (RAMP.length - 1))));
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, l * 1.3);
      } else ctx.globalAlpha = Math.max(0.2, Math.min(1, l));
      ctx.drawImage(atlas, g * gw, c * gh, gw, gh, X, Y, gw, gh);
    }
    ctx.globalAlpha = 1;
  }

  var running = false, visible = true, last = 0, start = performance.now();
  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - last < 30) return;                         // ~30 fps
    last = now;
    frame((now - start) / 1000);
  }
  function play() { if (running || reduce || !visible) return; running = true; requestAnimationFrame(loop); }
  function pause() { running = false; }

  resize();
  var still = /[?&]t=([\d.]+)/.exec(location.search);
  if (still) { var ts = +still[1]; for (var s0 = 0; s0 <= ts; s0 += 0.033) frame(s0); reduce = true; }
  else if (reduce) { reduce = false; for (var s1 = 0; s1 <= 3; s1 += 0.05) frame(s1); reduce = true; }
  else play();

  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect();
    view.ty = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
    view.tp = ((e.clientY - r.top) / r.height - 0.5) * 0.2;
  });
  hero.addEventListener('pointerleave', function () { view.ty = 0; view.tp = 0; });
  hero.addEventListener('click', function (e) {
    if (reduce || e.target.closest('a, button, input, label, [data-scramble]')) return;
    var now = (performance.now() - start) / 1000;
    if (now - warpStart > 1.8) warpStart = now;
  });

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { resize(); if (!running) frame(lastT); }, 150); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) play(); else pause(); }).observe(hero);
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else play(); });
  new MutationObserver(function () { readTheme(); buildAtlas(); if (!running) frame(lastT); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- the name decodes itself on load and on hover ------------------------------------------ */
  var GLYPHS = '!<>-_\\/[]{}=+*^?#%@01';
  [].forEach.call(document.querySelectorAll('[data-scramble]'), function (el) {
    var final = el.textContent, busy = false;
    function run() {
      if (busy || reduce) return; busy = true;
      var q = final.split('').map(function (ch, i) { return { to: ch, start: Math.floor(Math.random() * 12) + i, end: Math.floor(Math.random() * 14) + 18 + i * 2 }; });
      var f = 0;
      (function tick() {
        var out = '', done = 0;
        for (var i = 0; i < q.length; i++) {
          if (f >= q[i].end || q[i].to === ' ') { out += q[i].to; done++; }
          else if (f >= q[i].start) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          else out += ' ';
        }
        el.textContent = out;
        if (done < q.length) { f++; setTimeout(tick, 33); } else { el.textContent = final; busy = false; }
      })();
    }
    run();
    el.addEventListener('pointerenter', run);
  });
})();
