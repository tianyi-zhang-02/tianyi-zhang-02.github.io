(function () {
  var root = document.documentElement;
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    }
  } catch (error) {}

  // The page's colours follow the visitor's clock and season, set here before the first paint so
  // nothing flashes: the sky's colour (also the page's in the dark theme) and the season's gas
  // colours, which tint the glows behind the page. ascii-sky.js reads the same clock from
  // window.skyClock. ?hour=21.5 and ?month=1 override the clock for checking.
  var q = location.search, d = new Date(), m;
  var hour = (m = /[?&]hour=([\d.]+)/.exec(q)) ? +m[1] % 24 : d.getHours() + d.getMinutes() / 60;
  var month = (m = /[?&]month=(\d+)/.exec(q)) ? (+m[1] - 1) % 12 : d.getMonth();
  function ramp(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  var day = ramp(5, 8.5, hour) * (1 - ramp(17, 20.5, hour));                       // 0 at night, 1 by day
  var warm = Math.max(Math.exp(-Math.pow((hour - 6.6) / 1.2, 2)), Math.exp(-Math.pow((hour - 18.6) / 1.3, 2)));   // dawn and dusk
  var period = hour < 5 ? 'Night' : hour < 8 ? 'Dawn' : hour < 17 ? 'Day' : hour < 20.5 ? 'Dusk' : 'Night';
  // seasons as in the northern hemisphere; each has its gas colours and its weather
  var SEASONS = [
    { name: 'Winter', gas: ['#4f9fe0', '#7b86ff', '#c4b8ff'], weather: 'snow', tint: '#e4ecff' },
    { name: 'Spring', gas: ['#3dbf9c', '#8a7cff', '#ff7eb6'], weather: 'petals', tint: '#ffb6d3' },
    { name: 'Summer', gas: ['#2aa7c9', '#c056ff', '#ff8a4c'], weather: 'fireflies', tint: '#ffe08a' },
    { name: 'Autumn', gas: ['#6a5cff', '#e2589a', '#f2a541'], weather: 'leaves', tint: '#f2a541' }];
  var season = SEASONS[Math.floor(((month + 1) % 12) / 3)];
  var night = [5, 5, 7], noon = [15, 15, 18], dusk = [24, 16, 15];
  var sky = night.map(function (c, i) { return Math.round(c + (noon[i] - c) * day + (dusk[i] - c) * 0.55 * warm); });
  window.skyClock = { hour: hour, day: day, warm: warm, period: period, season: season };

  root.style.setProperty('--sky', 'rgb(' + sky.join(', ') + ')');
  season.gas.forEach(function (hex, i) {
    var n = parseInt(hex.slice(1), 16);
    root.style.setProperty('--gas-' + (i + 1), (n >> 16 & 255) + ', ' + (n >> 8 & 255) + ', ' + (n & 255));
  });
})();
