/* Builds the "On this page" sidebar from a page's sections and highlights the
   active one on scroll. Collects <section id> / <article id> under <main>.
   An element may set data-toc="Short label" to override its heading text. */
(function () {
  var toc = document.getElementById('toc');
  if (!toc) return;

  var nodes = Array.prototype.slice.call(
    document.querySelectorAll('main section[id], main article[id]')
  );
  if (nodes.length < 2) { toc.style.display = 'none'; return; }

  var links = {};
  var ol = document.createElement('ol');

  nodes.forEach(function (n) {
    var heading = n.querySelector('h2, h3');
    var label = n.getAttribute('data-toc') || (heading && heading.textContent.trim());
    if (!label) return;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + n.id;
    a.textContent = label;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      n.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + n.id);
    });
    li.appendChild(a);
    ol.appendChild(li);
    links[n.id] = a;
  });

  var head = document.createElement('p');
  head.className = 'toc-h';
  head.textContent = 'On this page';
  toc.appendChild(head);
  toc.appendChild(ol);

  // scroll-spy: highlight the section nearest the top of the viewport
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        Object.keys(links).forEach(function (id) {
          links[id].classList.toggle('active', id === en.target.id);
        });
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

  nodes.forEach(function (n) { obs.observe(n); });
})();
