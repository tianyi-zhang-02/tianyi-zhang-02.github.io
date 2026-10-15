/* Namcha Barwa, through the day, mirrored in still water.
   Like a dynamic wallpaper, the light follows the viewer's local time. Dawn, day and night
   are my photograph, regraded; sunset is my own time-lapse of the mountain (clouds rising,
   alpenglow, then blue dusk), looped with a soft crossfade and widened to the frame by
   continuing its edge colours. A drop of light rises from the lake, falls back and is taken
   in; its rings move the reflection, and each drop that returns sends a mote up past the
   ridge, where after dark it stays a while as a star. Buttons preview the other hours.
   Paused off screen and in background tabs; no drop under reduced motion; on small screens the
   video loads only when Sunset is chosen, and never when the browser asks to save data. */
(function () {
  'use strict';
  var scene = document.querySelector('.lake-scene');
  var canvas = scene && scene.querySelector('canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = Boolean(navigator.connection && navigator.connection.saveData);

  var NAMES = ['dawn', 'day', 'sunset', 'night'];
  var FILES = { dawn: 'dawn', day: 'day', sunset: 'golden', night: 'night' };   // sunset's photo is the fallback for the video
  var LOOK = {   // sky top, sky middle, horizon; deep water; mist; mist strength; star visibility; reflection darkening; light colour
    dawn:   { sky: [[34, 42, 80], [108, 104, 150], [233, 169, 156]], deep: [10, 12, 26], mist: [40, 40, 66], haze: 1, stars: 0.22, dark: 0.5, light: [255, 222, 206] },
    day:    { sky: [[58, 104, 172], [120, 160, 212], [196, 216, 236]], deep: [16, 32, 52], mist: [96, 118, 146], haze: 0.45, stars: 0, dark: 0.42, light: [255, 255, 255] },
    sunset: { sky: [[64, 82, 128], [150, 150, 176], [230, 196, 170]], deep: [14, 18, 32], mist: [70, 74, 96], haze: 0.7, stars: 0.05, dark: 0.46, light: [255, 226, 196] },
    night:  { sky: [[4, 5, 10], [6, 8, 15], [12, 16, 30]], deep: [3, 4, 8], mist: [8, 10, 15], haze: 1, stars: 1, dark: 0.66, light: [255, 214, 170] }
  };
  var KEYS = [[0, 'night'], [4.5, 'night'], [6, 'dawn'], [7.5, 'dawn'], [9, 'day'], [16, 'day'],
              [17, 'sunset'], [19.5, 'sunset'], [20.5, 'night'], [24, 'night']];
  var SUN = NAMES.indexOf('sunset');
  var LOOP = [0.55, 0.985];                         // the part of the time-lapse that is the sunset
  var ROWS = [0.1, 0.98];                           // frame rows that should span the sky above the water

  var images = {}, loading = false;
  var W = 0, H = 0, DPR = 1, water = 0, mount = null, reflH = 0, refl = null, rctx = null;
  var sky = [], stars = [], ripples = [], spray = [], motes = [];
  var drop = null, wait = 1.2, running = false, frame = 0, last = 0, clock = 0;
  var mode = 'now', rush = false, shown = weightsFor('now'), target = shown.slice();
  var video = null, videoOK = false, hold = null, holdCtx = null, fade = 1, probe = null, probeCtx = null;
  var edges = null;                                  // colours sampled from the video's left and right edges

  function rand(a, b) { return a + Math.random() * (b - a); }
  function rgb(c, alpha) { return 'rgba(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + ', ' + (alpha === undefined ? 1 : alpha) + ')'; }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function weightsFor(choice) {
    var w = NAMES.map(function () { return 0; });
    if (choice !== 'now') { w[NAMES.indexOf(choice)] = 1; return w; }
    var now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
    for (var i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i][0] && hour <= KEYS[i + 1][0]) {
        var t = (hour - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
        t = t * t * (3 - 2 * t);
        w[NAMES.indexOf(KEYS[i][1])] += 1 - t;
        w[NAMES.indexOf(KEYS[i + 1][1])] += t;
        return w;
      }
    }
    w[NAMES.indexOf('night')] = 1; return w;
  }
  function blend(pick) {
    var out = null;
    NAMES.forEach(function (name, i) {
      if (!shown[i]) return;
      var v = pick(LOOK[name], name);
      if (typeof v === 'number') out = (out || 0) + v * shown[i];
      else {
        out = out || v.map(function () { return 0; });
        v.forEach(function (c, k) { out[k] += c * shown[i]; });
      }
    });
    return out;
  }

  // ------------------------------------------------------------------ sources
  function load() {
    if (loading) return;
    loading = true;
    NAMES.forEach(function (name) {
      var img = new Image();
      img.onload = function () { images[name] = img; if (!mount) place(); if (!running) draw(); };
      img.src = scene.dataset.mountain.replace('{phase}', FILES[name]);
    });
  }
  function wantVideo() {                         // small screens fetch the 14 MB time-lapse only when asked for
    return !saveData && Boolean(scene.dataset.sunset) && (W >= 640 || mode === 'sunset') && (target[SUN] > 0 || shown[SUN] > 0);
  }
  function ensureVideo() {
    if (video || !wantVideo()) return;
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.addEventListener('loadeddata', function () {
      videoOK = true;
      video.currentTime = video.duration * LOOP[0];
      play();
    });
    video.src = scene.dataset.sunset;
    hold = document.createElement('canvas'); hold.width = 960; hold.height = 540; holdCtx = hold.getContext('2d');
    probe = document.createElement('canvas'); probe.width = 2; probe.height = 10;
    probeCtx = probe.getContext('2d', { willReadFrequently: true });
  }
  function play() { if (video && videoOK && running && shown[SUN] > 0.001) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } }
  function pause() { if (video && !video.paused) video.pause(); }
  function loopVideo() {                             // at the end of the sunset, hold the last frame and fade into the start again
    if (!videoOK || video.seeking) return;
    var end = video.duration * LOOP[1];
    if (video.currentTime >= end) {
      holdCtx.drawImage(video, 0, 0, 960, 540);
      fade = 0;
      video.currentTime = video.duration * LOOP[0];
    }
  }
  function sampleEdges() {
    if (!videoOK || video.readyState < 2) return;
    var vw = video.videoWidth, vh = video.videoHeight;
    probeCtx.drawImage(video, 0, 0, vw * 0.04, vh, 0, 0, 1, 10);
    probeCtx.drawImage(video, vw * 0.96, 0, vw * 0.04, vh, 1, 0, 1, 10);
    var d = probeCtx.getImageData(0, 0, 2, 10).data, left = [], right = [];
    for (var i = 0; i < 10; i++) {
      left.push([d[(i * 2) * 4], d[(i * 2) * 4 + 1], d[(i * 2) * 4 + 2]]);
      right.push([d[(i * 2 + 1) * 4], d[(i * 2 + 1) * 4 + 1], d[(i * 2 + 1) * 4 + 2]]);
    }
    if (!edges) edges = { left: left, right: right };
    else for (var k = 0; k < 10; k++) {                // ease, so the extension never flickers
      edges.left[k] = lerp3(edges.left[k], left[k], 0.15);
      edges.right[k] = lerp3(edges.right[k], right[k], 0.15);
    }
  }

  // ------------------------------------------------------------------ layout
  function layout() {
    var box = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(box.width)); H = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    water = Math.round(H * 0.58);
    reflH = H - water;
    refl = refl || document.createElement('canvas');
    refl.width = Math.round(W * DPR); refl.height = Math.round((H - Math.round(H * 0.58)) * DPR);
    rctx = refl.getContext('2d');
    sky = [];
    for (var i = 0; i < Math.round(W * H / 5200); i++) {
      sky.push({ x: Math.random() * W, y: Math.random() * water * 0.7, r: rand(0.35, 1.05), a: rand(0.15, 0.6), p: rand(0, 6.28), s: rand(0.4, 1.4) });
    }
    mount = null; place();
  }
  function place() {
    var first = NAMES.filter(function (n) { return images[n]; })[0];
    var any = images.night || images[first];
    if (!any || !W) return;
    var iw = any.naturalWidth, ih = any.naturalHeight;
    var scale = Math.max(W * 1.04 / iw, (H * 0.3) / ih);
    mount = { x: W * 0.5 - iw * scale * 0.5, y: water - ih * scale, w: iw * scale, h: ih * scale };
  }
  function videoRect() {                             // cover: as wide as the frame, as tall as the sky needs
    var vw = 960, vh = 540, span = (ROWS[1] - ROWS[0]) * vh;
    var scale = Math.max(W / vw, water / span);
    var w = vw * scale, h = vh * scale;
    return { x: (W - w) / 2, y: water - ROWS[1] * h, w: w, h: h };
  }

  // ------------------------------------------------------------------ drawing
  function drawPhotos(alphaScale) {
    var total = 0;
    NAMES.forEach(function (name, i) {
      var w = shown[i] * (name === 'sunset' && videoOK ? 0 : 1), img = images[name] || images.night;
      if (!w || !img || !mount) return;
      total += w;
      ctx.globalAlpha = (w / total) * alphaScale;
      ctx.drawImage(img, mount.x, mount.y, mount.w, mount.h);
    });
    ctx.globalAlpha = 1;
  }
  function drawSunset(s) {                           // the time-lapse across the full width, bottom rows on the waterline
    var r = videoRect();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, water + 1); ctx.clip();
    if (fade < 1) { ctx.globalAlpha = s * (1 - fade); ctx.drawImage(hold, r.x, r.y, r.w, r.h); }
    if (video.readyState >= 2) { ctx.globalAlpha = s * (fade < 1 ? fade : 1); ctx.drawImage(video, r.x, r.y, r.w, r.h); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  function mirror(deep, darkness) {                  // the lake reflects whatever is above it, flipped and dimmed
    var src = Math.min(water, reflH / 0.74);
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.globalAlpha = 1;
    rctx.fillStyle = rgb(deep); rctx.fillRect(0, 0, refl.width, refl.height);
    rctx.save();
    rctx.translate(0, 0); rctx.scale(1, -1);
    rctx.drawImage(canvas, 0, (water - src) * DPR, W * DPR, src * DPR, 0, -src * 0.74 * DPR, W * DPR, src * 0.74 * DPR);
    rctx.restore();
    rctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    rctx.fillStyle = rgb(deep, darkness); rctx.fillRect(0, 0, W, reflH);
    var f = rctx.createLinearGradient(0, 0, 0, reflH);
    f.addColorStop(0, rgb(deep, 0.05)); f.addColorStop(0.5, rgb(deep, 0.65)); f.addColorStop(0.85, rgb(deep, 1));
    rctx.fillStyle = f; rctx.fillRect(0, 0, W, reflH);
  }
  function rippleAt(x, y) {
    var dx = 0;
    for (var i = 0; i < ripples.length; i++) {
      var p = ripples[i], front = 18 + p.age * 62;
      var d = Math.sqrt((x - p.x) * (x - p.x) + ((y - p.y) / 0.24) * ((y - p.y) / 0.24));
      var off = d - front;
      dx += Math.sin(off * 0.21) * Math.exp(-(off * off) / 900) * Math.exp(-p.age * 0.75) * 4.2;
    }
    return dx;
  }
  function glow(x, y, radius, alpha, color) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgb(color, alpha)); g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, radius, 0, 6.2832); ctx.fill();
  }

  function setWater(s) {
    var next = Math.round(H * (0.58 + 0.08 * s));
    if (next === water) return;
    water = next; reflH = H - water;
    if (mount) mount.y = water - mount.h;
  }
  function draw() {
    var t = clock, s = videoOK ? shown[SUN] : 0;
    setWater(s);
    var top = blend(function (l) { return l.sky[0]; }), middle = blend(function (l) { return l.sky[1]; }), horizon = blend(function (l) { return l.sky[2]; });
    var night = blend(function (l) { return l.stars; }), light = blend(function (l) { return l.light; });
    var mist = blend(function (l) { return l.mist; }), hz = blend(function (l) { return l.haze; });
    var deep = blend(function (l) { return l.deep; }), darkness = blend(function (l) { return l.dark; });
    if (s > 0 && edges) {                             // under the video, the water takes the colour of the real sky
      deep = lerp3(deep, edges.left[8].map(function (c) { return c * 0.3; }), s);
      mist = lerp3(mist, edges.left[6].map(function (c) { return c * 0.5; }), s);
    }

    var air = ctx.createLinearGradient(0, 0, 0, water);
    air.addColorStop(0, rgb(top)); air.addColorStop(0.55, rgb(middle)); air.addColorStop(1, rgb(horizon));
    ctx.fillStyle = air; ctx.fillRect(0, 0, W, water + 2);
    if (night > 0.01) {
      for (var i = 0; i < sky.length; i++) {
        var st = sky[i], a = st.a * night * (0.65 + 0.35 * Math.sin(t * st.s + st.p)) * (1 - st.y / water * 0.6);
        ctx.fillStyle = 'rgba(236, 238, 246, ' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.2832); ctx.fill();
      }
    }
    drawPhotos(1);
    if (s > 0) drawSunset(s);
    stars.forEach(function (sr) {
      var life = Math.min(1, sr.age / 1.5) * Math.min(1, (70 - sr.age) / 8) * Math.max(0.15, night);
      var a = life * (0.55 + 0.35 * Math.sin(t * 1.3 + sr.p));
      ctx.fillStyle = rgb(light, a.toFixed(3));
      ctx.beginPath(); ctx.arc(sr.x, sr.y, 1.1, 0, 6.2832); ctx.fill();
      if (sr.age < 3) glow(sr.x, sr.y, 7, (0.25 * (1 - sr.age / 3)).toFixed(3), light);
    });
    if (mount) {
      var haze = ctx.createLinearGradient(0, water - mount.h * 0.3, 0, water + 2);
      haze.addColorStop(0, rgb(mist, 0)); haze.addColorStop(0.75, rgb(mist, 0.55 * hz)); haze.addColorStop(1, rgb(mist, 0.85 * hz));
      ctx.fillStyle = haze; ctx.fillRect(0, water - mount.h * 0.3, W, mount.h * 0.3 + 2);
    }

    // the lake
    mirror(deep, darkness);
    var band = 2, rows = Math.ceil(reflH / band);
    for (var row = 0; row < rows; row++) {
      var ry = row * band, y = water + ry, depth = ry / reflH;
      var shimmer = Math.sin(ry * 0.33 + t * 1.5) * (0.3 + depth * 1.8) + Math.sin(ry * 0.07 - t * 0.6) * depth * 1.4;
      var touched = false;
      for (var k = 0; k < ripples.length; k++) {
        if (Math.abs(y - ripples[k].y) < (18 + ripples[k].age * 62 + 60) * 0.24) { touched = true; break; }
      }
      if (!touched) ctx.drawImage(refl, 0, ry * DPR, W * DPR, band * DPR, shimmer, y, W, band);
      else for (var x = 0; x < W; x += 24) ctx.drawImage(refl, x * DPR, ry * DPR, 24 * DPR, band * DPR, x + shimmer + rippleAt(x + 12, y), y, 24, band);
    }
    var under = ctx.createLinearGradient(0, water, 0, water + reflH * 0.35);
    under.addColorStop(0, rgb(mist, 0.7 * hz)); under.addColorStop(1, rgb(mist, 0));
    ctx.fillStyle = under; ctx.fillRect(0, water, W, reflH * 0.35);

    ripples.forEach(function (p) {
      var front = 18 + p.age * 62, a = 0.24 * Math.exp(-p.age * 0.9);
      ctx.strokeStyle = rgb(light, a.toFixed(3)); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, front, front * 0.24, 0, 0, 6.2832); ctx.stroke();
      if (p.age > 0.35) {
        var inner = 18 + (p.age - 0.35) * 62;
        ctx.strokeStyle = rgb(light, (a * 0.55).toFixed(3));
        ctx.beginPath(); ctx.ellipse(p.x, p.y, inner, inner * 0.24, 0, 0, 6.2832); ctx.stroke();
      }
    });
    spray.forEach(function (sp) {
      ctx.fillStyle = rgb(light, Math.max(0, 0.7 - sp.age).toFixed(3));
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 0.9, 0, 6.2832); ctx.fill();
    });
    motes.forEach(function (m) {
      var mx = m.x + Math.sin(m.age * 0.8 + m.p) * 5, a = Math.min(1, m.age / 0.6) * (0.6 + 0.3 * Math.sin(t * 3 + m.p));
      ctx.fillStyle = rgb(light, a.toFixed(3));
      ctx.beginPath(); ctx.arc(mx, m.y, 1, 0, 6.2832); ctx.fill();
      glow(mx, m.y, 6, (0.2 * a).toFixed(3), light);
    });
    if (drop) {
      var speed = Math.min(1, Math.abs(drop.vy) / 420), tail = 6 + speed * 46, dir = drop.vy < 0 ? 1 : -1;
      var streak = ctx.createLinearGradient(drop.x, drop.y, drop.x, drop.y + dir * tail);
      streak.addColorStop(0, rgb(light, 0.85)); streak.addColorStop(1, rgb(light, 0));
      ctx.strokeStyle = streak; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(drop.x, drop.y); ctx.lineTo(drop.x, drop.y + dir * tail); ctx.stroke();
      glow(drop.x, drop.y, 18, 0.5, light);
      ctx.fillStyle = 'rgba(255, 250, 242, 1)';
      ctx.beginPath(); ctx.arc(drop.x, drop.y, 2.1, 0, 6.2832); ctx.fill();
      var my = 2 * (water + 6) - drop.y;
      if (my < H) glow(drop.x + rippleAt(drop.x, my), my, 10, (0.16 * (1 - Math.min(1, (my - water) / reflH))).toFixed(3), light);
    }
  }

  // ------------------------------------------------------------------ motion
  function launch() {
    var apex = Math.max(mount ? mount.y + mount.h * 0.1 : H * 0.2, H * 0.12) + rand(0, H * 0.12);
    var g = 300, height = water + 6 - apex;
    drop = { x: W * 0.5 + rand(-0.16, 0.16) * W, y: water + 6, vy: -Math.sqrt(2 * g * height), g: g };
  }
  function land(x) {
    ripples.push({ x: x, y: water + 6, age: 0 });
    for (var i = 0; i < 7; i++) spray.push({ x: x, y: water + 5, vx: rand(-26, 26), vy: rand(-70, -30), age: 0 });
    motes.push({ x: x + rand(-6, 6), y: water - 2, vy: -rand(14, 22), p: rand(0, 6.28), target: rand(H * 0.04, (mount ? mount.y : H * 0.3) - 10), age: 0 });
  }
  function ease(dt) {                              // drift slowly with the clock, quicker right after a button press
    var rate = Math.min(1, dt * (rush ? 1.8 : 0.5)), moved = false;
    for (var i = 0; i < shown.length; i++) {
      var next = shown[i] + (target[i] - shown[i]) * rate;
      if (Math.abs(next - target[i]) < 0.002) next = target[i];
      if (next !== shown[i]) { shown[i] = next; moved = true; }
    }
    if (!moved) rush = false;
  }
  function step(dt) {
    clock += dt;
    ease(dt);
    ensureVideo();
    if (video) {
      if (shown[SUN] > 0.001) { play(); loopVideo(); sampleEdges(); } else pause();
      if (fade < 1) fade = Math.min(1, fade + dt / 1.2);
    }
    if (calm) return;
    if (!drop) { wait -= dt; if (wait <= 0) launch(); }
    else {
      drop.vy += drop.g * dt; drop.y += drop.vy * dt;
      if (drop.vy > 0 && drop.y >= water + 6) { land(drop.x); drop = null; wait = rand(1.4, 2.4); }
    }
    ripples = ripples.filter(function (p) { p.age += dt; return p.age < 5; });
    spray = spray.filter(function (sp) { sp.age += dt; sp.vy += 200 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; return sp.y < water + 7; });
    motes = motes.filter(function (m) {
      m.age += dt; m.y += m.vy * dt;
      if (m.y <= m.target) { stars.push({ x: m.x + Math.sin(m.age * 0.8 + m.p) * 5, y: m.y, age: 0, p: m.p }); return false; }
      return true;
    });
    stars = stars.filter(function (sr) { sr.age += dt; return sr.age < 70; });
    if (stars.length > 36) stars.shift();
  }
  function loop(now) {
    if (!running) return;
    var tt = now / 1000, dt = Math.min(0.05, last ? tt - last : 0.016);
    last = tt; step(dt); draw();
    frame = window.requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; last = 0; play(); frame = window.requestAnimationFrame(loop); }
  function stop() { running = false; window.cancelAnimationFrame(frame); pause(); }
  function still() { shown = target.slice(); draw(); }

  // ------------------------------------------------------------------ the hour buttons
  var buttons = Array.prototype.slice.call(scene.querySelectorAll('[data-phase]'));
  var nowLabel = scene.querySelector('[data-now]');
  function choose(name) {
    mode = name; rush = true;
    target = weightsFor(name);
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.phase === name)); });
    if (calm || !running) still();
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { choose(b.dataset.phase); }); });
  function tickClock() {
    if (nowLabel) {
      var now = new Date();
      nowLabel.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }
    if (mode === 'now') { target = weightsFor('now'); if (calm) still(); }
  }
  tickClock();
  window.setInterval(tickClock, 30000);

  // ------------------------------------------------------------------ lifecycle
  var visible = false;
  layout();
  window.addEventListener('resize', function () { layout(); if (!running) draw(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) load(); }, { rootMargin: '900px 0px' }).observe(scene);
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) scene.classList.add('is-in');
      if (visible && !document.hidden && !calm) start(); else stop();
      if (calm && visible) still();
    }, { threshold: 0.15 }).observe(scene);
  } else { load(); visible = true; scene.classList.add('is-in'); if (!calm) start(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible && !calm) start(); });
})();
