(() => {
  const navigation = document.querySelector('.portfolio-bar .section-nav');
  if (!navigation) return;

  const destinations = Array.from(navigation.querySelectorAll('a[href^="#"]'))
    .map(link => ({ link, section: document.getElementById(link.hash.slice(1)) }))
    .filter(destination => destination.section);
  let scheduled = false;
  let currentLink = null;

  function updateCurrentSection() {
    scheduled = false;
    let activeLink = null;
    for (const destination of destinations) {
      if (destination.section.getBoundingClientRect().top <= 150) {
        activeLink = destination.link;
      }
    }
    if (activeLink === currentLink) return;
    if (currentLink) currentLink.removeAttribute('aria-current');
    if (activeLink) activeLink.setAttribute('aria-current', 'location');
    currentLink = activeLink;
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateCurrentSection);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  scheduleUpdate();
})();
