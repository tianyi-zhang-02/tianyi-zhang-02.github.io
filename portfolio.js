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

(() => {
  const root = document.documentElement;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections = document.querySelectorAll('.portfolio-refined .compact-section');
  if (calm || !('IntersectionObserver' in window) || !sections.length) return;
  root.classList.add('tx-reveal');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  sections.forEach(section => {
    if (section.getBoundingClientRect().top < window.innerHeight) section.classList.add('is-in');
    observer.observe(section);
  });
})();

// Local time in the three places I have lived; the city I am in now is marked in the markup.
(() => {
  const clocks = Array.from(document.querySelectorAll('[data-clock]'));
  if (!clocks.length || !window.Intl) return;
  const formats = clocks.map(item => {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: item.dataset.clock, hour: '2-digit', minute: '2-digit', hour12: false }); }
    catch (error) { return null; }
  });
  function tick() {
    const now = new Date();
    clocks.forEach((item, index) => {
      const time = item.querySelector('time');
      if (time && formats[index]) time.textContent = formats[index].format(now);
    });
  }
  tick();
  window.setInterval(tick, 15000);
})();
