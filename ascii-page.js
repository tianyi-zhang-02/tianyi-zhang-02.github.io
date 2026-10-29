/* The page below the sky: the top bar takes on the page's colours, and shows the name, once the sky
   has scrolled away. Nothing here runs per frame, so scrolling costs nothing. */
(function () {
  'use strict';
  var root = document.documentElement;

  /* ---- the bar: transparent over the sky, the page's colours below it ------------------------ */
  var hero = document.querySelector('.sky-hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { root.classList.toggle('past-hero', !e[0].isIntersecting); },
      { rootMargin: '-60px 0px 0px 0px' }).observe(hero);
  } else root.classList.add('past-hero');
})();
