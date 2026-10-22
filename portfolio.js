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
    if (activeLink) {
      activeLink.setAttribute('aria-current', 'location');
      if (navigation.scrollWidth > navigation.clientWidth) {
        const bounds = navigation.getBoundingClientRect();
        const linkBounds = activeLink.getBoundingClientRect();
        if (linkBounds.left < bounds.left) {
          navigation.scrollTo({ left: navigation.scrollLeft + linkBounds.left - bounds.left, behavior: 'auto' });
        } else if (linkBounds.right > bounds.right) {
          navigation.scrollTo({ left: navigation.scrollLeft + linkBounds.right - bounds.right, behavior: 'auto' });
        }
      }
    }
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
