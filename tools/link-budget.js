/* RF link budget: free-space path loss (Friis), link margin and range.
   The maths is at the top and loads under Node for testing; the page wiring
   below it runs only in a browser. */
(function () {
  'use strict';

  const C = 299792458; // speed of light, m/s

  // Free-space path loss in dB between isotropic antennas (ITU-R P.525).
  function fspl(fHz, dM) {
    return 20 * Math.log10((4 * Math.PI * dM * fHz) / C);
  }

  // The distance at which free-space loss reaches lossDb.
  function distanceForLoss(fHz, lossDb) {
    return (C / (4 * Math.PI * fHz)) * Math.pow(10, lossDb / 20);
  }

  // Radius of the first Fresnel zone at a point d1 from one end and d2 from the other.
  function fresnel(fHz, d1, d2) {
    return Math.sqrt(((C / fHz) * d1 * d2) / (d1 + d2));
  }

  // p: { f (Hz), d (m), ptx (dBm), gtx, grx (dBi), ltx, lrx, lother (dB), sens (dBm), fade (dB) }
  function budget(p) {
    const eirp = p.ptx - p.ltx + p.gtx;
    const path = fspl(p.f, p.d);
    const prx = eirp - path - p.lother + p.grx - p.lrx;
    const margin = prx - p.sens;
    // The most path loss the link can take and still keep the fade margin.
    const allowed = eirp - p.lother + p.grx - p.lrx - p.sens - p.fade;
    return {
      eirp,
      path,
      prx,
      margin,
      spare: margin - p.fade,
      range: distanceForLoss(p.f, allowed),
      rangeZero: distanceForLoss(p.f, allowed + p.fade),
      lambda: C / p.f,
      fresnel: fresnel(p.f, p.d / 2, p.d / 2),
    };
  }

  const maths = { C, fspl, distanceForLoss, fresnel, budget };
  if (typeof module !== 'undefined' && module.exports) { module.exports = maths; return; }

  /* Page ------------------------------------------------------------------- */

  const T = window.CPLTools;
  const tool = document.querySelector('[data-tool="link-budget"]');
  if (!T || !tool) return;

  const chart = tool.querySelector('[data-chart]');

  // Typical figures, for a starting point only: see the notes below the tool.
  const PRESETS = {
    lora: { f: '868', f_u: '1e6', ptx: '14', gtx: '2.15', grx: '2.15', ltx: '0.5', lrx: '0.5', sens: '-137', fade: '15', d: '5', d_u: '1e3', lother: '0' },
    ble: { f: '2440', f_u: '1e6', ptx: '0', gtx: '0', grx: '0', ltx: '0', lrx: '0', sens: '-95', fade: '15', d: '30', d_u: '1', lother: '0' },
    wifi: { f: '2440', f_u: '1e6', ptx: '18', gtx: '2', grx: '2', ltx: '1', lrx: '1', sens: '-90', fade: '15', d: '100', d_u: '1', lother: '0' },
  };

  function distance(m) {
    if (!Number.isFinite(m)) return T.DASH;
    if (m >= 1e3) return `${T.sig(m / 1e3, 3)} km`;
    if (m >= 1) return `${T.sig(m, 3)} m`;
    return `${T.sig(m * 100, 3)} cm`;
  }

  function length(m) {
    if (!Number.isFinite(m)) return T.DASH;
    if (m >= 1) return `${T.sig(m, 3)} m`;
    if (m >= 0.01) return `${T.sig(m * 100, 3)} cm`;
    return `${T.sig(m * 1000, 3)} mm`;
  }

  function draw(p, r) {
    const W = 640, H = 280, L = 54, R = 16, TOP = 26, B = 34;
    chart.replaceChildren();
    if (!r) return;

    // Distance axis: a decade either side of the interesting points.
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(p.d, r.range)) - 1));
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(p.d, r.rangeZero) * 1.5)));
    const x = (d) => L + ((Math.log10(d) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - L - R);
    const prxAt = (d) => r.prx - (fspl(p.f, d) - r.path);

    const yTop = Math.ceil((prxAt(lo) + 5) / 10) * 10;
    const yBot = Math.floor((Math.min(prxAt(hi), p.sens) - 5) / 10) * 10;
    const y = (dbm) => TOP + ((yTop - dbm) / (yTop - yBot)) * (H - TOP - B);

    const step = (yTop - yBot) > 120 ? 20 : 10;
    for (let v = yBot; v <= yTop; v += step) {
      chart.append(T.svg('line', { class: 'chart-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      chart.append(T.svg('text', { class: 'chart-text', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, T.fixed(v, 0)));
    }
    for (let d = lo; d <= hi * 1.001; d *= 10) {
      chart.append(T.svg('line', { class: 'chart-grid', x1: x(d), x2: x(d), y1: TOP, y2: H - B }));
      chart.append(T.svg('text', { class: 'chart-text', x: x(d), y: H - B + 18, 'text-anchor': 'middle' }, distance(d).replace(' ', ' ')));
    }
    chart.append(T.svg("text", { class: "chart-text", x: L - 8, y: 10, "text-anchor": "end" }, "dBm"));

    // Sensitivity, and sensitivity plus the fade margin.
    chart.append(T.svg('line', { class: 'chart-limit', x1: L, x2: W - R, y1: y(p.sens), y2: y(p.sens) }));
    chart.append(T.svg('text', { class: 'chart-text', x: W - R - 4, y: y(p.sens) + 14, 'text-anchor': 'end' }, 'Sensitivity'));
    if (p.fade > 0) {
      chart.append(T.svg('line', { class: 'chart-soft', x1: L, x2: W - R, y1: y(p.sens + p.fade), y2: y(p.sens + p.fade) }));
      chart.append(T.svg('text', { class: 'chart-text', x: W - R - 4, y: y(p.sens + p.fade) - 6, 'text-anchor': 'end' }, 'With fade margin'));
    }

    // Received power falls 20 dB per decade of distance in free space.
    chart.append(T.svg('path', { class: 'chart-line', d: `M${x(lo)} ${y(prxAt(lo))}L${x(hi)} ${y(prxAt(hi))}` }));

    // Range that keeps the fade margin.
    if (r.range > lo && r.range < hi) {
      chart.append(T.svg('line', { class: 'chart-soft', x1: x(r.range), x2: x(r.range), y1: y(p.sens + p.fade), y2: H - B }));
    }

    chart.append(T.svg('circle', { class: 'chart-dot', cx: x(p.d), cy: y(r.prx), r: 6 }));
    const right = x(p.d) > W - 160;
    chart.append(T.svg('text', { class: 'chart-text-hi', x: x(p.d) + (right ? -12 : 12), y: y(r.prx) - 10, 'text-anchor': right ? 'end' : 'start' },
      `${T.fixed(r.prx, 1)} dBm at ${distance(p.d).replace(' ', ' ')}`));
  }

  T.mount(tool, (v, ui) => {
    const keys = ['eirp', 'path', 'prx', 'margin', 'range', 'rangeZero', 'lambda', 'fresnel'];
    if (!v.ok) {
      keys.forEach((k) => ui.out(k, T.DASH));
      ui.out('verdict', 'Check the highlighted values.');
      ui.state('margin', null);
      draw(v, null);
      return;
    }

    const r = budget(v);
    ui.out('margin', T.fixed(r.margin, 1));
    ui.state('margin', r.spare >= 0);
    ui.out('verdict', r.margin < 0
      ? `Below sensitivity by ${T.fixed(-r.margin, 1)} dB. The link will not close in free space.`
      : r.spare < 0
        ? `The link closes, but ${T.fixed(-r.spare, 1)} dB short of your ${T.fixed(v.fade, 0)} dB fade margin.`
        : `Closes with ${T.fixed(r.spare, 1)} dB to spare beyond your ${T.fixed(v.fade, 0)} dB fade margin.`);
    ui.out('eirp', T.fixed(r.eirp, 1));
    ui.out('path', T.fixed(r.path, 1));
    ui.out('prx', T.fixed(r.prx, 1));
    ui.out('range', distance(r.range));
    ui.out('rangeZero', distance(r.rangeZero));
    ui.out('lambda', length(r.lambda));
    ui.out('fresnel', length(r.fresnel));
    ui.out('fresnel60', length(r.fresnel * 0.6));
    draw(v, r);
  });

  tool.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const preset = PRESETS[button.dataset.preset];
    if (!preset) return;
    const form = tool.querySelector('form');
    T.apply(form, preset);
    form.dispatchEvent(new Event('change'));
  }));
})();
