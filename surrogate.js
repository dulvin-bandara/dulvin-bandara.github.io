/* ============================================================
   Live surrogate demo (project-thermal-surrogate.html).
   Loads the fitted Gaussian process exported from the project's
   own code (data/surrogate-gp.json) and evaluates it in the
   browser: the same RBF kernel, the same training points, the
   same weights. Mass flow is normalised, as in the published
   dataset, so 1.00 is the largest value in the sweep.
     mean      = k(x)^T alpha, un-normalised
     variance  = c + noise - k(x)^T K^-1 k(x)
   The page works without this: the panel stays hidden.
   ============================================================ */

(function () {
  var box = document.querySelector('.gpdemo');
  if (!box || !window.fetch) return;

  fetch(box.getAttribute('data-src'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(start)
    .catch(function () { /* leave the panel hidden */ });

  function start(m) {
    var n = m.X.length;

    function predict(p) {
      var z = [0, 1, 2].map(function (j) { return (p[j] - m.mean[j]) / m.scale[j]; });
      var k = new Array(n), i, j, mu = 0;
      for (i = 0; i < n; i++) {
        var d = 0;
        for (j = 0; j < 3; j++) { var q = (m.X[i][j] - z[j]) / m.ls[j]; d += q * q; }
        k[i] = m.const * Math.exp(-0.5 * d);
        mu += k[i] * m.alpha[i];
      }
      var quad = 0;
      for (i = 0; i < n; i++) {
        var row = m.Kinv[i], s = 0;
        for (j = 0; j < n; j++) s += row[j] * k[j];
        quad += k[i] * s;
      }
      return {
        mean: mu * m.yStd + m.yMean,
        sd: Math.sqrt(Math.max(0, m.const + m.noise - quad)) * m.yStd
      };
    }
    function outside(p) {
      for (var j = 0; j < 3; j++) if (p[j] < m.bounds[0][j] || p[j] > m.bounds[1][j]) return true;
      return false;
    }

    /* sliders run a little past the sampled range, so extrapolation can be seen */
    var sliders = [].slice.call(box.querySelectorAll('input[type="range"]'));
    sliders.forEach(function (s, j) {
      var lo = m.bounds[0][j], hi = m.bounds[1][j], pad = (hi - lo) * 0.18;
      s.min = (lo - pad).toFixed(1); s.max = (hi + pad).toFixed(1); s.step = 0.1;
      s.value = ((lo + hi) / 2).toFixed(1);
      s.addEventListener('input', update);
    });

    var valEl = box.querySelector('.gp-val'), bandEl = box.querySelector('.gp-band');
    var stateEl = box.querySelector('.gp-state'), plot = box.querySelector('.gp-plot');
    var outs = [].slice.call(box.querySelectorAll('output'));
    var UNITS = ['m/s', 'mm', 'mm'];

    function point() { return sliders.map(function (s) { return parseFloat(s.value); }); }

    function draw(p) {
      var r = plot.getBoundingClientRect();
      if (r.width < 10) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      plot.width = Math.round(r.width * dpr); plot.height = Math.round(r.height * dpr);
      var g = plot.getContext('2d'), cs = getComputedStyle(document.documentElement);
      var css = function (v) { return cs.getPropertyValue(v).trim(); };
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, r.width, r.height);

      var L = 46, R = r.width - 14, T = 14, B = r.height - 34;
      var x0 = parseFloat(sliders[0].min), x1 = parseFloat(sliders[0].max), y0 = 0, y1 = 1.3;
      var X = function (v) { return L + (R - L) * (v - x0) / (x1 - x0); };
      var Y = function (v) { return B - (B - T) * (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0); };

      g.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
      g.textBaseline = 'middle';
      // the sampled range, shaded
      g.fillStyle = css('--paper-2');
      g.fillRect(X(m.bounds[0][0]), T, X(m.bounds[1][0]) - X(m.bounds[0][0]), B - T);
      // grid and axes
      g.lineWidth = 1;
      for (var yv = 0; yv <= 1.21; yv += 0.2) {
        g.strokeStyle = css('--rule'); g.beginPath(); g.moveTo(L, Y(yv) + 0.5); g.lineTo(R, Y(yv) + 0.5); g.stroke();
        g.fillStyle = css('--ink-faint'); g.textAlign = 'right'; g.fillText(yv.toFixed(1), L - 7, Y(yv));
      }
      g.textAlign = 'center';
      for (var xv = Math.ceil(x0 / 2) * 2; xv <= x1; xv += 2) g.fillText(String(xv), X(xv), B + 12);
      g.fillText('velocity, m/s', (L + R) / 2, B + 26);
      g.strokeStyle = css('--rule-strong');
      g.beginPath(); g.moveTo(L + 0.5, T); g.lineTo(L + 0.5, B + 0.5); g.lineTo(R, B + 0.5); g.stroke();

      // the curve at the current ride heights, with its two-sigma band
      var N = 90, pts = [], i;
      for (i = 0; i <= N; i++) {
        var v = x0 + (x1 - x0) * i / N, q = predict([v, p[1], p[2]]);
        pts.push([v, q.mean, q.sd]);
      }
      var accent = css('--accent');
      g.fillStyle = accent; g.globalAlpha = 0.16;
      g.beginPath();
      pts.forEach(function (q, k) { g[k ? 'lineTo' : 'moveTo'](X(q[0]), Y(q[1] + 2 * q[2])); });
      for (i = N; i >= 0; i--) g.lineTo(X(pts[i][0]), Y(pts[i][1] - 2 * pts[i][2]));
      g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = accent; g.lineWidth = 1.8; g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(function (q, k) { g[k ? 'lineTo' : 'moveTo'](X(q[0]), Y(q[1])); });
      g.stroke();

      // the CFD cases: training hollow, held-out solid. They sit at their own
      // ride heights, so they scatter around the curve rather than on it.
      g.lineWidth = 1.2;
      m.train.forEach(function (c) {
        g.strokeStyle = css('--ink-soft'); g.beginPath(); g.arc(X(c[0]), Y(c[3]), 3, 0, 6.3); g.stroke();
      });
      m.test.forEach(function (c) {
        g.fillStyle = css('--ink'); g.beginPath(); g.arc(X(c[0]), Y(c[3]), 3.2, 0, 6.3); g.fill();
      });

      // the current point
      var here = predict(p);
      g.strokeStyle = css('--ink'); g.lineWidth = 1;
      g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(p[0]) + 0.5, T); g.lineTo(X(p[0]) + 0.5, B); g.stroke(); g.setLineDash([]);
      g.fillStyle = accent; g.beginPath(); g.arc(X(p[0]), Y(here.mean), 4.5, 0, 6.3); g.fill();
      g.strokeStyle = css('--paper'); g.lineWidth = 1.5; g.stroke();
    }

    function update() {
      var p = point(), q = predict(p), out = outside(p);
      outs.forEach(function (o, j) { o.textContent = p[j].toFixed(1) + ' ' + UNITS[j]; });
      valEl.textContent = q.mean.toFixed(3);
      bandEl.textContent = '± ' + (2 * q.sd).toFixed(3) + ' (2σ)';
      stateEl.textContent = out ? 'Extrapolating: outside the sampled range' : 'Inside the sampled range';
      box.classList.toggle('is-out', out);
      draw(p);
    }

    box.hidden = false;
    update();
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(update, 100); });
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  }
})();
