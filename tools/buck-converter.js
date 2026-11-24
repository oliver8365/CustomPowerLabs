/* Buck converter power stage: duty cycle, inductor, output and input
   capacitors, the discontinuous-mode boundary and the minimum on-time check.
   The maths is at the top and loads under Node for testing; the page wiring
   below it runs only in a browser. */
(function () {
  'use strict';

  const T0 = typeof window !== 'undefined' ? window.CPLTools : require('./tools.js');

  // Duty cycle in continuous conduction, allowing for efficiency:
  // D = Vout / (Vin · η). TI SLVA477, "Basic Calculation of a Buck Converter's
  // Power Stage", duty-cycle equation. With η = 1 it is the ideal Vout / Vin.
  function duty(vin, vout, eff) {
    return vout / (vin * eff);
  }

  // Peak-to-peak inductor ripple from the on-time volt-seconds:
  // ΔI = (Vin − Vout) · D / (fs · L). TI SLVA477, inductor ripple equation.
  function ripple(vin, vout, eff, fs, L) {
    return ((vin - vout) * duty(vin, vout, eff)) / (fs * L);
  }

  // The inductance that gives a ripple of dI at input vin (the same equation
  // solved for L). Ripple grows with Vin, so size it at the highest input.
  function inductance(vin, vout, eff, fs, dI) {
    return ((vin - vout) * duty(vin, vout, eff)) / (fs * dI);
  }

  // RMS of a triangle of mean I and peak-to-peak dI riding on DC:
  // Irms = √(I² + ΔI²/12). Standard result, e.g. Erickson and Maksimović,
  // Fundamentals of Power Electronics (small-ripple waveforms).
  function triangleRms(I, dI) {
    return Math.sqrt(I * I + (dI * dI) / 12);
  }

  // Input capacitor RMS current. The switch draws the inductor current (mean
  // Iout, ripple ΔI) for a fraction D of each period and the supply provides
  // only the mean, D·Iout, so the capacitor carries the rest:
  // Icin² = D·(Iout² + ΔI²/12) − (D·Iout)². With ΔI → 0 this is the familiar
  // Iout·√(D(1 − D)), which peaks at Iout/2 when D = 0.5 (TI SLTA055,
  // "Input and Output Capacitor Selection").
  function inputRms(D, iout, dI) {
    const ms = D * (iout * iout + (dI * dI) / 12) - (D * iout) * (D * iout);
    return Math.sqrt(Math.max(0, ms));
  }

  // Input capacitance for a peak-to-peak input ripple dV, from the charge the
  // capacitor gives up during the on-time: C = Iout · D · (1 − D) / (fs · ΔVin)
  // (TI SLTA055). ESR ripple is not included.
  function inputCap(D, iout, fs, dV) {
    return (iout * D * (1 - D)) / (fs * dV);
  }

  // Output capacitance for a capacitive ripple dV. The capacitor takes the
  // inductor's ripple current, a triangle of peak-to-peak ΔI, so
  // ΔV = ΔI / (8 · fs · C). TI SLVA477, output capacitor equation.
  function outputCap(dI, fs, dV) {
    return dI / (8 * fs * dV);
  }

  // Inductor current over one period in continuous or discontinuous mode,
  // as points [t, i] starting at the start of the on-time. Lossless DCM
  // equations (Erickson and Maksimović): D1 = √(2·L·fs·Iout·Vout / (Vin·(Vin − Vout))),
  // peak = (Vin − Vout)·D1 / (fs·L), D2 = D1·(Vin − Vout) / Vout.
  function waveform(vin, vout, eff, fs, L, iout) {
    const Ts = 1 / fs;
    const D = Math.min(duty(vin, vout, eff), 1);
    const dI = ripple(vin, vout, eff, fs, L);
    if (iout >= dI / 2) {
      const lo = iout - dI / 2, hi = iout + dI / 2;
      return { dcm: false, D, dI, peak: hi, valley: lo, avg: iout, points: [[0, lo], [D * Ts, hi], [Ts, lo]] };
    }
    const D1 = Math.sqrt((2 * L * fs * iout * vout) / (vin * (vin - vout)));
    const pk = ((vin - vout) * D1) / (fs * L);
    const D2 = (D1 * (vin - vout)) / vout;
    return { dcm: true, D: D1, dI: pk, peak: pk, valley: 0, avg: iout, points: [[0, 0], [D1 * Ts, pk], [(D1 + D2) * Ts, 0], [Ts, 0]] };
  }

  // p: { vinmin, vinmax, vout (V), iout (A), fs (Hz), kr (ripple ratio, ΔI / Iout),
  //      dvout (V p-p), esr (Ω), eff (0..1], dvin (V p-p), tonmin (s, or NaN) }
  // Returns null if the operating point is impossible.
  function design(p) {
    const { vinmin, vinmax, vout, iout, fs, kr, eff } = p;
    if (!(vout > 0 && vinmin > 0 && vinmax >= vinmin && iout > 0 && fs > 0 && kr > 0 && eff > 0 && eff <= 1)) return null;
    const dmin = duty(vinmax, vout, eff);
    const dmax = duty(vinmin, vout, eff);
    if (!(vout < vinmin) || !(dmax < 1)) return null;

    // Inductor: sized for the ripple target at the highest input.
    const Lreq = inductance(vinmax, vout, eff, fs, kr * iout);
    const L = T0.nearestE(Lreq, 12);
    const dI = ripple(vinmax, vout, eff, fs, L);
    const dIatMin = ripple(vinmin, vout, eff, fs, L);
    const peak = iout + dI / 2;
    const valley = iout - dI / 2;
    const rms = triangleRms(iout, dI);

    // Output capacitor: the ESR takes ΔI·ESR of the budget, the capacitance the rest.
    const dvEsr = dI * p.esr;
    const dvCap = p.dvout - dvEsr;
    const cout = dvCap > 0 ? outputCap(dI, fs, dvCap) : NaN;
    const coutIdeal = outputCap(dI, fs, p.dvout);
    const esrMax = p.dvout / dI;

    // Input capacitor: worst case over the input range. D(1 − D) peaks at D = 0.5.
    let cinRms = 0, cinRmsD = dmin, dd = 0, ddD = dmin;
    const N = 400;
    for (let k = 0; k <= N; k++) {
      const vin = vinmin + ((vinmax - vinmin) * k) / N;
      const D = duty(vin, vout, eff);
      const r = inputRms(D, iout, ripple(vin, vout, eff, fs, L));
      if (r > cinRms) { cinRms = r; cinRmsD = D; }
      if (D * (1 - D) > dd) { dd = D * (1 - D); ddD = D; }
    }
    const cin = p.dvin > 0 ? inputCap(ddD, iout, fs, p.dvin) : NaN;

    // Minimum on-time: the shortest pulse happens at the highest input.
    const ton = dmin / fs;
    const tonOk = Number.isFinite(p.tonmin) ? ton >= p.tonmin : null;
    const fsMax = Number.isFinite(p.tonmin) && p.tonmin > 0 ? dmin / p.tonmin : NaN;

    return {
      dmin, dmax, Lreq, L, dI, dIatMin, kActual: dI / iout,
      peak, valley, rms, isat: 1.3 * peak,
      dvEsr, dvCap, cout, coutIdeal, esrMax,
      cinRms, cinRmsD, cin, cinD: ddD,
      iDcm: dI / 2, ton, tonOk, fsMax, coutRms: dI / Math.sqrt(12),
      pin: (vout * iout) / eff,
      iin: (vout * iout) / (eff * vinmin),
    };
  }

  const maths = { duty, ripple, inductance, triangleRms, inputRms, inputCap, outputCap, waveform, design };
  if (typeof module !== 'undefined' && module.exports) { module.exports = maths; return; }

  /* Page ------------------------------------------------------------------- */

  const T = window.CPLTools;
  const tool = document.querySelector('[data-tool="buck-converter"]');
  if (!T || !tool) return;

  const chart = tool.querySelector('[data-chart]');
  const warn = tool.querySelector('[data-warn]');

  // Typical starting points. Check the controller's datasheet for its own limits.
  const PRESETS = {
    p12: { vinmin: '10.8', vinmax: '13.2', vout: '3.3', iout: '3', iout_u: '1', fs: '500', fs_u: '1e3', kr: '30', eff: '90', tonmin: '100', dvout: '30', esr: '5', dvin: '100' },
    p24: { vinmin: '18', vinmax: '32', vout: '5', iout: '2', iout_u: '1', fs: '400', fs_u: '1e3', kr: '35', eff: '92', tonmin: '120', dvout: '50', esr: '5', dvin: '200' },
    core: { vinmin: '4.5', vinmax: '5.5', vout: '1.0', iout: '6', iout_u: '1', fs: '2.2', fs_u: '1e6', kr: '35', eff: '85', tonmin: '100', dvout: '10', esr: '2', dvin: '50' },
  };

  function time(s) { return T.si(s, 's', 3); }

  // Rounds up to n significant figures, for ratings given as a minimum.
  function ceilSig(x, n) {
    if (!(x > 0)) return x;
    const q = Math.pow(10, Math.floor(Math.log10(x)) - n + 1);
    return Math.ceil(x / q - 1e-9) * q;
  }

  // A tidy axis step: 1, 2 or 5 times a power of ten, giving about n divisions.
  function niceStep(span, n) {
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / mag;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * mag;
  }

  function draw(w, fs, label) {
    chart.replaceChildren();
    if (!w) return;
    const W = 640, H = 260, L = 46, R = 118, TOP = 24, B = 34;
    const periods = 3;
    const Ts = 1 / fs;
    const tEnd = periods * Ts;
    const yMax = w.peak * 1.15;
    const step = niceStep(yMax, 5);
    const yTop = Math.ceil(yMax / step) * step;
    const x = (t) => L + (t / tEnd) * (W - L - R);
    const y = (i) => TOP + (1 - i / yTop) * (H - TOP - B);

    for (let v = 0; v <= yTop + step / 1e6; v += step) {
      chart.append(T.svg('line', { class: 'chart-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      chart.append(T.svg('text', { class: 'chart-text', x: L - 8, y: y(v) + 4, 'text-anchor': 'end' }, T.sig(v, 2).replace(/^(\d+)\.0+$/, '$1')));
    }
    for (let k = 0; k <= periods; k++) {
      chart.append(T.svg('line', { class: 'chart-grid', x1: x(k * Ts), x2: x(k * Ts), y1: TOP, y2: H - B }));
      chart.append(T.svg('text', { class: 'chart-text', x: x(k * Ts), y: H - B + 18, 'text-anchor': 'middle' }, k === 0 ? '0' : time(k * Ts).replace(' ', ' ')));
    }
    chart.append(T.svg('text', { class: 'chart-text', x: L - 8, y: 10, 'text-anchor': 'end' }, 'A'));
    chart.append(T.svg('line', { class: 'chart-axis', x1: L, x2: W - R, y1: y(0), y2: y(0) }));

    // Switch on-times, shaded faintly.
    for (let k = 0; k < periods; k++) {
      chart.append(T.svg('rect', { class: 'buck-on', x: x(k * Ts), y: TOP, width: x(w.D * Ts) - x(0), height: H - TOP - B }));
    }

    let d = '';
    for (let k = 0; k < periods; k++) {
      w.points.forEach(([t, i], j) => {
        if (k > 0 && j === 0) return;
        d += `${d ? 'L' : 'M'}${x(k * Ts + t).toFixed(1)} ${y(i).toFixed(1)}`;
      });
    }

    // Average, peak and valley, labelled in the right margin and kept apart.
    chart.append(T.svg('line', { class: 'chart-soft', x1: L, x2: W - R, y1: y(w.peak), y2: y(w.peak) }));
    chart.append(T.svg('line', { class: 'chart-soft', x1: L, x2: W - R, y1: y(w.valley), y2: y(w.valley) }));
    chart.append(T.svg('line', { class: 'buck-avg', x1: L, x2: W - R, y1: y(w.avg), y2: y(w.avg) }));
    chart.append(T.svg('path', { class: 'chart-line', d }));
    const labels = [['Peak', w.peak, 'chart-text'], ['Average', w.avg, 'chart-text-hi'], ['Valley', w.valley, 'chart-text']];
    const pos = labels.map(([, v]) => y(v) + 4);
    for (let k = 1; k < 3; k++) if (pos[k] - pos[k - 1] < 13) pos[k] = pos[k - 1] + 13;
    labels.forEach(([name, v, cls], k) => {
      chart.append(T.svg('text', { class: cls, x: W - R + 8, y: pos[k] }, `${name} ${T.sig(v, 3)} A`));
    });

    chart.append(T.svg('text', { class: 'chart-text-hi', x: L + 6, y: TOP - 8 }, label));
    chart.setAttribute('aria-label', `Inductor current against time ${label}: peak ${T.sig(w.peak, 3)} A, average ${T.sig(w.avg, 3)} A, valley ${T.sig(w.valley, 3)} A.`);
  }

  T.mount(tool, (v, ui) => {
    const keys = ['dmin', 'dmax', 'Lreq', 'L', 'kActual', 'dI', 'peak', 'valley', 'rms', 'isat', 'cout', 'dvEsr', 'dvCap', 'esrMax', 'cinRms', 'cin', 'cinD', 'iDcm', 'ton', 'fsMax', 'coutIdeal', 'coutRms', 'iin', 'pin'];
    const fail = (msg) => {
      keys.forEach((k) => ui.out(k, T.DASH));
      ui.out('verdict', msg);
      warn.hidden = true;
      ui.state('L', null);
      ui.state('ton', null);
      draw(null);
    };
    if (!v.ok) { fail('Check the highlighted values.'); return; }

    const p = {
      vinmin: v.vinmin, vinmax: v.vinmax, vout: v.vout, iout: v.iout, fs: v.fs,
      kr: v.kr / 100, dvout: v.dvout, esr: v.esr, eff: v.eff / 100, dvin: v.dvin, tonmin: v.tonmin,
    };
    if (p.vinmax < p.vinmin) { fail('The maximum input is below the minimum input.'); return; }
    if (!(p.vout < p.vinmin * p.eff)) { fail('A buck converter only steps down: the output must be below the minimum input times the efficiency.'); return; }

    const r = design(p);
    if (!r) { fail('Check the values.'); return; }

    const [lNum, lPrefix] = T.siParts(r.L, 3);
    ui.out('L', lNum);
    ui.out('Lunit', `${lPrefix}H`);
    ui.out('Lreq', T.si(r.Lreq, 'H', 3));
    ui.out('dmin', `${T.fixed(r.dmin * 100, 1)}%`);
    ui.out('dmax', `${T.fixed(r.dmax * 100, 1)}%`);
    ui.out('kActual', `${T.fixed(r.kActual * 100, 0)}%`);
    ui.out('dI', T.si(r.dI, 'A', 3));
    ui.out('peak', T.si(r.peak, 'A', 3));
    ui.out('valley', r.valley < 0 ? 'Zero, DCM' : T.si(r.valley, 'A', 3));
    ui.out('rms', T.si(r.rms, 'A', 3));
    ui.out('isat', T.si(ceilSig(r.isat, 2), 'A', 2));
    ui.out('cout', T.si(r.cout, 'F', 3));
    ui.out('dvEsr', T.si(r.dvEsr, 'V', 3));
    ui.out('dvCap', r.dvCap > 0 ? T.si(r.dvCap, 'V', 3) : T.DASH);
    ui.out('coutIdeal', T.si(r.coutIdeal, 'F', 3));
    ui.out('coutRms', T.si(r.coutRms, 'A', 3));
    ui.out('iin', T.si(r.iin, 'A', 3));
    ui.out('pin', T.si(r.pin, 'W', 3));
    ui.out('esrMax', T.si(r.esrMax, 'Ω', 3));
    ui.out('cinRms', T.si(r.cinRms, 'A', 3));
    ui.out('cin', T.si(r.cin, 'F', 3));
    ui.out('cinD', `${T.fixed(r.cinD * 100, 0)}%`);
    ui.out('iDcm', T.si(r.iDcm, 'A', 3));
    ui.out('ton', time(r.ton));
    ui.out('fsMax', Number.isFinite(r.fsMax) ? T.si(r.fsMax, 'Hz', 3) : T.DASH);
    ui.state('ton', r.tonOk === false ? false : null);

    const lines = [];
    if (r.tonOk === false) {
      lines.push(`At ${T.sig(p.vinmax, 3)} V in, the on-time is ${time(r.ton)}, shorter than the controller's ${time(p.tonmin)} minimum. Expect pulse skipping or a rising output. Keep the switching frequency below ${T.si(r.fsMax, 'Hz', 3)}.`);
    }
    if (!(r.dvCap > 0)) {
      lines.push(`The ESR alone gives ${T.si(r.dvEsr, 'V', 3)} of ripple, more than the ${T.si(p.dvout, 'V', 3)} target. Use capacitors with less than ${T.si(r.esrMax, 'Ω', 3)} of ESR in total, or more of them in parallel.`);
    }
    if (r.valley < 0) {
      lines.push(`With this inductor the ripple is more than twice the load current, so the converter is discontinuous even at full load. The equations above assume continuous conduction.`);
    }
    if (r.dmax > 0.9) {
      lines.push(`The duty cycle reaches ${T.fixed(r.dmax * 100, 0)}% at the lowest input. Many controllers cannot go that high: check the maximum duty cycle or minimum off-time.`);
    }
    warn.hidden = lines.length === 0;
    warn.textContent = lines.join(' ');

    ui.out('verdict', `Nearest E12 value to the ${T.si(r.Lreq, 'H', 3)} needed. It gives ${T.fixed(r.kActual * 100, 0)}% ripple at the highest input. The figures below use it.`);

    const atMin = v.wave === 'min';
    const vin = atMin ? p.vinmin : p.vinmax;
    const w = waveform(vin, p.vout, p.eff, p.fs, r.L, p.iout);
    draw(w, p.fs, `at ${T.sig(vin, 3)} V in, full load${w.dcm ? ', discontinuous' : ''}`);
  });

  tool.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    const preset = PRESETS[button.dataset.preset];
    if (!preset) return;
    const form = tool.querySelector('form');
    T.apply(form, preset);
    form.dispatchEvent(new Event('change'));
  }));
})();
