/*
 * Runs in <head> before first paint (an external file, because the page CSP forbids inline scripts).
 * 1. Sets data-theme / data-surface on <html> so the page never flashes the wrong look.
 * 2. Fades out the opening screen (#splash) once the app has drawn.
 * Theme colours here must match web/src/theme.ts.
 */
(function () {
  var d = document.documentElement;
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var bgs = { light: '#F1F1ED', dark: '#26282C', blue: '#EEF2F7', green: '#EDF1EC', neon: '#14121F' };

  var t = get('theme') || get('site-mode') || 'auto';
  if (t === 'auto' || !bgs[t]) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  d.dataset.theme = t;
  d.dataset.surface = get('surface') === 'solid' ? 'solid' : 'glass';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = bgs[t];

  // The neon opening screen plays once per browser session; later loads only cover the page until it is ready.
  var seen = false;
  try { seen = sessionStorage.getItem('splash') === '1'; sessionStorage.setItem('splash', '1'); } catch (e) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var min = seen ? 0 : reduce ? 500 : 1000;
  var t0 = Date.now();

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('splash');
    if (!el) return;
    if (seen) el.className = 'quick';
    function done() {
      if (el.className === 'out') return;
      el.className = 'out';
      setTimeout(function () { el.remove(); }, 450);
    }
    (function check() {
      if (d.dataset.ready && Date.now() - t0 >= min) done();
      else if (el.isConnected) setTimeout(check, 60);
    })();
    setTimeout(done, 8000); // never stuck
  });
})();
