/* ============================================================
   Index hero: a head as a surface mesh, with streamlines.
   Loads models/head-flow.bin (built offline from an STL):
     header  "FLOW", nVerts, nTris, nLines, ptsPerLine, range
     Int16   vertex positions      Int8  vertex normals
     Uint16  triangle indices      Int16 streamline points
     Uint8   streamline speed      Uint8 wake weight
     Uint8   vertex colour, RGB (optional, from the scan's texture)
   Sequence: the cell edges sweep in from the crown down, as if
   the mesher were running; the scan's colour then drains down
   over the cells and the edges fall back to a faint overlay;
   then the streamlines grow from the inlet and keep advecting.
   Plain WebGL, no library. Without WebGL the canvas is hidden
   and the hero is just the wordmark. Under reduced motion one
   finished frame is drawn and nothing moves.
   ============================================================ */

(function () {
  var canvas = document.querySelector('.flowcanvas');
  if (!canvas) return;
  var hero = canvas.closest('.hero');
  var force2d = /[?&]flow=2d\b/.test(location.search);
  // ?flowt=2.5 holds the build at that many seconds, for checking a stage
  var held = (/[?&]flowt=([\d.]+)/.exec(location.search) || [])[1];
  held = held === undefined ? null : parseFloat(held);
  var gl = force2d ? null : canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  var ctx2d = null;      // set when WebGL is unavailable: a still frame on a 2D canvas
  var flat = null;       // the geometry the 2D renderer needs

  // WebGL can be missing, blocked, or lost mid-session. In each case the hero
  // falls back to one finished frame drawn with the 2D canvas API.
  function use2d() {
    if (ctx2d) return;
    var fresh = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    gl = null; scene = null; running = false;
    ctx2d = canvas.getContext('2d');
    if (!ctx2d) { canvas.hidden = true; return; }
    canvas.classList.add('is-ready', 'is-still');
    hero.classList.add('flow-still');
    readTheme(); resize();
  }
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); use2d(); });

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* velocity colour map, low to high: blue, cyan, green, yellow, red.
     The light theme takes slightly deeper stops so they hold on paper. */
  var RAMP = {
    light: ['#1230c8', '#0b78dc', '#0aa9a6', '#1fa83c', '#b3b80e', '#ee8a0a', '#d8201a'],
    dark:  ['#2748ff', '#1f9bff', '#17dcd4', '#3fe05a', '#d9ea2a', '#ffad1a', '#ff3a26']
  };

  function hex(h) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? hex(v) : hex(fallback);
  }

  /* ---------- shaders ---------- */

  var MESH_VS =
    'attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;' +
    'uniform mat4 uMVP; uniform mat3 uRot;' +
    'varying float vY; varying float vL; varying vec3 vC;' +
    'void main(){ vY = aPos.y; vC = aCol; vec3 n = normalize(uRot * aNrm);' +
    '  vL = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);' +
    '  gl_Position = uMVP * vec4(aPos, 1.0); }';

  // uMode 0: filled cell (hides the far side), tinted by the scan's colour.
  // uMode 1: cell edges.
  var MESH_FS =
    'precision mediump float;' +
    'uniform vec3 uGround; uniform vec3 uInk; uniform vec3 uHot;' +
    'uniform float uSweep; uniform float uMode; uniform float uShade; uniform float uTint; uniform float uTintSweep;' +
    'varying float vY; varying float vL; varying vec3 vC;' +
    'void main(){ if (vY < uSweep) discard;' +
    '  float front = 1.0 - smoothstep(0.0, 0.16, vY - uSweep);' +
    '  float inked = smoothstep(0.0, 0.45, vY - uTintSweep);' +      // 1 where the colour has arrived
    '  if (uMode < 0.5) { vec3 base = mix(uGround, uInk, uShade * (0.25 + 0.75 * vL));' +
    '    gl_FragColor = vec4(mix(base, vC * (0.40 + 0.60 * vL), uTint * inked), 1.0); }' +
    // edges: clear while the mesh builds, a faint overlay once the colour is in
    '  else { vec3 c = mix(uInk, uHot, front);' +
    '    float a = mix(0.30 + 0.26 * vL, 0.07 + 0.09 * vL, inked * step(0.01, uTint));' +
    '    gl_FragColor = vec4(c, mix(a, 1.0, front)); } }';

  /* A temperature field behind the head, drawn first as one full-canvas
     quad: a warm halo round the head and a plume carried downstream, cut
     into bands like a filled contour plot. Illustrative, like the flow. */
  var HEAT_VS = 'attribute vec2 aXY; varying vec2 vXY; void main(){ vXY = aXY; gl_Position = vec4(aXY, 0.0, 1.0); }';
  var HEAT_FS =
    'precision mediump float;' +
    'uniform vec3 uRamp[7]; uniform vec2 uC; uniform vec2 uDir; uniform float uR; uniform float uAspect;' +
    'uniform float uTime; uniform float uAlpha; uniform float uLo;' +
    'varying vec2 vXY;' +
    'vec3 ramp(float x){ x = clamp(x, 0.0, 1.0) * 6.0; int i = int(floor(x)); float f = fract(x);' +
    '  vec3 a = uRamp[0]; vec3 b = uRamp[1];' +
    '  if (i == 1) { a = uRamp[1]; b = uRamp[2]; } else if (i == 2) { a = uRamp[2]; b = uRamp[3]; }' +
    '  else if (i == 3) { a = uRamp[3]; b = uRamp[4]; } else if (i == 4) { a = uRamp[4]; b = uRamp[5]; }' +
    '  else if (i >= 5) { a = uRamp[5]; b = uRamp[6]; }' +
    '  return mix(a, b, f); }' +
    'void main(){' +
    '  vec2 p = (vXY - uC) * vec2(uAspect, 1.0) / uR;' +          // head radius = 1
    '  float al = dot(p, uDir); float ac = dot(p, vec2(-uDir.y, uDir.x));' +
    '  ac += 0.10 * sin(al * 1.6 - uTime * 0.5) * smoothstep(0.5, 3.0, al);' +   // the plume meanders slowly
    '  float halo = exp(-dot(p, p) / 1.9);' +
    '  float w = 0.85 + 0.22 * max(al, 0.0);' +
    '  float plume = smoothstep(-0.4, 0.8, al) * exp(-ac * ac / (w * w)) / (1.0 + 0.30 * max(al, 0.0));' +
    '  float T = max(halo, plume);' +
    '  float n = 9.0; float band = floor(T * n) / n; float e = fract(T * n);' +
    '  float edge = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.10, e));' +            // a darker line at each level
    '  float a = uAlpha * smoothstep(0.08, 0.30, T) * edge;' +
    '  gl_FragColor = vec4(ramp(uLo + (0.97 - uLo) * band), a); }';

  var LINE_VS =
    'attribute vec3 aPos; attribute vec3 aTan; attribute vec4 aInfo; attribute float aWake;' +   // info: t, speed, side, phase
    'uniform mat4 uMVP; uniform vec2 uPx; uniform float uWidth; uniform mediump float uTime;' +
    'varying float vT; varying float vS; varying float vPh; varying float vEdge;' +
    'void main(){ vec3 P = aPos;' +
    // the wake is unsteady: lines in it sway, more the further downstream
    '  float sw = aWake * smoothstep(0.0, 2.2, -aPos.z);' +
    '  float ph = aInfo.w * 6.283;' +
    '  P.x += sw * (0.11 * sin(uTime * 1.5 + ph + aPos.z * 2.3) + 0.06 * sin(uTime * 3.4 + ph * 2.3 + aPos.z * 5.6) + 0.03 * sin(uTime * 6.1 + ph * 3.1 + aPos.z * 11.0));' +
    '  P.y += sw * (0.11 * cos(uTime * 1.2 + ph * 1.7 + aPos.z * 2.0) + 0.06 * cos(uTime * 2.9 + ph * 2.9 + aPos.z * 6.3) + 0.03 * cos(uTime * 5.3 + ph * 1.3 + aPos.z * 12.0));' +
    '  vec4 p = uMVP * vec4(P, 1.0); vec4 q = uMVP * vec4(P + aTan * 0.02, 1.0);' +
    '  vec2 d = normalize((q.xy / q.w - p.xy / p.w) / uPx + vec2(1e-5));' +
    '  vec2 n = vec2(-d.y, d.x);' +
    '  p.xy += n * aInfo.z * uWidth * uPx * p.w;' +
    '  vT = aInfo.x; vS = aInfo.y; vPh = aInfo.w; vEdge = aInfo.z; gl_Position = p; }';

  var LINE_FS =
    'precision mediump float;' +
    'uniform vec3 uRamp[7]; uniform float uGrow; uniform float uTime; uniform float uAlpha;' +
    'varying float vT; varying float vS; varying float vPh; varying float vEdge;' +
    'vec3 ramp(float x){ x = clamp(x, 0.0, 1.0) * 6.0; int i = int(floor(x)); float f = fract(x);' +
    '  vec3 a = uRamp[0]; vec3 b = uRamp[1];' +
    '  if (i == 1) { a = uRamp[1]; b = uRamp[2]; } else if (i == 2) { a = uRamp[2]; b = uRamp[3]; }' +
    '  else if (i == 3) { a = uRamp[3]; b = uRamp[4]; } else if (i == 4) { a = uRamp[4]; b = uRamp[5]; }' +
    '  else if (i >= 5) { a = uRamp[5]; b = uRamp[6]; }' +
    '  return mix(a, b, f); }' +
    'void main(){' +
    '  float head = uGrow * 1.25 - vPh * 0.25;' +            // each line starts a little apart
    '  if (vT > head) discard;' +
    '  float tip = 1.0 - smoothstep(0.0, 0.06, head - vT);' +
    '  float pulse = fract(vT * 2.6 - uTime * (0.05 + 0.16 * vS) + vPh);' +   // faster where the flow is faster
    '  float glow = smoothstep(0.78, 1.0, pulse);' +
    '  float ends = smoothstep(0.0, 0.10, vT) * (1.0 - smoothstep(0.88, 1.0, vT));' +
    '  float soft = 1.0 - smoothstep(0.55, 1.0, abs(vEdge));' +                // crisp body, soft rim
    '  float lit = max(glow, tip * step(uGrow, 0.999));' +
    '  float a = (0.72 + 0.28 * lit) * ends * uAlpha * soft;' +
    '  gl_FragColor = vec4(mix(ramp(vS), vec3(1.0), 0.30 * lit), a); }';

  function program(vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function buffer(target, data) {
    var b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  /* ---------- matrices (column-major) ---------- */

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function rotYX(yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    // Rx(pitch) * Ry(yaw)
    return [cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1];
  }

  /* ---------- load ---------- */

  var scene = null;

  fetch(canvas.getAttribute('data-src'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(build)
    .catch(function () { canvas.hidden = true; });

  function build(ab) {
    var dv = new DataView(ab);
    var nV = dv.getUint32(4, true), nT = dv.getUint32(8, true);
    var nL = dv.getUint32(12, true), P = dv.getUint32(16, true);
    var range = dv.getFloat32(20, true);
    var o = 24;
    function take(Type, n) {
      var a = new Type(ab, o, n);
      o += Math.ceil(a.byteLength / 4) * 4;
      return a;
    }
    var qpos = take(Int16Array, nV * 3), qnrm = take(Int8Array, nV * 3);
    var idx = take(Uint16Array, nT * 3);
    var qline = take(Int16Array, nL * P * 3), qspd = take(Uint8Array, nL * P), qwake = take(Uint8Array, nL * P);
    var qcol = ab.byteLength >= o + nV * 3 ? take(Uint8Array, nV * 3) : null;

    var pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), i;
    for (i = 0; i < nV * 3; i++) { pos[i] = qpos[i] / 32767 * range; nrm[i] = qnrm[i] / 127; }

    // unique cell edges
    var seen = {}, edges = [];
    function edge(a, b) {
      var k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!seen[k]) { seen[k] = 1; edges.push(a, b); }
    }
    for (i = 0; i < nT * 3; i += 3) { edge(idx[i], idx[i + 1]); edge(idx[i + 1], idx[i + 2]); edge(idx[i + 2], idx[i]); }

    // streamlines as ribbons: two vertices per point, offset in the vertex shader
    var lp = new Float32Array(nL * P * 2 * 3), lt = new Float32Array(nL * P * 2 * 3);
    var li = new Float32Array(nL * P * 2 * 4), lw = new Float32Array(nL * P * 2), lidx = new Uint16Array(nL * (P - 1) * 6);
    var w = 0;
    for (var l = 0; l < nL; l++) {
      var phase = (l * 0.6180339887) % 1;
      for (var k = 0; k < P; k++) {
        var a = (l * P + k) * 3;
        var b = (l * P + Math.min(k + 1, P - 1)) * 3, c = (l * P + Math.max(k - 1, 0)) * 3;
        for (var s = 0; s < 2; s++) {
          var v = (l * P + k) * 2 + s;
          for (var j = 0; j < 3; j++) {
            lp[v * 3 + j] = qline[a + j] / 32767 * range;
            lt[v * 3 + j] = (qline[b + j] - qline[c + j]) / 32767 * range;
          }
          li[v * 4] = k / (P - 1);
          li[v * 4 + 1] = qspd[l * P + k] / 255;
          li[v * 4 + 2] = s ? 1 : -1;
          li[v * 4 + 3] = phase;
          lw[v] = qwake[l * P + k] / 255;
        }
        if (k < P - 1) {
          var v0 = (l * P + k) * 2;
          lidx[w++] = v0; lidx[w++] = v0 + 1; lidx[w++] = v0 + 2;
          lidx[w++] = v0 + 1; lidx[w++] = v0 + 3; lidx[w++] = v0 + 2;
        }
      }
    }

    flat = { pos: pos, idx: idx, nT: nT, line: qline, spd: qspd, nL: nL, P: P, range: range, col: qcol };
    if (!qcol) hero.classList.add('flow-nocolour');
    // the graphics window's title strip reports what was actually loaded
    var stats = hero.querySelector('.vp-stats');
    if (stats) {
      stats.textContent = 'Surface mesh · ' + nV.toLocaleString('en') + ' nodes · ' + nT.toLocaleString('en') +
        ' faces · ' + nL + ' streamlines';
    }
    if (!gl) { use2d(); return; }

    var mp, lpg, hp;
    try { mp = program(MESH_VS, MESH_FS); lpg = program(LINE_VS, LINE_FS); hp = program(HEAT_VS, HEAT_FS); }
    catch (e) { use2d(); return; }

    scene = {
      mesh: mp, line: lpg, heat: hp,
      quad: buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])),
      pos: buffer(gl.ARRAY_BUFFER, pos), nrm: buffer(gl.ARRAY_BUFFER, nrm),
      col: qcol ? buffer(gl.ARRAY_BUFFER, qcol) : null,
      tri: buffer(gl.ELEMENT_ARRAY_BUFFER, idx), nTri: nT * 3,
      edge: buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges)), nEdge: edges.length,
      lp: buffer(gl.ARRAY_BUFFER, lp), lt: buffer(gl.ARRAY_BUFFER, lt), li: buffer(gl.ARRAY_BUFFER, li), lw: buffer(gl.ARRAY_BUFFER, lw),
      lidx: buffer(gl.ELEMENT_ARRAY_BUFFER, lidx), nLine: lidx.length,
      top: 1.06, bottom: -1.06
    };
    readTheme();
    resize();
    start();
  }

  /* ---------- theme, size ---------- */

  var colors = {};
  function readTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    colors.ground = cssColor('--field', dark ? '#07080A' : '#F1EFEA');
    colors.ink = dark ? [1, 1, 1] : hex('#11151A');
    colors.hot = hex(dark ? '#fca50a' : '#c33b4f');
    colors.shade = dark ? 0.16 : 0.10;
    colors.alpha = dark ? 0.95 : 0.92;
    colors.tint = dark ? 0.92 : 0.88;      // how far the cells take the scan's colour
    // the thermal contour takes the site's inferno ramp, and stays faint
    var heat = [];
    [['--f-00', '#10092d'], ['--f-22', '#4a0c6b'], ['--f-38', '#8c2369'], ['--f-52', '#c33b4f'],
     ['--f-66', '#eb6628'], ['--f-80', '#fca50a'], ['--f-94', '#f2ea69']].forEach(function (c) {
      heat = heat.concat(cssColor(c[0], c[1]));
    });
    colors.heat = new Float32Array(heat);
    colors.heatAlpha = dark ? 0.34 : 0.18;
    colors.heatLo = dark ? 0.30 : 0.44;    // skip the ramp's near-black end, which reads as grey
    var r = RAMP[dark ? 'dark' : 'light'], flat = [];   // local: the ramp as one float list
    r.forEach(function (h) { flat = flat.concat(hex(h)); });
    colors.ramp = new Float32Array(flat);
    colors.dark = dark;
  }
  new MutationObserver(function () { readTheme(); if (!running) redraw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  var view = { w: 1, h: 1, cx: 0, cy: 0, scale: 1 };
  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    view.w = r.width; view.h = r.height; view.dpr = dpr;
    // the head sits in the clear band between the ribbon and the wordmark
    var mast = hero.querySelector('.masthead'), nav = document.querySelector('.sitenav');
    var top = nav ? Math.max(0, nav.getBoundingClientRect().bottom - r.top) : 0;
    var bottom = mast ? mast.getBoundingClientRect().top - r.top : r.height;
    var head = hero.querySelector('.vp-head'), leg = hero.querySelector('.vp-legend');
    if (head) top = Math.max(top, head.getBoundingClientRect().bottom - r.top);
    if (leg) {
      var lr = leg.getBoundingClientRect();
      if (lr.width > lr.height * 2) top = Math.max(top, lr.bottom - r.top);
    }
    if (bottom - top < 120) { top = 0; bottom = r.height * 0.7; }
    view.bandTop = top + 14; view.bandBottom = bottom - 6;
    // centre on the wordmark, which is narrower than the canvas on wide screens
    view.midX = mast ? (mast.getBoundingClientRect().left + mast.getBoundingClientRect().right) / 2 - r.left : r.width / 2;
    if (!running) redraw();
  }
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 100); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  window.addEventListener('load', resize);

  /* ---------- pointer: the head turns a little toward the cursor ---------- */

  var aim = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  if (!reduced && window.matchMedia('(hover:hover)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      aim.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      aim.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    hero.addEventListener('pointerleave', function () { aim.x = 0; aim.y = 0; });
  }

  /* ---------- draw ---------- */

  var clock = 0, last = 0, running = false, visible = true;

  // the tool row's Display buttons set these classes on the hero (shell.js)
  function shown(what) { return !hero.classList.contains('no-' + what); }

  function redraw() {
    if (ctx2d) draw2d(); else if (scene) draw();
  }

  // model-view-projection for time t, and the rotation alone (for lighting)
  function camera(t, still) {
    look.x += (aim.x - look.x) * 0.05; look.y += (aim.y - look.y) * 0.05;
    var yaw = still ? -0.62 : -0.62 + Math.sin(t * 0.21) * 0.20 + look.x * 0.22;
    var pitch = still ? 0.05 : 0.05 + Math.sin(t * 0.13) * 0.03 + look.y * 0.10;

    // fit the head (height about 2.1 units) to the clear band
    var fov = 0.42, dist = 9;
    var bandH = Math.max(80, view.bandBottom - view.bandTop);
    var unitPx = (view.h / 2) / (Math.tan(fov / 2) * dist);  // px per model unit at the origin
    var zoom = Math.min(bandH * 0.92 / 2.1, view.w * 0.9 / 2.2) / unitPx;
    var cy = (view.bandTop + view.bandBottom) / 2;
    var offY = (view.h / 2 - cy) / (view.h / 2);             // clip-space shift up to the band
    var offX = ((view.midX || view.w / 2) - view.w / 2) / (view.w / 2);

    var proj = perspective(fov, view.w / view.h, 1, 40);
    var model = rotYX(yaw, pitch);
    var mv = model.slice();
    for (var i = 0; i < 12; i++) mv[i] *= zoom;
    mv[14] = -dist;
    // shift after projection so perspective stays centred on the head
    var shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, offX, offY, 0, 1];
    // where the head sits on screen, its radius, and which way is downstream
    // (the model's -z axis as the camera sees it), for the thermal contour
    var dx = -model[8], dy = -model[9], dl = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      cx: offX, cy: offY, r: 1.05 * zoom * unitPx / (view.h / 2), dir: [dx / dl, dy / dl],
      mvp: mul(shift, mul(proj, mv)),
      rot: [model[0], model[1], model[2], model[4], model[5], model[6], model[8], model[9], model[10]],
      dist: dist
    };
  }

  /* ---------- 2D fallback: one finished frame, painter's algorithm ---------- */

  function draw2d() {
    var d = flat, c = ctx2d; if (!d || !c) return;
    var cam = camera(60, true), m = cam.mvp, W = view.w, H = view.h, i, j;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    function project(x, y, z, out, o) {
      var w = m[3] * x + m[7] * y + m[11] * z + m[15];
      out[o] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * W;
      out[o + 1] = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * H;
      out[o + 2] = w;                                  // distance from the eye
    }
    var nV = d.pos.length / 3, sp = new Float32Array(nV * 3);
    for (i = 0; i < nV; i++) project(d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2], sp, i * 3);

    var rgb = function (a) { return Math.round(a[0] * 255) + ',' + Math.round(a[1] * 255) + ',' + Math.round(a[2] * 255); };
    function rampAt(x) {
      x = Math.min(0.9999, Math.max(0, x)) * 6;
      var k = Math.floor(x), f = x - k, r = colors.ramp, o = [];
      for (var q = 0; q < 3; q++) o[q] = r[k * 3 + q] + (r[k * 3 + 3 + q] - r[k * 3 + q]) * f;
      return rgb(o);
    }

    // streamlines, split into the part behind the head and the part in front
    var lp = new Float32Array(d.nL * d.P * 3);
    for (i = 0; i < d.nL * d.P; i++) {
      project(d.line[i * 3] / 32767 * d.range, d.line[i * 3 + 1] / 32767 * d.range, d.line[i * 3 + 2] / 32767 * d.range, lp, i * 3);
    }
    function lines(front) {
      c.lineWidth = W < 620 ? 1.8 : 2.6;
      c.lineCap = 'round';
      for (var l = 0; l < d.nL; l++) {
        for (var k = 0; k < d.P - 1; k++) {
          var a = (l * d.P + k) * 3, b = a + 3;
          if (((lp[a + 2] + lp[b + 2]) / 2 < cam.dist) !== front) continue;
          var t = k / (d.P - 1), ends = Math.min(1, t / 0.1) * Math.min(1, (1 - t) / 0.12);
          c.strokeStyle = 'rgba(' + rampAt(d.spd[l * d.P + k] / 255) + ',' + (0.85 * ends * colors.alpha).toFixed(3) + ')';
          c.beginPath(); c.moveTo(lp[a], lp[a + 1]); c.lineTo(lp[b], lp[b + 1]); c.stroke();
        }
      }
    }

    if (shown('lines')) lines(false);

    // surface: far cells first, each filled with the ground colour so it hides what is behind it
    var order = new Uint32Array(d.nT), depth = new Float32Array(d.nT);
    for (i = 0; i < d.nT; i++) {
      order[i] = i;
      depth[i] = sp[d.idx[i * 3] * 3 + 2] + sp[d.idx[i * 3 + 1] * 3 + 2] + sp[d.idx[i * 3 + 2] * 3 + 2];
    }
    Array.prototype.sort.call(order, function (a, b) { return depth[b] - depth[a]; });
    c.fillStyle = 'rgb(' + rgb(colors.ground) + ')';
    var tinted = d.col && shown('colour');
    c.strokeStyle = 'rgba(' + rgb(colors.ink) + ',' + (tinted ? 0.16 : colors.dark ? 0.36 : 0.42) + ')';
    c.lineWidth = 0.6;
    c.lineJoin = 'round';
    for (j = 0; shown('mesh') && j < d.nT; j++) {
      i = order[j] * 3;
      var p0 = d.idx[i] * 3, p1 = d.idx[i + 1] * 3, p2 = d.idx[i + 2] * 3;
      if (tinted) {
        var q0 = d.idx[i] * 3, q1 = d.idx[i + 1] * 3, q2 = d.idx[i + 2] * 3;
        c.fillStyle = 'rgb(' + Math.round((d.col[q0] + d.col[q1] + d.col[q2]) / 3 * 0.8) + ',' +
          Math.round((d.col[q0 + 1] + d.col[q1 + 1] + d.col[q2 + 1]) / 3 * 0.8) + ',' +
          Math.round((d.col[q0 + 2] + d.col[q1 + 2] + d.col[q2 + 2]) / 3 * 0.8) + ')';
      }
      c.beginPath();
      c.moveTo(sp[p0], sp[p0 + 1]); c.lineTo(sp[p1], sp[p1 + 1]); c.lineTo(sp[p2], sp[p2 + 1]);
      c.closePath(); c.fill(); c.stroke();
    }

    if (shown('lines')) lines(true);
  }

  function draw() {
    var s = scene; if (!s) return;
    var t = held !== null ? held : reduced ? 60 : clock;

    var meshIn = Math.min(1, t / 2.2);                       // cell edges sweep in
    meshIn = 1 - Math.pow(1 - meshIn, 2);
    var tintIn = Math.min(1, Math.max(0, (t - 2.0) / 2.0));  // then the colour drains down
    tintIn = tintIn * tintIn * (3 - 2 * tintIn);
    var grow = Math.min(1, Math.max(0, (t - 3.4) / 3.2));    // then the streamlines
    var sweep = s.top + (s.bottom - 0.2 - s.top) * meshIn;

    var cam = camera(t, reduced), mvp = cam.mvp, rot = cam.rot;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    var u = function (p, n) { return gl.getUniformLocation(p, n); };

    /* thermal contour, behind everything; it comes in with the colour */
    if (tintIn > 0 && shown('contour')) {
      gl.useProgram(s.heat);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform3fv(u(s.heat, 'uRamp[0]'), colors.heat);
      gl.uniform2f(u(s.heat, 'uC'), cam.cx, cam.cy);
      gl.uniform2f(u(s.heat, 'uDir'), cam.dir[0], cam.dir[1]);
      gl.uniform1f(u(s.heat, 'uR'), cam.r);
      gl.uniform1f(u(s.heat, 'uAspect'), view.w / view.h);
      gl.uniform1f(u(s.heat, 'uTime'), t);
      gl.uniform1f(u(s.heat, 'uAlpha'), colors.heatAlpha * tintIn);
      gl.uniform1f(u(s.heat, 'uLo'), colors.heatLo);
      var hq = gl.getAttribLocation(s.heat, 'aXY');
      gl.bindBuffer(gl.ARRAY_BUFFER, s.quad); gl.enableVertexAttribArray(hq); gl.vertexAttribPointer(hq, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(hq);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    /* surface */
    gl.useProgram(s.mesh);
    gl.uniformMatrix4fv(u(s.mesh, 'uMVP'), false, new Float32Array(mvp));
    gl.uniformMatrix3fv(u(s.mesh, 'uRot'), false, new Float32Array(rot));
    gl.uniform3fv(u(s.mesh, 'uGround'), colors.ground);
    gl.uniform3fv(u(s.mesh, 'uInk'), colors.ink);
    gl.uniform3fv(u(s.mesh, 'uHot'), colors.hot);
    gl.uniform1f(u(s.mesh, 'uShade'), colors.shade);
    gl.uniform1f(u(s.mesh, 'uSweep'), sweep);
    gl.uniform1f(u(s.mesh, 'uTintSweep'), s.top + 0.1 + (s.bottom - 0.6 - s.top - 0.1) * tintIn);
    var aPos = gl.getAttribLocation(s.mesh, 'aPos'), aNrm = gl.getAttribLocation(s.mesh, 'aNrm');
    gl.bindBuffer(gl.ARRAY_BUFFER, s.pos); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.nrm); gl.enableVertexAttribArray(aNrm); gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    var aCol = gl.getAttribLocation(s.mesh, 'aCol'), tint = s.col && shown('colour');
    if (aCol >= 0) {
      if (s.col) { gl.bindBuffer(gl.ARRAY_BUFFER, s.col); gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.UNSIGNED_BYTE, true, 0, 0); }
      else { gl.disableVertexAttribArray(aCol); gl.vertexAttrib3f(aCol, 1, 1, 1); }
    }
    gl.uniform1f(u(s.mesh, 'uTint'), tint ? colors.tint : 0);

    var meshOn = shown('mesh');
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.uniform1f(u(s.mesh, 'uMode'), 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.tri);
    if (meshOn) gl.drawElements(gl.TRIANGLES, s.nTri, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(u(s.mesh, 'uMode'), 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.edge);
    if (meshOn) gl.drawElements(gl.LINES, s.nEdge, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(aNrm);
    if (aCol >= 0) gl.disableVertexAttribArray(aCol);

    /* streamlines */
    if (grow > 0 && shown('lines')) {
      gl.useProgram(s.line);
      gl.uniformMatrix4fv(u(s.line, 'uMVP'), false, new Float32Array(mvp));
      gl.uniform2f(u(s.line, 'uPx'), 2 / view.w, 2 / view.h);
      gl.uniform1f(u(s.line, 'uWidth'), view.w < 620 ? 1.4 : 1.9);
      gl.uniform3fv(u(s.line, 'uRamp[0]'), colors.ramp);
      gl.uniform1f(u(s.line, 'uGrow'), grow);
      gl.uniform1f(u(s.line, 'uTime'), t);
      gl.uniform1f(u(s.line, 'uAlpha'), colors.alpha);
      var lP = gl.getAttribLocation(s.line, 'aPos'), lT = gl.getAttribLocation(s.line, 'aTan'), lI = gl.getAttribLocation(s.line, 'aInfo');
      gl.bindBuffer(gl.ARRAY_BUFFER, s.lp); gl.enableVertexAttribArray(lP); gl.vertexAttribPointer(lP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.lt); gl.enableVertexAttribArray(lT); gl.vertexAttribPointer(lT, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, s.li); gl.enableVertexAttribArray(lI); gl.vertexAttribPointer(lI, 4, gl.FLOAT, false, 0, 0);
      var lW = gl.getAttribLocation(s.line, 'aWake');
      gl.bindBuffer(gl.ARRAY_BUFFER, s.lw); gl.enableVertexAttribArray(lW); gl.vertexAttribPointer(lW, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.lidx);
      gl.drawElements(gl.TRIANGLES, s.nLine, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(lT); gl.disableVertexAttribArray(lI); gl.disableVertexAttribArray(lW);
    }
    gl.depthMask(true);
  }

  // Some setups hand out a WebGL context that then draws nothing. Once the
  // mesh should be fully in, sample the middle of the head; if every pixel is
  // still empty, switch to the 2D frame.
  var checked = false;
  function blank() {
    var n = 48, px = new Uint8Array(n * n * 4);
    var x = Math.round((view.midX || view.w / 2) * view.dpr - n / 2);
    var y = Math.round(canvas.height - ((view.bandTop + view.bandBottom) / 2) * view.dpr - n / 2);
    gl.readPixels(Math.max(0, x), Math.max(0, y), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (var i = 3; i < px.length; i += 4) if (px[i]) return false;
    return true;
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(1, (now - last) / 1000 || 0);
    last = now;
    clock += dt;
    draw();
    if (!checked && clock > 4) { checked = true; if (blank()) { use2d(); return; } }
    requestAnimationFrame(frame);
  }
  function setRunning(on) {
    on = on && !!scene && !reduced && visible && !document.hidden && !hero.classList.contains('is-paused');
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); requestAnimationFrame(frame); }
  }
  function start() {
    canvas.classList.add('is-ready');
    draw();
    setRunning(true);
    // if animation frames are not being delivered (a throttled or background
    // tab), show the finished frame rather than an empty panel
    setTimeout(function () {
      if (scene && clock < 0.2) { clock = 8; draw(); }
    }, 2500);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; setRunning(true); }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { setRunning(true); });
  // the hero's pause button toggles .is-paused on the hero (theme.js)
  new MutationObserver(function () { setRunning(true); if (!running) redraw(); })
    .observe(hero, { attributes: true, attributeFilter: ['class'] });
  // "Regenerate" in the tool row: run the mesh sweep and streamline growth again
  hero.addEventListener('flow:replay', function () {
    if (!scene || reduced) return;
    clock = 0;
    if (!running) draw();
  });
})();
