/* ============================================================
   Application shell.
   The page is laid out like a CFD package: a ribbon across the
   top, an outline tree down the left, the page in the main
   pane, a status bar along the bottom. This file:
     - turns the outline into a drawer on narrow screens
     - lists the current page's sections under its tree item
     - treats the scroll position as a solver run: iteration
       count and residuals in the status bar, a residual plot
       and a report under the tree, rows in the console
     - wires the tool row: Initialize / Iterate / Run Calculation
       move through the page, Display shows or hides parts of
       the index graphics window, Console opens a command line
   Everything here is enhancement: the tree and ribbon are plain
   links in the HTML and work without it.
   ============================================================ */

(function () {
  var root = document.documentElement;
  root.classList.add('js-shell');

  var outline = document.getElementById('outline');
  var toggle = document.querySelector('.outlinetoggle');

  /* ---- drawer ---- */
  if (outline && toggle) {
    toggle.hidden = false;
    var setOpen = function (open) {
      root.classList.toggle('outline-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', function () {
      setOpen(!root.classList.contains('outline-open'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('outline-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    outline.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!root.classList.contains('outline-open')) return;
      if (!e.target.closest('#outline') && !e.target.closest('.outlinetoggle')) setOpen(false);
    });
  }

  /* ---- this page's sections, under the current tree item ---- */
  var current = outline && outline.querySelector('a[aria-current="page"]');
  var heads = document.querySelectorAll('main section h3');
  // only long-form pages: project write-ups, not card lists
  if (current && heads.length >= 3 && !document.querySelector('main .projlink:not(.noimg)')) {
    var sub = document.createElement('ul');
    sub.className = 'tsub';
    var links = [];
    Array.prototype.forEach.call(heads, function (h, n) {
      if (h.closest('.projlink')) return;
      if (!h.id) h.id = 's' + (n + 1) + '-' + h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      sub.appendChild(li);
      links.push({ h: h, a: a });
    });
    current.parentNode.appendChild(sub);

    if ('IntersectionObserver' in window && links.length) {
      var mark = function () {
        var best = links[0];
        links.forEach(function (l) {
          if (l.h.getBoundingClientRect().top < 140) best = l;
        });
        links.forEach(function (l) { l.a.classList.toggle('is-here', l === best); });
      };
      var q = 0;
      window.addEventListener('scroll', function () {
        if (!q) q = requestAnimationFrame(function () { q = 0; mark(); });
      }, { passive: true });
      mark();
    }
  }

  /* ============================================================
     The page as a solver run
     ============================================================ */

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var main = document.getElementById('main');
  var toolbar = document.querySelector('.toolbar');
  var statusbar = document.querySelector('.statusbar');
  var caseName = ((location.pathname.split('/').pop() || 'index.html').replace(/\.html?$/, '').replace(/^project-/, '') || 'index') + '.cas';
  // zones: the page's sections, or its headings where a write-up is one long section
  var sections = main ? Array.prototype.slice.call(main.querySelectorAll('section')) : [];
  if (main && sections.length < 4) {
    var hs = Array.prototype.filter.call(main.querySelectorAll('h2, h3'), function (h) { return !h.closest('.projlink'); });
    if (hs.length > sections.length) sections = hs;
  }
  var words = main ? (main.textContent.match(/\S+/g) || []).length : 0;

  function zoneName(sec) {
    var h = /^H\d$/.test(sec.tagName) ? sec : sec.querySelector('.rowlabel, h2, h3');
    return h ? h.textContent.trim().replace(/\s+/g, ' ') : '';
  }
  function fraction() {
    var max = root.scrollHeight - window.innerHeight;
    return max > 4 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
  }
  function chromeBottom() {
    return toolbar ? toolbar.getBoundingClientRect().bottom : 0;
  }

  /* residuals: three curves that fall as the page is read. Each page gets
     its own wiggle, seeded from its file name. Values are log10. */
  var seed = 0;
  for (var c = 0; c < caseName.length; c++) seed = (seed * 31 + caseName.charCodeAt(c)) % 997;
  seed = seed / 997 * 6.283;
  var FALL = [6, 6.7, 5.3];
  var KEYS = ['continuity', 'x-velocity', 'energy'];
  function res(k, f) {
    var base = -FALL[k] * (1 - Math.exp(-3.4 * f)) / (1 - Math.exp(-3.4));
    if (f <= 0) return base;
    return base + (0.17 * Math.sin(f * 61 + seed + k * 2.1) + 0.09 * Math.sin(f * 143 + seed * 1.7 + k)) * (1 - 0.5 * f);
  }
  function sci(log) { return Math.pow(10, log).toExponential(1); }
  function pad(v, n) { v = String(v); while (v.length < n) v = ' ' + v; return v; }

  /* ---- console dock ---- */
  var con = document.createElement('div');
  con.className = 'console';
  con.id = 'console';
  con.hidden = true;
  con.innerHTML =
    '<div class="con-head"><span>Console</span><button class="con-close" type="button" aria-label="Close console">×</button></div>' +
    '<div class="con-log"></div>' +
    '<form class="con-in"><label for="con-cmd" aria-hidden="true">&gt;</label>' +
    '<input id="con-cmd" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" ' +
    'aria-label="Console command. Type help for the list." placeholder="type help, then press Enter"></form>';
  if (statusbar) document.body.insertBefore(con, statusbar);
  var logEl = con.querySelector('.con-log');
  var input = con.querySelector('input');
  var sbConsole = document.querySelector('.sb-console');

  function log(text, cls, href) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    if (href) {
      var a = document.createElement('a');
      a.href = href; a.textContent = text;
      if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
      d.appendChild(a);
    } else d.textContent = text;
    logEl.appendChild(d);
    while (logEl.childNodes.length > 300) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function command(text) {
    log('> ' + text, 'c-cmd');
    if (sbConsole) sbConsole.textContent = '> ' + text;
  }

  var consoleBtn = toolbar && toolbar.querySelector('[data-act="console"]');
  function setConsole(open, focus) {
    con.hidden = !open;
    root.classList.toggle('console-open', open);
    if (consoleBtn) consoleBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    try { sessionStorage.setItem('console', open ? '1' : '0'); } catch (e) { /* not kept */ }
    if (open) { logEl.scrollTop = logEl.scrollHeight; if (focus) input.focus(); }
  }
  con.querySelector('.con-close').addEventListener('click', function () {
    setConsole(false);
    if (consoleBtn) consoleBtn.focus();
  });

  command('/file/read-case "' + caseName + '"');
  log('Reading "' + caseName + '"...');
  log('  ' + pad(sections.length, 5) + ' zones (sections)');
  log('  ' + pad(words.toLocaleString('en'), 5) + ' cells (words)');
  log('Done.', 'c-ok');
  log(pad('iter', 6) + pad('continuity', 12) + pad('x-velocity', 12) + pad('energy', 12), 'c-dim');

  /* ---- status bar extras ---- */
  var nEl = document.querySelector('.sb-n');
  var rEl = document.querySelector('.sb-r');
  var bar = document.querySelector('.sb-bar i');
  var stateEl = null;
  if (statusbar) {
    stateEl = document.createElement('span');
    stateEl.className = 'sb-state';
    stateEl.textContent = 'Ready';
    statusbar.insertBefore(stateEl, statusbar.firstChild);
    var solver = document.createElement('span');
    solver.className = 'sb-solver';
    solver.textContent = '3d · dp · pbns · sst k-ω';
    var iterEl = statusbar.querySelector('.sb-iter');
    if (iterEl) statusbar.insertBefore(solver, iterEl);
  }

  /* ---- monitor under the tree: residual plot and a report ---- */
  var plot = null, plotIter = null;
  if (outline) {
    var mon = document.createElement('div');
    mon.className = 'monitor';
    mon.setAttribute('aria-hidden', 'true');
    mon.innerHTML =
      '<p class="outline-head">Residuals <b class="mon-iter">iter 0000</b></p>' +
      '<canvas class="resplot"></canvas>' +
      '<p class="reskey">' + KEYS.map(function (k, n) {
        return '<span style="--k:var(--res-' + 'abc'.charAt(n) + ')">' + k + '</span>';
      }).join('') + '</p>' +
      '<p class="outline-head mon-report">Report</p>' +
      '<dl class="props"><dt>Case</dt><dd>' + caseName + '</dd>' +
      '<dt>Zones</dt><dd>' + sections.length + (sections.length === 1 ? ' section' : ' sections') + '</dd>' +
      '<dt>Cells</dt><dd>' + words.toLocaleString('en') + ' words</dd>' +
      '<dt>Wall time</dt><dd>~' + Math.max(1, Math.round(words / 230)) + ' min read</dd></dl>';
    outline.appendChild(mon);
    plot = mon.querySelector('canvas');
    plotIter = mon.querySelector('.mon-iter');
  }

  function drawPlot(f) {
    if (!plot || !plot.getContext) return;
    var r = plot.getBoundingClientRect();
    if (r.width < 10) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (plot.width !== W || plot.height !== H) { plot.width = W; plot.height = H; }
    var g = plot.getContext('2d'), cs = getComputedStyle(root);
    var css = function (n) { return cs.getPropertyValue(n).trim(); };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    var L = 38, R = r.width - 12, T = 10, B = r.height - 18, LO = -7;
    var X = function (x) { return L + (R - L) * x; };
    var Y = function (v) { return T + (B - T) * Math.min(1, Math.max(0, v / LO)); };
    g.font = '9.5px "IBM Plex Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.lineWidth = 1;
    for (var e = 0; e >= LO; e -= 2) {
      g.strokeStyle = css('--rule'); g.beginPath(); g.moveTo(L, Y(e) + 0.5); g.lineTo(R, Y(e) + 0.5); g.stroke();
      g.fillStyle = css('--ink-faint'); g.textAlign = 'right';
      g.fillText(e === 0 ? '1e+00' : '1e-0' + (-e), L - 5, Y(e));
    }
    g.textAlign = 'center';
    [0, 500, 1000].forEach(function (n) { g.fillText(String(n), Math.min(R - 10, Math.max(L + 4, X(n / 1000))), B + 10); });
    g.strokeStyle = css('--rule-strong');
    g.beginPath(); g.moveTo(L + 0.5, T); g.lineTo(L + 0.5, B + 0.5); g.lineTo(R, B + 0.5); g.stroke();
    g.lineWidth = 1.4; g.lineJoin = 'round';
    for (var k = 0; k < 3; k++) {
      var col = css('--res-' + 'abc'.charAt(k));
      g.strokeStyle = col; g.beginPath();
      for (var x = 0; x <= f + 1e-6; x += 0.004) { if (x === 0) g.moveTo(X(0), Y(res(k, 0))); else g.lineTo(X(x), Y(res(k, x))); }
      g.lineTo(X(f), Y(res(k, f)));
      g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(X(f), Y(res(k, f)), 2.2, 0, 6.3); g.fill();
    }
  }

  /* ---- one update per frame ---- */
  var logged = 0, zone = -1, converged = false, solving = false, raf = 0;
  function setState() {
    root.classList.toggle('is-solving', solving);
    root.classList.toggle('is-converged', converged && !solving);
    if (stateEl) stateEl.textContent = solving ? 'Solving' : converged ? 'Converged' : 'Ready';
  }
  function update() {
    raf = 0;
    var f = fraction(), it = Math.round(f * 1000);
    if (nEl) nEl.textContent = ('000' + it).slice(-4);
    if (rEl) rEl.textContent = f >= 0.999 ? 'converged' : sci(res(0, f));
    if (bar) bar.style.width = f * 100 + '%';
    if (plotIter) plotIter.textContent = 'iter ' + ('000' + it).slice(-4);
    drawPlot(f);

    // console: the zone being read, a row every 50 iterations, convergence
    var edge = chromeBottom() + 60, now = -1;
    sections.forEach(function (sec, n) { if (sec.getBoundingClientRect().top < edge) now = n; });
    if (now !== zone && now >= 0 && zoneName(sections[now])) {
      zone = now;
      log('> /display/zone "' + zoneName(sections[now]) + '"', 'c-dim');
    }
    var rows = 0;
    while (logged + 50 <= it && rows++ < 20) {
      logged += 50;
      var x = logged / 1000;
      log(pad(logged, 6) + pad(sci(res(0, x)), 12) + pad(sci(res(1, x)), 12) + pad(sci(res(2, x)), 12));
    }
    if (f >= 0.999 && !converged) {
      converged = true;
      log('!  1000 solution is converged', 'c-ok');
    }
    setState();
  }
  function queue() { if (!raf) raf = requestAnimationFrame(update); }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('load', queue);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
  new MutationObserver(queue).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  update();

  /* ---- Solution: move through the page ---- */
  var runBtn = toolbar && toolbar.querySelector('[data-act="run"]');
  var runRaf = 0;
  function stopRun() {
    if (!solving) return;
    solving = false;
    cancelAnimationFrame(runRaf);
    root.style.scrollBehavior = '';
    if (runBtn) { runBtn.setAttribute('aria-pressed', 'false'); runBtn.lastChild.textContent = 'Run Calculation'; }
    log(fraction() >= 0.999 ? 'Calculation complete.' : 'Calculation interrupted.', fraction() >= 0.999 ? 'c-ok' : 'c-dim');
    setState();
  }
  function startRun() {
    if (solving) return;
    var max = root.scrollHeight - window.innerHeight;
    if (max <= 4) { log('Nothing to iterate: the page fits the window.', 'c-dim'); return; }
    if (reduced) { window.scrollTo(0, max); return; }   // no automatic motion: go straight to the end
    root.style.scrollBehavior = 'auto';
    if (window.scrollY >= max - 4) window.scrollTo(0, 0);
    solving = true;
    if (runBtn) { runBtn.setAttribute('aria-pressed', 'true'); runBtn.lastChild.textContent = 'Stop'; }
    setState();
    var y = window.scrollY, last = performance.now();
    var speed = Math.min(520, Math.max(110, max / 26));   // px per second
    var tick = function (t) {
      if (!solving) return;
      var dt = Math.min(0.1, (t - last) / 1000); last = t;
      max = root.scrollHeight - window.innerHeight;
      y = Math.min(max, y + speed * dt);
      window.scrollTo(0, y);
      if (y >= max) { update(); stopRun(); return; }
      runRaf = requestAnimationFrame(tick);
    };
    runRaf = requestAnimationFrame(tick);
  }
  // any scroll input from the reader takes the page back
  ['wheel', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, stopRun, { passive: true }); });
  window.addEventListener('keydown', function (e) {
    if (solving && /^(Escape|ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) stopRun();
  });
  window.addEventListener('mousedown', function (e) { if (!e.target.closest('.toolbar')) stopRun(); });

  function initialize() {
    stopRun();
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }
  function iterate() {
    stopRun();
    var edge = chromeBottom() + 40, next = null;
    sections.some(function (sec) { if (sec.getBoundingClientRect().top > edge) { next = sec; return true; } return false; });
    if (next) next.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    else window.scrollTo({ top: root.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* ---- Display: the index graphics window ---- */
  var flow = document.querySelector('.flowcanvas');
  var hero = flow && flow.closest('.hero');
  function display(what, on) {
    if (!hero) return false;
    if (on === undefined) on = hero.classList.contains('no-' + what);
    hero.classList.toggle('no-' + what, !on);
    var b = toolbar && toolbar.querySelector('[data-act="' + what + '"]');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    return on;
  }
  function regenerate() {
    if (!hero) return false;
    var pause = hero.querySelector('.heropause');
    if (hero.classList.contains('is-paused') && pause) pause.click();
    display('mesh', true); display('lines', true);
    hero.dispatchEvent(new CustomEvent('flow:replay'));
    return true;
  }

  /* ---- tool row ---- */
  if (toolbar) {
    Array.prototype.forEach.call(toolbar.querySelectorAll('.tb-group[hidden]'), function (g) {
      if (g.getAttribute('data-group') === 'display' && !hero) return;
      g.hidden = false;
    });
    if (reduced) {
      var rm = toolbar.querySelector('[data-act="remesh"]');
      if (rm) rm.hidden = true;
    }
    toolbar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      switch (b.getAttribute('data-act')) {
        case 'init': command('/solve/initialize'); initialize(); regenerate(); break;   // on the index, the build replays too
        case 'step': command('/solve/iterate 1'); iterate(); break;
        case 'run':
          if (solving) stopRun(); else { command('/solve/iterate 1000'); startRun(); }
          break;
        case 'mesh': command('/display/mesh ' + (display('mesh') ? 'on' : 'off')); break;
        case 'lines': command('/display/streamlines ' + (display('lines') ? 'on' : 'off')); break;
        case 'contour': command('/display/contour ' + (display('contour') ? 'on' : 'off')); break;
        case 'colour': command('/display/surface-colour ' + (display('colour') ? 'on' : 'off')); break;
        case 'remesh': command('/mesh/generate'); regenerate(); break;
        case 'console': setConsole(con.hidden, true); break;
      }
    });
  }

  /* ---- console commands ---- */
  var pages = {}, cases = [];
  if (outline) {
    Array.prototype.forEach.call(outline.querySelectorAll('.tree a'), function (a) {
      var num = a.querySelector('.tnum');
      var href = a.getAttribute('href');
      if (num) cases.push({ n: num.textContent.trim(), title: a.textContent.replace(num.textContent, '').trim(), href: href });
      else if (/index\.html$/.test(href)) pages.index = href;
      else if (/projects\.html$/.test(href)) pages.projects = href;
      else if (/resume\.html$/.test(href)) pages.resume = href;
      else if (/\.pdf$/.test(href)) pages.pdf = href;
      else if (/^mailto:/.test(href)) pages.mail = href;
      else if (/linkedin/.test(href)) pages.linkedin = href;
    });
  }
  var HELP = [
    ['ls', 'list the cases (projects)'],
    ['open <n>', 'open case 01–' + ('0' + cases.length).slice(-2) + ', or: index, projects, resume'],
    ['resume', 'open the resume PDF'],
    ['contact', 'email and LinkedIn'],
    ['run / stop', 'scroll through this page / stop'],
    ['init', 'back to the top'],
    ['theme', 'switch light and dark'],
    ['clear', 'empty the console']
  ];
  if (hero) HELP.splice(6, 0, ['mesh / lines / colour / contour / remesh', 'graphics window display']);

  function go(href) { log('Reading "' + href.replace(/^\//, '') + '"...'); window.location.href = href; }
  function exec(raw) {
    var a = raw.toLowerCase().replace(/["']/g, '').split(/[\s\/]+/).filter(Boolean);
    var verb = a[0], arg = a[a.length - 1];
    if (!verb) return;
    if (verb === 'file' || verb === 'solve' || verb === 'display') { verb = a[1] || ''; }
    switch (verb) {
      case 'help': case '?':
        HELP.forEach(function (h) { log('  ' + (h[0] + '                      ').slice(0, 23) + h[1]); });
        break;
      case 'ls': case 'list': case 'cases': case 'dir':
        cases.forEach(function (k) { log('  ' + k.n + '  ' + k.title, '', k.href); });
        break;
      case 'open': case 'cd': case 'read-case': case 'read': case 'cat':
        var hit = null;
        cases.forEach(function (k) { if (parseInt(k.n, 10) === parseInt(arg, 10)) hit = k.href; });
        arg = arg.replace(/\.(cas|html)$/, '');
        if (!hit && (arg === 'home' || arg === 'overview')) arg = 'index';
        if (!hit && pages[arg] && /^(index|projects|resume)$/.test(arg)) hit = pages[arg];
        if (hit) go(hit); else log('Error: no such case [' + arg + ']. Try ls.', 'c-err');
        break;
      case 'index': case 'home': case 'projects':
        if (pages[verb === 'home' ? 'index' : verb]) go(pages[verb === 'home' ? 'index' : verb]);
        break;
      case 'resume': case 'cv': case 'export':
        if (pages.pdf) { log('Writing "DulvinBandaraCV.pdf"...'); window.open(pages.pdf, '_blank', 'noopener'); }
        break;
      case 'contact': case 'email': case 'mail':
        if (pages.mail) log('  ' + pages.mail.replace('mailto:', ''), '', pages.mail);
        if (pages.linkedin) log('  LinkedIn', '', pages.linkedin);
        break;
      case 'whoami':
        log('  Dulvin Bandara. Aerodynamics and thermal CFD, Monash Motorsport.');
        break;
      case 'run': case 'iterate': case 'solve': startRun(); break;
      case 'stop': case 'interrupt': stopRun(); break;
      case 'init': case 'initialize': case 'top': initialize(); regenerate(); break;
      case 'theme': case 'dark': case 'light':
        var tt = document.querySelector('.themetoggle');
        if (tt && verb !== root.getAttribute('data-theme')) tt.click();
        log('  theme: ' + root.getAttribute('data-theme'));
        break;
      case 'mesh':
        if (hero) log('  mesh ' + (display('mesh') ? 'on' : 'off')); else log('Error: no graphics window on this page.', 'c-err');
        break;
      case 'lines': case 'streamlines':
        if (hero) log('  streamlines ' + (display('lines') ? 'on' : 'off')); else log('Error: no graphics window on this page.', 'c-err');
        break;
      case 'contour': case 'thermal':
        if (hero) log('  thermal contour ' + (display('contour') ? 'on' : 'off')); else log('Error: no graphics window on this page.', 'c-err');
        break;
      case 'colour': case 'color': case 'surface-colour':
        if (hero) log('  surface colour ' + (display('colour') ? 'on' : 'off')); else log('Error: no graphics window on this page.', 'c-err');
        break;
      case 'remesh': case 'generate': case 'regenerate':
        if (!regenerate()) log('Error: no graphics window on this page.', 'c-err');
        break;
      case 'clear': case 'cls': logEl.textContent = ''; break;
      case 'exit': case 'close': case 'quit': setConsole(false); break;
      default: log('Error: invalid command [' + raw + ']. Type help.', 'c-err');
    }
  }

  var history = [], at = 0;
  con.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = input.value.trim();
    if (!raw) return;
    input.value = '';
    history.push(raw); at = history.length;
    command(raw);
    exec(raw);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' && at > 0) { at--; input.value = history[at]; e.preventDefault(); }
    else if (e.key === 'ArrowDown' && at < history.length) { at++; input.value = history[at] || ''; e.preventDefault(); }
    else if (e.key === 'Escape') { setConsole(false); if (consoleBtn) consoleBtn.focus(); }
    e.stopPropagation();
  });

  try { if (sessionStorage.getItem('console') === '1') setConsole(true, false); } catch (e) { /* closed */ }
})();
