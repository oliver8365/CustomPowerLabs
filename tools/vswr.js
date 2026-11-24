/* VSWR and return loss converter: VSWR, return loss, reflection coefficient,
   mismatch loss and the split of reflected and delivered power, plus the
   reflection coefficient of a complex load. The maths is at the top and loads
   under Node for testing; the page wiring below it runs only in a browser.

   Every quantity follows from the magnitude of the reflection coefficient |Γ|,
   using the definitions in Pozar, Microwave Engineering, 4th ed., section 2.3
   (return loss and standing wave ratio on a terminated lossless line). */
(function () {
  'use strict';

  const LN10 = Math.log(10);

  // The six quantities the converter links, keyed by their field names.
  //   vswr  = (1 + |Γ|) / (1 − |Γ|)                 1 to ∞
  //   rl    = −20·log10|Γ|  (dB, positive)          0 to ∞
  //   gamma = |Γ|                                   0 to 1
  //   ml    = −10·log10(1 − |Γ|²)  (dB, positive)   0 to ∞, assumes a matched source
  //   refl  = 100·|Γ|²  (% of incident power)       0 to 100
  //   trans = 100·(1 − |Γ|²)                        0 to 100
  // log1p and expm1 keep the mismatch loss accurate when |Γ| is tiny.
  function fromGamma(g) {
    if (!(g >= 0 && g <= 1)) return null;
    const g2 = g * g;
    return {
      gamma: g,
      vswr: g === 1 ? Infinity : (1 + g) / (1 - g),
      rl: g === 0 ? Infinity : g === 1 ? 0 : -20 * Math.log10(g),
      s11: g === 0 ? -Infinity : g === 1 ? 0 : 20 * Math.log10(g),
      ml: g === 1 ? Infinity : (-10 * Math.log1p(-g2)) / LN10,
      refl: 100 * g2,
      trans: 100 * (1 - g2),
    };
  }

  // |Γ| from any one quantity; NaN if the value is outside its physical range.
  // Infinity is accepted where the quantity can be infinite.
  function gammaFrom(key, x) {
    if (typeof x !== 'number' || Number.isNaN(x)) return NaN;
    switch (key) {
      case 'vswr': return x >= 1 ? (x === Infinity ? 1 : (x - 1) / (x + 1)) : NaN;
      case 'rl': return x >= 0 ? Math.pow(10, -x / 20) : NaN;
      case 'gamma': return x >= 0 && x <= 1 ? x : NaN;
      case 'ml': return x >= 0 ? (x === Infinity ? 1 : Math.sqrt(-Math.expm1((-x * LN10) / 10))) : NaN;
      case 'refl': return x >= 0 && x <= 100 ? Math.sqrt(x / 100) : NaN;
      case 'trans': return x >= 0 && x <= 100 ? Math.sqrt(1 - x / 100) : NaN;
      default: return NaN;
    }
  }

  // Reflection coefficient of a load R + jX on a line of real impedance z0:
  // Γ = (ZL − Z0) / (ZL + Z0). Pozar, equation 2.35. R must be at least zero
  // (a passive load), so |Γ| <= 1.
  function loadReflection(r, x, z0) {
    if (!(r >= 0) || !Number.isFinite(x) || !(z0 > 0)) return null;
    const nr = r - z0, dr = r + z0;
    const d = dr * dr + x * x;
    const re = (nr * dr + x * x) / d;
    const im = (x * dr - nr * x) / d;
    // Guard against rounding taking |Γ| a hair above 1 for a pure reactance.
    const mag = Math.min(1, Math.hypot(re, im));
    return Object.assign(fromGamma(mag), {
      re,
      im,
      angle: (Math.atan2(im, re) * 180) / Math.PI,
      // The resistances where the VSWR circle crosses the real axis.
      rmin: z0 * ((1 - mag) / (1 + mag)),
      rmax: mag === 1 ? Infinity : z0 * ((1 + mag) / (1 - mag)),
    });
  }

  // Mismatch uncertainty when neither end is matched: the delivered power
  // can differ from the mismatch-loss figure by up to 20·log10(1 ± |ΓS|·|ΓL|).
  function mismatchUncertainty(gs, gl) {
    const k = gs * gl;
    return { high: 20 * Math.log10(1 + k), low: 20 * Math.log10(1 - k) };
  }

  const KEYS = ['vswr', 'rl', 'gamma', 'ml', 'refl', 'trans'];
  const maths = { fromGamma, gammaFrom, loadReflection, mismatchUncertainty, KEYS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = maths; return; }

  /* Page ------------------------------------------------------------------- */

  const T = window.CPLTools;
  const conv = document.querySelector('[data-tool="vswr"]');
  const loadTool = document.querySelector('[data-tool="vswr-load"]');
  if (!T || !conv || !loadTool) return;

  const S = T.svg;
  const INF = '∞';
  const convForm = conv.querySelector('form');
  const loadForm = loadTool.querySelector('form');
  const out = (scope, key, text) => scope.querySelectorAll(`[data-out="${key}"]`).forEach((el) => { el.textContent = text; });

  // Accepts everything tools.js does, plus ∞, "inf" and "infinity".
  function parse(text) {
    const s = String(text).trim().toLowerCase();
    if (s === INF || s === 'inf' || s === 'infinity' || s === '+inf') return Infinity;
    return T.parse(s);
  }

  // How each quantity is written back into its field.
  function show(key, x) {
    if (x === Infinity) return INF;
    if (!Number.isFinite(x)) return T.DASH;
    switch (key) {
      case 'vswr': return x >= 1e4 ? x.toPrecision(3) : x < 10 ? x.toFixed(3) : x.toFixed(2);
      case 'rl': return x === 0 ? '0' : x >= 100 ? T.sig(x, 4) : x.toFixed(2);
      case 'gamma': return x === 0 || x === 1 ? String(x) : x < 0.001 ? T.sig(x, 3) : x.toFixed(4);
      case 'ml': return x === 0 ? '0' : x < 0.001 ? T.sig(x, 3) : x.toFixed(3);
      case 'refl': return x === 0 || x === 100 ? String(x) : x < 0.01 ? T.sig(x, 3) : x > 99.99 && x < 100 ? T.sig(x, 6) : T.sig(x, 4);
      case 'trans': return x === 100 ? '100' : x > 99.99 ? T.sig(x, 6) : x < 0.01 && x > 0 ? T.sig(x, 3) : T.sig(x, 4);
      default: return T.sig(x, 4);
    }
  }
  function db(x, dp = 2) { return x === Infinity ? INF : x === -Infinity ? `${T.MINUS}${INF}` : T.fixed(x, dp); }

  /* Smith chart with a VSWR circle ----------------------------------------- */

  const C0 = 150, RAD = 130;
  const px = (re, im) => [C0 + RAD * re, C0 - RAD * im];
  const gz = (r, x) => { // Γ of a normalised impedance
    const d = (r + 1) * (r + 1) + x * x;
    return [((r * r + x * x) - 1) / d, (2 * x) / d];
  };

  function smithGrid(svg) {
    svg.replaceChildren();
    svg.append(S('circle', { class: 'chart-axis', cx: C0, cy: C0, r: RAD, fill: 'none' }));
    svg.append(S('line', { class: 'chart-grid', x1: C0 - RAD, x2: C0 + RAD, y1: C0, y2: C0 }));
    for (const r of [0.2, 0.5, 1, 2, 5]) {
      svg.append(S('circle', { class: 'chart-grid', cx: C0 + RAD * (r / (1 + r)), cy: C0, r: RAD / (1 + r), fill: 'none' }));
      svg.append(S('text', { class: 'chart-text', x: C0 + RAD * ((r - 1) / (r + 1)) + 3, y: C0 + 13 }, String(r)));
    }
    for (const x of [0.2, 0.5, 1, 2, 5]) {
      for (const sgn of [1, -1]) {
        const line = [];
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          const [re, im] = gz((t / (1 - t + 1e-9)) * 0.25, sgn * x);
          line.push(px(re, im).map((n) => n.toFixed(1)).join(' '));
        }
        svg.append(S('path', { class: 'chart-grid', fill: 'none', d: `M${line.join('L')}` }));
      }
    }
  }

  function drawSmith(svg, g, point) {
    smithGrid(svg);
    if (!(g >= 0 && g <= 1)) return;
    if (g > 0) svg.append(S('circle', { class: 'vs-circle', cx: C0, cy: C0, r: RAD * g }));
    svg.append(S('circle', { class: 'vs-centre', cx: C0, cy: C0, r: 2.5 }));
    if (point) {
      const [x, y] = px(point.re, point.im);
      svg.append(S('line', { class: 'chart-soft', x1: C0, y1: C0, x2: x, y2: y }));
      svg.append(S('circle', { class: 'chart-dot', cx: x, cy: y, r: 6 }));
      const right = point.re < 0.35;
      svg.append(S('text', { class: 'chart-text-hi', x: x + (right ? 10 : -10), y: y + (point.im >= 0 ? -8 : 16), 'text-anchor': right ? 'start' : 'end' }, 'Load'));
    } else if (g > 0) {
      // Mark the two resistive points on the circle: R = Z0/VSWR and Z0·VSWR.
      for (const sgn of [-1, 1]) {
        const [x, y] = px(sgn * g, 0);
        svg.append(S('circle', { class: 'chart-dot', cx: x, cy: y, r: 4.5 }));
      }
    }
  }

  // Delivered and reflected power as a single bar.
  // Delivered and reflected power as a single bar, labelled in HTML so the
  // text stays readable at any width.
  function drawBar(svg, r) {
    svg.replaceChildren();
    svg.append(S('rect', { class: r ? 'vs-bar-refl' : 'vs-bar-none', x: 0, y: 0, width: 600, height: 12 }));
    out(conv, 'delivered', r ? `Delivered ${show('trans', r.trans)}%` : T.DASH);
    out(conv, 'reflected', r ? `Reflected ${show('refl', r.refl)}%` : '');
    if (!r) return;
    svg.append(S('rect', { class: 'vs-bar-trans', x: 0, y: 0, width: Math.max(0, Math.min(600, 6 * r.trans)), height: 12 }));
  }

  /* Section one: edit any one quantity ------------------------------------- */

  const DEFAULT_KEY = 'vswr';
  const fields = Object.fromEntries(KEYS.map((k) => [k, convForm.elements[k]]));
  const defaults = Object.fromEntries(KEYS.map((k) => [k, fields[k].value]));
  const convWarn = conv.querySelector('[data-warn]');
  const convSmith = conv.querySelector('[data-smith]');
  const bar = conv.querySelector('[data-bar]');
  const RANGE = {
    vswr: 'VSWR is 1 or more (use ∞ for total reflection).',
    rl: 'Return loss is 0 dB or more, written as a positive number. S11 in dB is the negative of it.',
    gamma: '|Γ| is between 0 and 1 for a passive load.',
    ml: 'Mismatch loss is 0 dB or more.',
    refl: 'Reflected power is between 0 and 100%.',
    trans: 'Delivered power is between 0 and 100%.',
  };
  let source = DEFAULT_KEY;

  function convert(key) {
    source = key;
    const g = gammaFrom(key, parse(fields[key].value));
    const r = fromGamma(g);
    KEYS.forEach((k) => fields[k].removeAttribute('aria-invalid'));
    if (!r) {
      fields[key].setAttribute('aria-invalid', 'true');
      convWarn.textContent = `Check this value. ${RANGE[key]}`;
      convWarn.hidden = false;
      ['s11', 'rmin', 'rmax', 'summary'].forEach((k) => out(conv, k, k === 'summary' ? '' : T.DASH));
      drawSmith(convSmith, NaN);
      drawBar(bar, null);
      return;
    }
    convWarn.hidden = true;
    for (const k of KEYS) if (k !== key) fields[k].value = show(k, r[k]);
    out(conv, 's11', db(r.s11));
    const z0 = 50;
    out(conv, 'rmin', T.si(z0 * (1 - g) / (1 + g), 'Ω', 3));
    out(conv, 'rmax', g === 1 ? INF : T.si(z0 * (1 + g) / (1 - g), 'Ω', 3));
    out(conv, 'summary', g === 0
      ? 'A perfect match: nothing is reflected and the return loss is infinite.'
      : g === 1
        ? 'Total reflection: an open, a short or a pure reactance. No power reaches the load.'
        : `${T.sig(r.refl, 3)}% of the incident power is reflected, so the load receives ${r.ml < 0.001 ? T.sig(r.ml, 2) : T.fixed(r.ml, 3)} dB less than it would with a perfect match.`);
    drawSmith(convSmith, g, null);
    drawBar(bar, r);
  }

  /* Section two: a complex load ------------------------------------------- */

  const loadDefaults = T.snapshot(loadForm);
  const loadWarn = loadTool.querySelector('[data-warn]');
  const loadSmith = loadTool.querySelector('[data-smith]');
  const LOAD_OUT = ['vswr', 'gamma', 'angle', 'rl', 's11', 'ml', 'refl', 'z'];

  function updateLoad() {
    const v = T.read(loadForm);
    const r = v.ok ? loadReflection(v.r, v.x, v.z0) : null;
    if (!r) {
      LOAD_OUT.forEach((k) => out(loadTool, k, T.DASH));
      loadWarn.textContent = 'Check the highlighted values. R must be zero or more and Z0 above zero.';
      loadWarn.hidden = false;
      drawSmith(loadSmith, NaN);
      return;
    }
    loadWarn.hidden = true;
    out(loadTool, 'vswr', show('vswr', r.vswr));
    out(loadTool, 'gamma', show('gamma', r.gamma));
    out(loadTool, 'angle', r.gamma === 0 ? T.DASH : `${T.fixed(r.angle, 1)}°`);
    out(loadTool, 'rl', db(r.rl));
    out(loadTool, 's11', db(r.s11));
    out(loadTool, 'ml', db(r.ml, 3));
    out(loadTool, 'refl', show('refl', r.refl));
    const zn = [v.r / v.z0, v.x / v.z0];
    out(loadTool, 'z', `${T.sig(zn[0], 3)} ${zn[1] < 0 ? T.MINUS : '+'} j${T.sig(Math.abs(zn[1]), 3)}`);
    drawSmith(loadSmith, r.gamma, r);
  }

  /* Address bar: the field edited last in section one, and any changed load values */

  let timer = 0;
  function query() {
    const q = new URLSearchParams();
    const val = fields[source].value;
    if (!(source === DEFAULT_KEY && val === defaults[DEFAULT_KEY])) q.set(source, val);
    const now = T.snapshot(loadForm);
    for (const [k, val2] of Object.entries(now)) if (val2 !== loadDefaults[k]) q.set(k, val2);
    return q.toString();
  }
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const qs = query();
      history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }, 300);
  }

  const params = new URLSearchParams(window.location.search);
  const start = KEYS.find((k) => params.has(k));
  if (start) fields[start].value = params.get(start).slice(0, 40);
  const fromUrl = {};
  params.forEach((val, k) => { if (k in loadDefaults) fromUrl[k] = val.slice(0, 40); });
  T.apply(loadForm, fromUrl);

  convForm.addEventListener('input', (e) => {
    if (KEYS.includes(e.target.name)) { convert(e.target.name); save(); }
  });
  convForm.addEventListener('submit', (e) => e.preventDefault());
  loadForm.addEventListener('input', () => { updateLoad(); save(); });
  loadForm.addEventListener('change', () => { updateLoad(); save(); });
  loadForm.addEventListener('submit', (e) => e.preventDefault());

  conv.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    fields.vswr.value = b.dataset.preset;
    convert('vswr');
    save();
  }));
  conv.querySelector('[data-tool-reset]').addEventListener('click', () => {
    fields[DEFAULT_KEY].value = defaults[DEFAULT_KEY];
    convert(DEFAULT_KEY);
    save();
  });
  loadTool.querySelector('[data-tool-reset]').addEventListener('click', () => {
    T.apply(loadForm, loadDefaults);
    updateLoad();
    save();
  });
  document.querySelectorAll('[data-vswr-share]').forEach((button) => {
    const label = button.textContent;
    button.addEventListener('click', async () => {
      const qs = query();
      const url = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
      try {
        await navigator.clipboard.writeText(url);
        button.textContent = 'Link copied';
      } catch {
        window.prompt('Copy this link:', url);
      }
      setTimeout(() => { button.textContent = label; }, 2200);
    });
  });

  convert(start || DEFAULT_KEY);
  updateLoad();
})();
