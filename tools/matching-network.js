/* Impedance matching network designer: L, Pi and T networks of ideal
   inductors and capacitors between a source and a load, either of which may
   be complex. The maths is at the top and loads under Node for testing; the
   page wiring below it runs only in a browser.

   Convention: a network is matched when the impedance looking into it from
   the source, with the load connected, is the complex conjugate of the source
   impedance. That is the condition for maximum power transfer. */
(function () {
  'use strict';

  /* Complex numbers, as { re, im } ---------------------------------------- */

  const cx = (re, im = 0) => ({ re, im });
  const add = (a, b) => cx(a.re + b.re, a.im + b.im);
  const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
  const conj = (a) => cx(a.re, -a.im);
  const abs = (a) => Math.hypot(a.re, a.im);
  function div(a, b) {
    const d = b.re * b.re + b.im * b.im;
    return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  }
  const inv = (a) => div(cx(1), a);

  /* L sections ------------------------------------------------------------- */

  // Both L-section solvers follow the analytic method of Pozar, Microwave
  // Engineering, 4th ed., section 5.1 (equations 5.3 and 5.6), generalised
  // from a real Z0 to any complex target impedance zt. Each returns up to two
  // solutions; the pair differ in the sign of the square root.

  // Shunt susceptance B straight across the load, then a series reactance X
  // towards the source. Re{1/(YL + jB)} = Rt fixes B; X then cancels what is
  // left of the reactance. Needs GL·Rt <= 1. q is the Q of the shunt node,
  // including the load's own susceptance: q = sqrt(1/(GL·Rt) − 1).
  function shuntAtLoad(zl, zt) {
    const yl = inv(zl);
    const g = yl.re;
    const k = g * zt.re;
    if (!(g > 0) || k > 1 + 1e-9) return [];
    const s = g * Math.sqrt(Math.max(0, 1 / k - 1));
    return (s === 0 ? [0] : [s, -s]).map((bp) => ({
      shunt: bp - yl.im,
      series: zt.im + bp / (g * g + bp * bp),
      q: Math.abs(bp) / g,
    }));
  }

  // Series reactance X next to the load, then a shunt susceptance B on the
  // source side. Re{1/(ZL + jX)} = Gt fixes X; B then cancels the remaining
  // susceptance. Needs RL·Gt <= 1. q = |XL + X| / RL = sqrt(1/(RL·Gt) − 1).
  function seriesAtLoad(zl, zt) {
    const yt = inv(zt);
    const r = zl.re;
    const k = r * yt.re;
    if (!(r > 0) || k > 1 + 1e-9) return [];
    const s = r * Math.sqrt(Math.max(0, 1 / k - 1));
    return (s === 0 ? [0] : [s, -s]).map((xp) => ({
      series: xp - zl.im,
      shunt: yt.im + xp / (r * r + xp * xp),
      q: Math.abs(xp) / r,
    }));
  }

  /* Networks --------------------------------------------------------------- */

  // A network is a list of elements in order from the load to the source:
  // { place: 'series', x: reactance in ohms } or { place: 'shunt', b: susceptance in siemens }.

  // Impedance looking into the network from the source side, with zl on the far end.
  function inputImpedance(elements, zl) {
    let z = zl;
    for (const e of elements) {
      if (e.place === 'series') z = add(z, cx(0, e.x));
      else z = inv(add(inv(z), cx(0, e.b)));
    }
    return z;
  }

  // Every L-network solution: shunt element at the load, or series element at the load.
  function lNetworks(zs, zl) {
    const zt = conj(zs);
    const out = [];
    for (const s of shuntAtLoad(zl, zt)) {
      out.push({ shape: 'L', q: s.q, elements: [{ place: 'shunt', b: s.shunt }, { place: 'series', x: s.series }] });
    }
    for (const s of seriesAtLoad(zl, zt)) {
      out.push({ shape: 'L', q: s.q, elements: [{ place: 'series', x: s.series }, { place: 'shunt', b: s.shunt }] });
    }
    return out;
  }

  // Lowest loaded Q a Pi or T network can have between these impedances.
  // A Pi network is two L sections back to back through a virtual resistance
  // Rv lower than both ends, so it works with the parallel-equivalent
  // resistances Rp = 1/Re{1/Z}; a T network uses an Rv higher than both ends
  // and works with the series resistances. With Bowick's definition of the
  // loaded Q (the Q of the higher-Q section: Q = sqrt(R_high / Rv − 1) for a
  // Pi, Q = sqrt(Rv / R_low − 1) for a T), the minimum comes when Rv equals
  // the nearer end and one shunt (Pi) or series (T) element vanishes:
  // Qmin = sqrt(R_high / R_low − 1). Bowick, RF Circuit Design, chapter 4.
  function ends(shape, zs, zl) {
    if (shape === 'pi') return [1 / inv(zs).re, 1 / inv(zl).re];
    return [zs.re, zl.re];
  }
  function minQ(shape, zs, zl) {
    const [a, b] = ends(shape, zs, zl);
    return Math.sqrt(Math.max(a, b) / Math.min(a, b) - 1);
  }

  // Pi: shunt, series, shunt. T: series, shunt, series. Up to four solutions,
  // from the two sign choices in each L section. Returns [] when q < minQ.
  function threeElement(shape, zs, zl, q) {
    const [a, b] = ends(shape, zs, zl);
    const qmin = Math.sqrt(Math.max(a, b) / Math.min(a, b) - 1);
    if (!(q >= qmin * (1 - 1e-9))) return [];
    const zt = conj(zs);
    const out = [];
    if (shape === 'pi') {
      const rv = cx(Math.max(a, b) / (1 + q * q));
      for (const l of shuntAtLoad(zl, rv)) {
        for (const s of seriesAtLoad(rv, zt)) {
          out.push({ shape, q: Math.max(l.q, s.q), elements: [{ place: 'shunt', b: l.shunt }, { place: 'series', x: l.series + s.series }, { place: 'shunt', b: s.shunt }] });
        }
      }
    } else {
      const rv = cx(Math.min(a, b) * (1 + q * q));
      for (const l of seriesAtLoad(zl, rv)) {
        for (const s of shuntAtLoad(rv, zt)) {
          out.push({ shape, q: Math.max(l.q, s.q), elements: [{ place: 'series', x: l.series }, { place: 'shunt', b: l.shunt + s.shunt }, { place: 'series', x: s.series }] });
        }
      }
    }
    return out;
  }

  // An element too small to matter relative to the terminations becomes a
  // plain wire (series) or nothing at all (shunt).
  function tidy(network, scale) {
    const elements = network.elements.map((e) => {
      const zero = e.place === 'series' ? Math.abs(e.x) < 1e-9 * scale : Math.abs(e.b) * scale < 1e-9;
      return zero ? Object.assign({}, e, e.place === 'series' ? { x: 0 } : { b: 0 }) : e;
    });
    return Object.assign({}, network, { elements });
  }

  // Two solutions are the same if every element agrees closely.
  function same(a, b, scale) {
    if (a.elements.length !== b.elements.length) return false;
    const live = (n) => n.elements.filter((e) => (e.place === 'series' ? e.x : e.b) !== 0);
    const la = live(a), lb = live(b);
    if (la.length !== lb.length) return false;
    return la.every((e, i) => e.place === lb[i].place
      && (e.place === 'series' ? Math.abs(e.x - lb[i].x) < 1e-7 * scale : Math.abs(e.b - lb[i].b) * scale < 1e-7));
  }

  // Ideal component for an element at angular frequency w: a positive
  // reactance or a negative susceptance is an inductor, otherwise a capacitor.
  function component(e, w) {
    if (e.place === 'series') {
      if (e.x === 0) return null;
      return e.x > 0 ? { type: 'L', value: e.x / w } : { type: 'C', value: -1 / (w * e.x) };
    }
    if (e.b === 0) return null;
    return e.b > 0 ? { type: 'C', value: e.b / w } : { type: 'L', value: -1 / (w * e.b) };
  }

  // Elements from components, at any frequency: the network as built.
  function atFrequency(parts, f) {
    const w = 2 * Math.PI * f;
    return parts.map((p) => {
      if (!p.part) return p.place === 'series' ? { place: 'series', x: 0 } : { place: 'shunt', b: 0 };
      const x = p.part.type === 'L' ? w * p.part.value : -1 / (w * p.part.value);
      return p.place === 'series' ? { place: 'series', x } : { place: 'shunt', b: -1 / x };
    });
  }

  // Power-wave reflection coefficient at the source (Kurokawa, 1965):
  // Γ = (Zin − Zs*) / (Zin + Zs). It is zero at a conjugate match, and
  // 1 − |Γ|² is the fraction of the available power that reaches the load.
  function reflection(zin, zs) {
    return div(sub(zin, conj(zs)), add(zin, zs));
  }

  function returnLoss(zin, zs) {
    return -20 * Math.log10(abs(reflection(zin, zs)));
  }

  // A termination at another frequency, treating its reactance at f0 as a
  // fixed series inductor (X > 0) or capacitor (X < 0). An assumption: a real
  // antenna or amplifier will not behave like this far from f0.
  function scaleTermination(z, f0, f) {
    return cx(z.re, z.im > 0 ? z.im * (f / f0) : z.im * (f0 / f));
  }

  // Power delivered to the load as a fraction of the power available from
  // the source, at frequency f, with ideal components.
  function transferAt(parts, zs, zl, f0, f) {
    const s = scaleTermination(zs, f0, f);
    const zin = inputImpedance(atFrequency(parts, f), scaleTermination(zl, f0, f));
    const g = abs(reflection(zin, s));
    return 1 - g * g;
  }

  // Half-power (3 dB) edges, found by stepping out from f0 in 0.5% steps and
  // bisecting the crossing. An edge not found within a decade either side is NaN.
  function bandwidth(parts, zs, zl, f0) {
    const edge = (dir) => {
      let prev = f0;
      for (let i = 1; i < 480; i++) {
        const f = f0 * Math.pow(1.005, dir * i);
        if (transferAt(parts, zs, zl, f0, f) < 0.5) {
          let lo = prev, hi = f;
          for (let k = 0; k < 60; k++) {
            const mid = Math.sqrt(lo * hi);
            if (transferAt(parts, zs, zl, f0, mid) < 0.5) hi = mid; else lo = mid;
          }
          return Math.sqrt(lo * hi);
        }
        prev = f;
      }
      return NaN;
    };
    const lower = edge(-1), upper = edge(1);
    return { lower, upper, bw: upper - lower };
  }

  // Names a solution from its parts (listed source to load): low-pass if
  // every series part is an inductor and every shunt part a capacitor,
  // high-pass for the reverse.
  function describe(parts) {
    const live = parts.filter((p) => p.part);
    if (!live.length) return 'No network needed';
    if (live.length === 1) return `Single ${live[0].place} ${live[0].part.type === 'L' ? 'inductor' : 'capacitor'}`;
    const low = live.every((p) => (p.place === 'series') === (p.part.type === 'L'));
    const high = live.every((p) => (p.place === 'series') === (p.part.type === 'C'));
    return low ? 'Low-pass' : high ? 'High-pass' : 'Mixed';
  }

  // The whole design. p: { f (Hz), zs, zl ({re, im} in ohms), shape: 'L' | 'pi' | 't', q }.
  function design(p) {
    const scale = Math.max(abs(p.zs), abs(p.zl));
    const w = 2 * Math.PI * p.f;
    const qmin = p.shape === 'L' ? NaN : minQ(p.shape, p.zs, p.zl);
    const raw = p.shape === 'L' ? lNetworks(p.zs, p.zl) : threeElement(p.shape, p.zs, p.zl, p.q);

    const solutions = [];
    for (const n of raw.map((r) => tidy(r, scale))) {
      if (solutions.some((s) => same(s, n, scale))) continue;
      // Parts listed from source to load, as they are drawn.
      const parts = n.elements.slice().reverse().map((e) => ({ place: e.place, part: component(e, w) }));
      const e24 = parts.map((pt) => ({ place: pt.place, part: pt.part && { type: pt.part.type, value: nearestE24(pt.part.value) } }));
      const zinE24 = inputImpedance(atFrequency(e24, p.f).reverse(), p.zl);
      solutions.push(Object.assign(n, {
        name: describe(parts),
        parts,
        e24,
        zin: inputImpedance(n.elements, p.zl),
        zinE24,
        rlE24: returnLoss(zinE24, p.zs),
        band: parts.some((pt) => pt.part) ? bandwidth(parts.slice().reverse(), p.zs, p.zl, p.f) : { lower: NaN, upper: NaN, bw: NaN },
      }));
    }
    // A network with nothing in it is the only answer worth giving.
    const none = solutions.find((s) => s.parts.every((pt) => !pt.part));
    // Low-pass first, then high-pass, then the rest, keeping their order otherwise.
    const rank = (s) => ['Low-pass', 'High-pass'].indexOf(s.name) + 1 || 3;
    solutions.sort((a, b) => rank(a) - rank(b));
    return { qmin, solutions: none ? [none] : solutions };
  }

  // Nearest E24 value (as tools.js), repeated here so the maths runs under Node alone.
  const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  function nearestE24(x) {
    if (!(x > 0) || !Number.isFinite(x)) return NaN;
    const decade = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / decade;
    let best = 1, err = Infinity;
    for (const c of E24.concat([10])) {
      const e = Math.abs(Math.log(m / c));
      if (e < err) { err = e; best = c; }
    }
    return best * decade;
  }

  // Reflection coefficient of z normalised to a real z0, for the Smith chart.
  function gamma(z, z0) {
    return div(sub(z, cx(z0)), add(z, cx(z0)));
  }

  const maths = {
    cx, add, sub, div, inv, conj, abs,
    shuntAtLoad, seriesAtLoad, inputImpedance, lNetworks, minQ, threeElement,
    component, atFrequency, reflection, returnLoss, transferAt, bandwidth, design, nearestE24, gamma,
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = maths; return; }

  /* Page ------------------------------------------------------------------- */

  const T = window.CPLTools;
  const tool = document.querySelector('[data-tool="matching-network"]');
  if (!T || !tool) return;

  const form = tool.querySelector('form');
  const qField = tool.querySelector('[data-q-field]');
  const qInput = form.elements.q;
  const solBox = tool.querySelector('[data-solutions]');
  const warn = tool.querySelector('[data-warn]');
  const smith = tool.querySelector('[data-smith]');
  const schematic = tool.querySelector('[data-schematic]');
  const S = T.svg;

  const PRESETS = {
    pozar: { f: '500', f_u: '1e6', rs: '100', xs: '0', rl: '200', xl: '-100', topo: 'L', sol: '0' },
    pa: { f: '868', f_u: '1e6', rs: '50', xs: '0', rl: '12.5', xl: '0', sol: '0' },
    complex: { f: '2440', f_u: '1e6', rs: '50', xs: '0', rl: '15', xl: '-25', sol: '0' },
  };

  // Component values in the units engineers buy them in.
  function value(part) {
    if (!part) return T.DASH;
    return part.type === 'C' ? `${T.sig(part.value * 1e12, 3)} pF` : `${T.sig(part.value * 1e9, 3)} nH`;
  }
  function freq(f) { return Number.isFinite(f) ? T.si(f, 'Hz', 3) : T.DASH; }
  function rl(x) { return !Number.isFinite(x) ? (x > 0 ? '> 99' : T.DASH) : x > 99 ? '> 99' : T.fixed(x, 1); }
  function vswrOf(rlDb) {
    const g = Math.pow(10, -rlDb / 20);
    return rlDb === Infinity ? 1 : Number.isFinite(rlDb) ? (1 + g) / (1 - g) : NaN;
  }
  function ohms(z) {
    return `${T.sig(z.re, 3)} ${z.im < 0 ? '−' : '+'} j${T.sig(Math.abs(z.im), 3)} Ω`;
  }

  function syncQ() {
    const shape = form.elements.topo.value;
    const off = shape === 'L';
    qField.hidden = off;
    qInput.disabled = off;
    return off;
  }
  form.querySelectorAll('input[name="topo"]').forEach((r) => r.addEventListener('change', syncQ));

  /* Solution list */

  function renderSolutions(solutions, chosen) {
    solBox.replaceChildren();
    solutions.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mn-sol';
      b.setAttribute('aria-pressed', String(i === chosen));
      const head = document.createElement('span');
      head.className = 'mn-sol-head';
      const title = document.createElement('b');
      title.textContent = `${i + 1}. ${s.name}`;
      const rlTag = document.createElement('small');
      rlTag.textContent = s.parts.some((p) => p.part) ? `E24: ${rl(s.rlE24)} dB return loss` : '';
      head.append(title, rlTag);
      b.append(head);
      const rows = document.createElement('span');
      rows.className = 'mn-parts';
      s.parts.forEach((p, k) => {
        if (!p.part) return;
        const row = document.createElement('span');
        const what = document.createElement('span');
        what.textContent = `${p.place === 'series' ? 'Series' : 'Shunt'} ${p.part.type}`;
        const v = document.createElement('span');
        v.className = 'mn-num';
        v.textContent = value(p.part);
        const e = document.createElement('span');
        e.className = 'mn-num mn-e24';
        e.textContent = `E24 ${value(s.e24[k].part)}`;
        row.append(what, v, e);
        rows.append(row);
      });
      if (!s.parts.some((p) => p.part)) {
        const row = document.createElement('span');
        row.textContent = 'The load is already the conjugate of the source.';
        rows.append(row);
      }
      b.append(rows);
      b.addEventListener('click', () => {
        form.elements.sol.value = String(i);
        api.run();
      });
      solBox.append(b);
    });
  }

  /* Smith chart, normalised to the source resistance */

  const C0 = 200, RAD = 180;
  const px = (g) => [C0 + RAD * g.re, C0 - RAD * g.im];
  const pts = (list) => list.map((g) => px(g).map((n) => n.toFixed(1)).join(' ')).join('L');

  function smithGrid() {
    const grid = [];
    grid.push(S('circle', { class: 'chart-axis', cx: C0, cy: C0, r: RAD, fill: 'none' }));
    grid.push(S('line', { class: 'chart-grid', x1: C0 - RAD, x2: C0 + RAD, y1: C0, y2: C0 }));
    for (const r of [0.2, 0.5, 1, 2, 5]) {
      grid.push(S('circle', { class: 'chart-grid', cx: C0 + RAD * (r / (1 + r)), cy: C0, r: RAD / (1 + r), fill: 'none' }));
      const [tx] = px(cx((r - 1) / (r + 1), 0));
      grid.push(S('text', { class: 'chart-text', x: tx + 3, y: C0 + 13 }, String(r)));
    }
    for (const x of [0.2, 0.5, 1, 2, 5]) {
      for (const sgn of [1, -1]) {
        const line = [];
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          const r = t / (1 - t + 1e-9) * 0.25;
          line.push(gamma(cx(r, sgn * x), 1));
        }
        grid.push(S('path', { class: 'chart-grid', fill: 'none', d: `M${pts(line)}` }));
      }
      const g = gamma(cx(0, x), 1);
      const [tx, ty] = px(g);
      grid.push(S('text', { class: 'chart-text', x: tx + (g.re > 0.1 ? 6 : g.re < -0.1 ? -6 : 0), y: ty - 6, 'text-anchor': g.re > 0.1 ? 'start' : g.re < -0.1 ? 'end' : 'middle' }, `+${x}`));
      const [bx, by] = px(conj(g));
      grid.push(S('text', { class: 'chart-text', x: bx + (g.re > 0.1 ? 6 : g.re < -0.1 ? -6 : 0), y: by + 14, 'text-anchor': g.re > 0.1 ? 'start' : g.re < -0.1 ? 'end' : 'middle' }, `−${x}`));
    }
    // The unit-conductance circle, which shunt-first paths aim for.
    grid.push(S('circle', { class: 'chart-soft', cx: C0 - RAD / 2, cy: C0, r: RAD / 2, fill: 'none' }));
    return grid;
  }

  function drawSmith(v, s) {
    smith.replaceChildren(...smithGrid());
    if (!s) return;
    const z0 = v.zs.re;
    // Walk from the load to the source, one element at a time: a series
    // element moves along a circle of constant resistance, a shunt element
    // along a circle of constant conductance.
    let z = v.zl;
    const stops = [z];
    s.elements.forEach((e) => {
      const steps = [];
      const val = e.place === 'series' ? e.x : e.b;
      if (val === 0) return;
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const zt = e.place === 'series' ? add(z, cx(0, t * e.x)) : inv(add(inv(z), cx(0, t * e.b)));
        steps.push(gamma(zt, z0));
      }
      smith.append(S('path', { class: 'chart-line', d: `M${pts(steps)}` }));
      // Which part made this arc, at its midpoint.
      const mid = steps[32];
      const [mx, my] = px(mid);
      const part = component(e, 2 * Math.PI * v.f);
      smith.append(S('text', { class: 'chart-text-hi', x: mx + (mid.re >= 0 ? 8 : -8), y: my + (mid.im >= 0 ? -6 : 14), 'text-anchor': mid.re >= 0 ? 'start' : 'end' },
        `${e.place} ${part.type}`));
      z = e.place === 'series' ? add(z, cx(0, e.x)) : inv(add(inv(z), cx(0, e.b)));
      stops.push(z);
    });
    stops.slice(1, -1).forEach((zz) => {
      const [x, y] = px(gamma(zz, z0));
      smith.append(S('circle', { class: 'mn-stop', cx: x, cy: y, r: 3.5 }));
    });
    const [lx, ly] = px(gamma(v.zl, z0));
    smith.append(S('circle', { class: 'chart-dot', cx: lx, cy: ly, r: 6 }));
    smith.append(S('text', { class: 'chart-text-hi', x: lx + 10, y: ly + 4 }, 'Load'));
    const [mx, my] = px(gamma(conj(v.zs), z0));
    smith.append(S('circle', { class: 'mn-match', cx: mx, cy: my, r: 7 }));
    smith.append(S('text', { class: 'chart-text-hi', x: mx - 10, y: my - 10, 'text-anchor': 'end' }, 'Match'));
  }

  /* Schematic, source on the left, load on the right */

  function drawSchematic(s) {
    const W = 560, TOP = 56, GND = 160;
    schematic.replaceChildren();
    if (!s) return;
    const wire = (d) => schematic.append(S('path', { class: 'mn-wire', d }));
    const text = (x, y, t, anchor = 'middle', cls = 'chart-text-hi') => schematic.append(S('text', { class: cls, x, y, 'text-anchor': anchor }, t));

    // Source: generator and its impedance.
    wire(`M40 ${GND}V128M40 88V${TOP}H70`);
    schematic.append(S('circle', { class: 'mn-wire', cx: 40, cy: 108, r: 20 }));
    wire('M30 108q5 -9 10 0t10 0');
    schematic.append(S('rect', { class: 'mn-wire', x: 70, y: TOP - 9, width: 40, height: 18, rx: 2 }));
    text(90, TOP - 18, 'Source');
    text(90, TOP + 28, 'Zs', 'middle', 'chart-text');
    // Load.
    schematic.append(S('rect', { class: 'mn-wire', x: W - 49, y: 86, width: 18, height: 44, rx: 2 }));
    wire(`M${W - 40} ${TOP}V86M${W - 40} 130V${GND}`);
    text(W - 40, TOP - 18, 'Load');
    text(W - 58, 112, 'ZL', 'end', 'chart-text');

    const live = s.parts.map((p, k) => ({ p, e: s.e24[k] })).filter((o) => o.p.part);
    const x0 = 110, x1 = W - 40;
    const slot = (x1 - x0) / (live.length + 1);
    let x = x0;
    wire(`M40 ${GND}H${x1}`);
    if (!live.length) { wire(`M${x0} ${TOP}H${x1}`); return; }

    live.forEach((o, i) => {
      const cxp = x0 + slot * (i + 1);
      const label = value(o.p.part);
      const e24 = `E24 ${value(o.e.part)}`;
      if (o.p.place === 'series') {
        wire(`M${x} ${TOP}H${cxp - 22}`);
        if (o.p.part.type === 'L') wire(`M${cxp - 22} ${TOP}a5.5 5.5 0 0 1 11 0a5.5 5.5 0 0 1 11 0a5.5 5.5 0 0 1 11 0a5.5 5.5 0 0 1 11 0`);
        else wire(`M${cxp - 22} ${TOP}H${cxp - 4}M${cxp - 4} ${TOP - 13}V${TOP + 13}M${cxp + 4} ${TOP - 13}V${TOP + 13}M${cxp + 4} ${TOP}H${cxp + 22}`);
        text(cxp, TOP - 22, label);
        text(cxp, TOP + 32, e24, 'middle', 'chart-text');
        x = cxp + 22;
      } else {
        wire(`M${x} ${TOP}H${cxp}`);
        schematic.append(S('circle', { class: 'mn-node', cx: cxp, cy: TOP, r: 3 }));
        schematic.append(S('circle', { class: 'mn-node', cx: cxp, cy: GND, r: 3 }));
        const mid = (TOP + GND) / 2;
        if (o.p.part.type === 'L') wire(`M${cxp} ${TOP}V${mid - 22}a5.5 5.5 0 0 1 0 11a5.5 5.5 0 0 1 0 11a5.5 5.5 0 0 1 0 11a5.5 5.5 0 0 1 0 11V${GND}`);
        else wire(`M${cxp} ${TOP}V${mid - 4}M${cxp - 13} ${mid - 4}H${cxp + 13}M${cxp - 13} ${mid + 4}H${cxp + 13}M${cxp} ${mid + 4}V${GND}`);
        text(cxp - 18, mid - 2, label, 'end');
        text(cxp - 18, mid + 14, e24, 'end', 'chart-text');
        x = cxp;
      }
    });
    wire(`M${x} ${TOP}H${x1}`);
  }

  /* Wiring */

  const OUT = ['q', 'bw', 'edges', 'rlE24', 'vswrE24', 'zin'];

  const api = T.mount(tool, (v, ui) => {
    // The Q field only counts for Pi and T. If switching topology has just
    // turned it on or off, read the form again.
    const was = qInput.disabled;
    syncQ();
    if (qInput.disabled !== was) { ui.run(); return; }
    const shape = form.elements.topo.value;
    const fail = (msg) => {
      OUT.forEach((k) => ui.out(k, T.DASH));
      solBox.replaceChildren();
      warn.textContent = msg;
      warn.hidden = !msg;
      ui.out('note', '');
      drawSmith(v, null);
      drawSchematic(null);
    };
    if (!v.ok) { fail('Check the highlighted values. Frequency, resistances and Q must be positive numbers.'); return; }

    const p = { f: v.f, zs: cx(v.rs, v.xs), zl: cx(v.rl, v.xl), shape, q: v.q };
    const r = design(p);
    if (!r.solutions.length) {
      const name = shape === 'pi' ? 'A Pi' : 'A T';
      fail(`${name} network between these impedances needs a loaded Q of at least ${T.fixed(r.qmin, 2)}. `
        + `Its virtual resistance has to sit ${shape === 'pi' ? 'below' : 'above'} both ends, and a lower Q would put it between them. Raise Q, or use an L-network.`);
      return;
    }
    warn.hidden = true;
    let chosen = Math.round(T.parse(form.elements.sol.value));
    if (!(chosen >= 0 && chosen < r.solutions.length)) chosen = 0;
    const s = r.solutions[chosen];
    renderSolutions(r.solutions, chosen);

    const empty = !s.parts.some((pt) => pt.part);
    ui.out('q', empty ? T.DASH : s.q >= 100 ? T.sig(s.q, 3) : T.fixed(s.q, 2));
    const { lower, upper } = s.band;
    const lo = Number.isFinite(lower), hi = Number.isFinite(upper);
    ui.out('bw', empty ? T.DASH : lo && hi ? freq(s.band.bw) : 'Open-ended');
    ui.out('edges', empty ? T.DASH : lo && hi ? `${freq(lower)} to ${freq(upper)}`
      : lo ? `Above ${freq(lower)}` : hi ? `Below ${freq(upper)}` : 'Over a decade both ways');
    ui.out('rlE24', empty ? T.DASH : rl(s.rlE24));
    const vs = vswrOf(s.rlE24);
    ui.out('vswrE24', empty ? T.DASH : vs > 100 ? '> 100' : T.fixed(vs, 2));
    ui.out('zin', ohms(s.zinE24));
    const count = r.solutions.length;
    ui.out('note', empty ? 'No network needed.'
      : `${count} solution${count === 1 ? '' : 's'}. Select one to draw it.${shape === 'L' ? '' : ` Minimum Q for this ${shape === 'pi' ? 'Pi' : 'T'}: ${T.fixed(r.qmin, 2)}.`}`
        + (lo && hi ? '' : ' Open-ended: the response does not fall by 3 dB within a decade of the design frequency on at least one side.')
        + (s.q > 20 ? ' A Q this high gives a narrow match that is very sensitive to part tolerance and loss.' : ''));
    drawSmith(p, s);
    drawSchematic(s);
  });

  tool.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const preset = PRESETS[button.dataset.preset];
    if (!preset) return;
    T.apply(form, preset);
    syncQ();
    form.dispatchEvent(new Event('change'));
  }));
})();
