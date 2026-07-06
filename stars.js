/* Live GitHub star counts. Any element with data-stars="owner/repo" gets its
   text set to "★ N" from the GitHub API. On failure (unreachable, rate-limited,
   or private repo) it leaves the plain "★" in place rather than removing it, so
   the badge never just vanishes. */
(function () {
  var els = document.querySelectorAll('[data-stars]');
  els.forEach(function (el) {
    var repo = el.getAttribute('data-stars');
    fetch('https://api.github.com/repos/' + repo, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && typeof d.stargazers_count === 'number') {
          el.textContent = '★ ' + d.stargazers_count.toLocaleString();
        }
      })
      .catch(function () {});
  });
})();
