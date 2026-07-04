/* Fills the sticky "on this page" section bar (#toc) from a page's sections and
   highlights the active one on scroll. Collects <section id> / <article id>
   under <main>. An element may set data-toc="Short label" to override its heading. */
(function () {
  var bar = document.getElementById('toc');
  if (!bar) return;

  var nodes = Array.prototype.slice.call(
    document.querySelectorAll('main section[id], main article[id]')
  );
  if (nodes.length < 2) { bar.style.display = 'none'; return; }

  var links = {};

  nodes.forEach(function (n) {
    var heading = n.querySelector('h2, h3');
    var label = n.getAttribute('data-toc') || (heading && heading.textContent.trim());
    if (!label) return;
    var a = document.createElement('a');
    a.href = '#' + n.id;
    a.textContent = label;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      n.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + n.id);
    });
    bar.appendChild(a);
    links[n.id] = a;
  });

  // scroll-spy: highlight the section nearest the top of the viewport
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        Object.keys(links).forEach(function (id) {
          links[id].classList.toggle('active', id === en.target.id);
        });
        // keep the active chip in view on small screens
        var active = links[en.target.id];
        if (active && bar.scrollWidth > bar.clientWidth) {
          active.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      }
    });
  }, { rootMargin: '-118px 0px -70% 0px', threshold: 0 });

  nodes.forEach(function (n) { obs.observe(n); });
})();
