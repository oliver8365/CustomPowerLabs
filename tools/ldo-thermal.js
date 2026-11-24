/* LDO regulator power and thermal: dissipation, junction temperature,
   efficiency, dropout headroom and the limits that keep the junction safe.
   The maths is at the top and loads under Node for testing; the page wiring
   below it runs only in a browser. */
(function () {
  'use strict';

  // Power dissipated in a linear regulator: the pass element drops
  // (Vin − Vout) at the load current, and the ground (quiescent) current
  // flows from the input to ground: P = (Vin − Vout)·Iload + Vin·Ignd.
  // TI SLVA118, "Technical Review of Low Dropout Voltage Regulator Operation
  // and Performance".
  function power(vin, vout, iload, ignd) {
    return (vin - vout) * iload + vin * ignd;
  }

  // Junction temperature from the junction-to-ambient thermal resistance:
  // Tj = Ta + θJA·P. Definition of θJA in JEDEC JESD51-2 and TI SPRA953,
  // "Semiconductor and IC Package Thermal Metrics".
  function junction(ta, thetaJA, p) {
    return ta + thetaJA * p;
  }

  // Efficiency: output power over input power, where the input current is
  // the load current plus the ground current (TI SLVA118).
  function efficiency(vin, vout, iload, ignd) {
    return (vout * iload) / (vin * (iload + ignd));
  }

  // The largest load current that keeps Tj at or below tjmax: solve
  // tjmax = Ta + θJA·((Vin − Vout)·I + Vin·Ignd) for I. Infinity when the
  // load current makes no heat (Vin = Vout); negative when the ground
  // current alone already overheats the part.
  function maxLoad(vin, vout, ignd, thetaJA, ta, tjmax) {
    const budget = (tjmax - ta) / thetaJA - vin * ignd;
    if (vin - vout <= 0) return budget >= 0 ? Infinity : -Infinity;
    return budget / (vin - vout);
  }

  // p: { vin, vout (V), iload, ignd (A), vdo (V), theta (°C/W), ta, tjmax (°C) }
  function analyse(p) {
    const pd = power(p.vin, p.vout, p.iload, p.ignd);
    const tj = junction(p.ta, p.theta, pd);
    const headroom = p.vin - p.vout;
    return {
      pd,
      tj,
      ok: tj <= p.tjmax,
      margin: p.tjmax - tj,
      eff: efficiency(p.vin, p.vout, p.iload, p.ignd),
      pin: p.vin * (p.iload + p.ignd),
      pout: p.vout * p.iload,
      headroom,
      spare: headroom - p.vdo,
      vinMin: p.vout + p.vdo,
      imax: maxLoad(p.vin, p.vout, p.ignd, p.theta, p.ta, p.tjmax),
      tamax: p.tjmax - p.theta * pd,
      thetaMax: pd > 0 ? (p.tjmax - p.ta) / pd : Infinity,
      pmax: (p.tjmax - p.ta) / p.theta,
    };
  }

  const maths = { power, junction, efficiency, maxLoad, analyse };
  if (typeof module !== 'undefined' && module.exports) { module.exports = maths; return; }

  /* Page ------------------------------------------------------------------- */

  const T = window.CPLTools;
  const tool = document.querySelector('[data-tool="ldo-thermal"]');
  if (!T || !tool) return;

  const chart = tool.querySelector('[data-chart]');
  const warn = tool.querySelector('[data-warn]');

  // Typical figures for a starting point only. The datasheet rules.
  const PRESETS = {
    sot23: { vin: '5', vout: '3.3', iload: '250', iload_u: '1e-3', ignd: '0.5', ignd_u: '1e-3', vdo: '250', vdo_u: '1e-3', theta: '180', ta: '40', tjmax: '125' },
    sot223: { vin: '12', vout: '5', iload: '150', iload_u: '1e-3', ignd: '5', ignd_u: '1e-3', vdo: '1.2', vdo_u: '1', theta: '60', ta: '50', tjmax: '125' },
    dfn: { vin: '3.3', vout: '1.8', iload: '600', iload_u: '1e-3', ignd: '100', ignd_u: '1e-6', vdo: '150', vdo_u: '1e-3', theta: '65', ta: '60', tjmax: '125' },
  };

  const temp = (c) => `${T.fixed(c, 1)} °C`;

  function niceStep(span, n) {
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / mag;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * mag;
  }

  function draw(p, r) {
    chart.replaceChildren();
    if (!r) return;
    const W = 640, H = 280, L = 54, R = 20, TOP = 26, B = 34;

    // Load axis: past the operating point and the thermal limit, if it is near.
    let span = p.iload * 1.5;
    if (Number.isFinite(r.imax) && r.imax > 0) span = Math.max(span, p.iload > 0 ? Math.min(r.imax * 1.25, p.iload * 4) : r.imax * 1.25);
    if (!(span > 0)) span = 0.1;
    const xStep = niceStep(span, 5);
    const xMax = Math.ceil(span / xStep) * xStep;
    const tjAt = (i) => junction(p.ta, p.theta, power(p.vin, p.vout, i, p.ignd));

    const hiT = Math.max(tjAt(xMax), p.tjmax, tjAt(0));
    const loT = Math.min(p.ta, tjAt(0));
    const yStep = niceStep(hiT - loT + 10, 5);
    const yBot = Math.floor((loT - 2) / yStep) * yStep;
    const yTop = Math.ceil((hiT + yStep * 0.3) / yStep) * yStep;
    const x = (i) => L + (i / xMax) * (W - L - R);
    const y = (t) => TOP + ((yTop - t) / (yTop - yBot)) * (H - TOP - B);

    for (let v = yBot; v <= yTop + yStep / 1e6; v += yStep) {
      chart.append(T.svg('line', { class: 'chart-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      chart.append(T.svg('text', { class: 'chart-text', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, T.fixed(v, 0)));
    }
    for (let i = 0; i <= xMax + xStep / 1e6; i += xStep) {
      chart.append(T.svg('line', { class: 'chart-grid', x1: x(i), x2: x(i), y1: TOP, y2: H - B }));
      chart.append(T.svg('text', { class: 'chart-text', x: x(i), y: H - B + 18, 'text-anchor': 'middle' }, i === 0 ? '0' : T.si(i, 'A', 3).replace(' ', ' ')));
    }
    chart.append(T.svg('text', { class: 'chart-text', x: L - 8, y: 12, 'text-anchor': 'end' }, '°C'));

    // Junction limit and ambient.
    chart.append(T.svg('line', { class: 'chart-limit', x1: L, x2: W - R, y1: y(p.tjmax), y2: y(p.tjmax) }));
    chart.append(T.svg('text', { class: 'chart-text', x: L + 6, y: y(p.tjmax) - 6 }, `Tj max ${T.fixed(p.tjmax, 0)} °C`));
    if (p.ta > yBot) {
      chart.append(T.svg('line', { class: 'chart-soft', x1: L, x2: W - R, y1: y(p.ta), y2: y(p.ta) }));
      chart.append(T.svg('text', { class: 'chart-text', x: W - R - 4, y: y(p.ta) - 6, 'text-anchor': 'end' }, `Ambient ${T.fixed(p.ta, 0)} °C`));
    }

    // Tj rises in a straight line with load current.
    chart.append(T.svg('path', { class: 'chart-line', d: `M${x(0)} ${y(tjAt(0))}L${x(xMax)} ${y(tjAt(xMax))}` }));

    // Maximum load current.
    if (Number.isFinite(r.imax) && r.imax > 0 && r.imax <= xMax) {
      chart.append(T.svg('line', { class: 'chart-soft', x1: x(r.imax), x2: x(r.imax), y1: y(p.tjmax), y2: H - B }));
      const right = x(r.imax) > W - 140;
      chart.append(T.svg('text', { class: 'chart-text ldo-halo', x: x(r.imax) + (right ? -6 : 6), y: H - B - 8, 'text-anchor': right ? 'end' : 'start' }, `Max ${T.si(r.imax, 'A', 3).replace(' ', ' ')}`));
    }

    chart.append(T.svg('circle', { class: r.ok ? 'chart-dot' : 'ldo-dot-bad', cx: x(p.iload), cy: y(r.tj), r: 6 }));
    const right = x(p.iload) > W - 200;
    chart.append(T.svg('text', { class: 'chart-text-hi ldo-halo', x: x(p.iload) + (right ? -12 : 12), y: y(r.tj) + (r.tj > p.tjmax - (yTop - yBot) * 0.08 && r.ok ? 18 : -10), 'text-anchor': right ? 'end' : 'start' },
      `${T.fixed(r.tj, 1)} °C at ${T.si(p.iload, 'A', 3).replace(' ', ' ')}`));
    chart.setAttribute('aria-label', `Junction temperature against load current. At ${T.si(p.iload, 'A', 3)} the junction is at ${temp(r.tj)} against a ${T.fixed(p.tjmax, 0)} °C limit.`);
  }

  T.mount(tool, (v, ui) => {
    const keys = ['tj', 'pd', 'eff', 'headroom', 'spare', 'vinMin', 'imax', 'tamax', 'thetaMax', 'pmax', 'margin'];
    const fail = (msg) => {
      keys.forEach((k) => ui.out(k, T.DASH));
      ui.out('verdict', msg);
      ui.state('tj', null);
      ui.state('spare', null);
      warn.hidden = true;
      draw(v, null);
    };
    if (!v.ok) { fail('Check the highlighted values.'); return; }
    if (v.vout > v.vin) { fail('The input is below the output. A linear regulator cannot step up.'); return; }
    if (!(v.tjmax > v.ta)) { fail('The ambient temperature is at or above the maximum junction temperature.'); return; }

    const r = analyse(v);
    ui.out('tj', T.fixed(r.tj, 1));
    ui.state('tj', r.ok);
    ui.out('pd', T.si(r.pd, 'W', 3));
    ui.out('eff', `${T.fixed(r.eff * 100, 1)}%`);
    ui.out('headroom', T.si(r.headroom, 'V', 3));
    ui.out('spare', r.spare >= 0 ? T.si(r.spare, 'V', 3) : `${T.MINUS}${T.si(-r.spare, 'V', 3)}`);
    ui.state('spare', r.spare >= 0 ? null : false);
    ui.out('vinMin', T.si(r.vinMin, 'V', 3));
    ui.out('imax', r.imax === Infinity ? 'No limit' : r.imax <= 0 ? 'None' : T.si(r.imax, 'A', 3));
    ui.out('tamax', temp(r.tamax));
    ui.out('thetaMax', Number.isFinite(r.thetaMax) ? `${T.sig(r.thetaMax, 3)} °C/W` : T.DASH);
    ui.out('pmax', T.si(r.pmax, 'W', 3));

    ui.out('verdict', r.ok
      ? `Within the limit, ${T.fixed(r.margin, 1)} °C below the ${T.fixed(v.tjmax, 0)} °C maximum.${r.margin < 10 ? ' That is a thin margin once board and airflow tolerances are added.' : ''}`
      : `${T.fixed(-r.margin, 1)} °C over the ${T.fixed(v.tjmax, 0)} °C maximum. Cut the dissipation or the thermal resistance.`);

    const lines = [];
    if (r.spare < 0) lines.push(`The input is ${T.si(-r.spare, 'V', 3)} short of the output plus dropout. The regulator will be in dropout and the output will sag. It needs at least ${T.si(r.vinMin, 'V', 3)} in.`);
    if (r.imax <= 0 && r.imax !== Infinity) lines.push('The ground current alone heats the junction past its limit at this input voltage and ambient.');
    if (r.pd > 1 && r.eff < 0.6) lines.push(`This regulator turns ${T.si(r.pd, 'W', 3)} into heat at ${T.fixed(r.eff * 100, 0)}% efficiency. A buck converter would waste much less.`);
    warn.hidden = lines.length === 0;
    warn.textContent = lines.join(' ');

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
