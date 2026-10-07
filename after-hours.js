(function () {
  var section = document.querySelector('.after-hours');
  if (!section) return;

  var screen = section.querySelector('.after-hours-screen');
  var invitation = section.querySelector('.after-hours-invitation');
  var playButton = section.querySelector('.after-hours-play');
  var closeButton = section.querySelector('.after-hours-close');
  var status = section.querySelector('.after-hours-status');
  var player = null;

  playButton.hidden = false;

  playButton.addEventListener('click', function () {
    if (player) return;

    player = document.createElement('iframe');
    player.title = '新宿决战 · 雨爱 DJ — Bilibili video player';
    player.allow = 'autoplay; fullscreen; picture-in-picture';
    player.allowFullscreen = true;
    player.referrerPolicy = 'no-referrer';
    player.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
    player.src = 'https://player.bilibili.com/player.html?bvid=BV1QC3G6DEKX&autoplay=1&muted=0&danmaku=0&poster=1';
    player.addEventListener('load', function () {
      status.textContent = 'If playback does not start, use the player controls or open the original on Bilibili.';
    });
    player.addEventListener('error', function () {
      status.textContent = 'The player could not load. You can still watch the original on Bilibili.';
    });

    invitation.hidden = true;
    closeButton.hidden = false;
    screen.classList.add('is-playing');
    status.textContent = 'Loading Bilibili…';
    screen.appendChild(player);
    closeButton.focus({ preventScroll: true });
  });

  closeButton.addEventListener('click', function () {
    if (!player) return;
    player.remove();
    player = null;
    screen.classList.remove('is-playing');
    invitation.hidden = false;
    closeButton.hidden = true;
    status.textContent = '';
    playButton.focus({ preventScroll: true });
  });
})();
