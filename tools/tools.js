/* Shared helpers for the calculators in /tools.

   Each calculator keeps its maths in its own file (link-budget.js and so on),
   which also loads under Node so the maths can be tested on its own. This file
   handles the page side: reading a form, keeping the values in the address bar
   so a result can be shared, and formatting numbers for display. */
(function (root) {
  'use strict';

  const MINUS = '−';
  const DASH = '—';

  /* Numbers ---------------------------------------------------------------- */

  // Accepts "2.4", "2,4", "1e-3" and a leading Unicode minus. Empty is NaN.
  function parse(text) {
    const s = String(text).trim().replace(/−/g, '-').replace(',', '.');
    if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return Number(s);
  }

  function minus(s) { return s.replace(/^-/, MINUS); }

  // Fixed decimal places, with a proper minus sign; a dash if not finite.
  function fixed(x, dp = 2) {
    if (!Number.isFinite(x)) return DASH;
    const s = x.toFixed(dp);
    return minus(/^-0(\.0+)?$/.test(s) ? s.slice(1) : s);
  }

  // Significant figures without switching to exponent notation for everyday sizes.
  function sig(x, n = 3) {
    if (!Number.isFinite(x)) return DASH;
    if (x === 0) return '0';
    const mag = Math.floor(Math.log10(Math.abs(x)));
    const dp = Math.max(0, n - 1 - mag);
    if (mag >= 12 || mag < -12) return minus(x.toPrecision(n));
    return minus(Number(x.toFixed(Math.min(dp, 20))).toFixed(Math.min(dp, 20)));
  }

  const PREFIXES = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];

  // 4.7e-9 -> ["4.70", "n"]
  function siParts(x, n = 3) {
    if (!Number.isFinite(x)) return [DASH, ''];
    if (x === 0) return ['0', ''];
    const a = Math.abs(x);
    let [scale, prefix] = PREFIXES[PREFIXES.length - 1];
    for (const p of PREFIXES) { if (a >= p[0] * 0.9995) { [scale, prefix] = p; break; } }
    let s = sig(x / scale, n);
    // Rounding can carry over to 1000 (999.96 -> "1000"); move up a prefix.
    if (Math.abs(parse(s)) >= 1000 && scale < 1e12) {
      const i = PREFIXES.findIndex((p) => p[0] === scale);
      [scale, prefix] = PREFIXES[i - 1];
      s = sig(x / scale, n);
    }
    return [s, prefix];
  }

  // 4.7e-9, "H" -> "4.70 nH"
  function si(x, unit = '', n = 3) {
    const [s, p] = siParts(x, n);
    return Number.isFinite(x) ? `${s} ${p}${unit}` : DASH;
  }

  // Nearest standard (E-series) value, at any decade.
  const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  function nearestE(x, series = 24) {
    if (!(x > 0) || !Number.isFinite(x)) return NaN;
    const list = series === 12 ? E12 : E24;
    const decade = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / decade;
    let best = list[0], err = Infinity;
    for (const c of list.concat([10])) {
      const e = Math.abs(Math.log(m / c));
      if (e < err) { err = e; best = c; }
    }
    return best * decade;
  }

  /* Forms ------------------------------------------------------------------ */

  // Every named control in the form becomes a property of the result.
  // Text inputs are parsed as numbers. A select called "<name>_u" scales the
  // input "<name>": its option values are multipliers to base units, so
  // 2440 with "1e6" gives 2.44e9. data-gt / data-min / data-max (in base units)
  // mark values out of range. Out-of-range or unparseable inputs are flagged
  // and the result's .ok is false.
  function read(form) {
    const v = { ok: true, raw: {} };
    for (const el of form.elements) {
      const name = el.name;
      if (!name || el.disabled) continue;
      if (el.type === 'radio') { if (el.checked) v[name] = el.value; continue; }
      if (el.type === 'checkbox') { v[name] = el.checked; continue; }
      if (el.tagName === 'SELECT') { if (!name.endsWith('_u')) v[name] = el.value; continue; }
      if (el.tagName !== 'INPUT' || el.type === 'hidden' || el.type === 'button' || el.type === 'submit') continue;

      v.raw[name] = el.value;
      let x = parse(el.value);
      const unit = form.elements[`${name}_u`];
      if (unit) x *= Number(unit.value);
      const d = el.dataset;
      const bad = !Number.isFinite(x)
        || (d.gt !== undefined && !(x > Number(d.gt)))
        || (d.lt !== undefined && !(x < Number(d.lt)))
        || (d.min !== undefined && !(x >= Number(d.min)))
        || (d.max !== undefined && !(x <= Number(d.max)));
      if (bad && !(el.value.trim() === '' && d.optional !== undefined)) {
        el.setAttribute('aria-invalid', 'true');
        v.ok = false;
      } else {
        el.removeAttribute('aria-invalid');
      }
      v[name] = el.value.trim() === '' && d.optional !== undefined ? NaN : x;
    }
    return v;
  }

  // The form's current values as strings, keyed by name (radios by group).
  function snapshot(form) {
    const s = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'button' || el.type === 'submit') continue;
      if (el.type === 'radio') { if (el.checked) s[el.name] = el.value; continue; }
      if (el.type === 'checkbox') { s[el.name] = el.checked ? '1' : '0'; continue; }
      s[el.name] = el.value;
    }
    return s;
  }

  function apply(form, values) {
    for (const [name, value] of Object.entries(values)) {
      const el = form.elements[name];
      if (!el) continue;
      if (el instanceof RadioNodeList || (el.length && el[0] && el[0].type === 'radio')) {
        for (const r of el) r.checked = r.value === value;
      } else if (el.type === 'checkbox') {
        el.checked = value === '1' || value === true;
      } else if (el.tagName === 'SELECT') {
        if (Array.from(el.options).some((o) => o.value === String(value))) el.value = String(value);
      } else {
        el.value = String(value);
      }
    }
  }

  function setOut(scope, key, text) {
    scope.querySelectorAll(`[data-out="${key}"]`).forEach((el) => { el.textContent = text; });
  }

  // Marks a readout good or bad (null clears both).
  function setState(scope, key, good) {
    scope.querySelectorAll(`[data-out="${key}"]`).forEach((el) => {
      const box = el.closest('.readout') || el;
      box.classList.toggle('is-good', good === true);
      box.classList.toggle('is-bad', good === false);
    });
  }

  // Wires a calculator up: recomputes on every change, restores values from the
  // address bar, writes changed values back to it (so the page can be shared),
  // and handles [data-tool-reset] and [data-tool-share] buttons in the tool.
  // update(values, api) does the work; it is called once straight away.
  function mount(tool, update) {
    const form = tool.querySelector('form');
    const defaults = snapshot(form);
    const params = new URLSearchParams(window.location.search);
    const fromUrl = {};
    params.forEach((value, key) => { if (key in defaults) fromUrl[key] = value.slice(0, 40); });
    apply(form, fromUrl);

    let timer = 0;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const now = snapshot(form);
        const q = new URLSearchParams();
        for (const [k, val] of Object.entries(now)) if (val !== defaults[k]) q.set(k, val);
        const qs = q.toString();
        history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
      }, 300);
    };

    const api = {
      form,
      out: (key, text) => setOut(tool, key, text),
      state: (key, good) => setState(tool, key, good),
      set(values) { apply(form, values); run(); },
      run: () => run(),
    };

    function run() {
      update(read(form), api);
      save();
    }

    form.addEventListener('input', run);
    form.addEventListener('change', run);
    form.addEventListener('submit', (event) => event.preventDefault());

    tool.querySelectorAll('[data-tool-reset]').forEach((button) => button.addEventListener('click', () => {
      apply(form, defaults);
      run();
    }));

    tool.querySelectorAll('[data-tool-share]').forEach((button) => {
      const label = button.textContent;
      button.addEventListener('click', async () => {
        clearTimeout(timer);
        const now = snapshot(form);
        const q = new URLSearchParams();
        for (const [k, val] of Object.entries(now)) if (val !== defaults[k]) q.set(k, val);
        const url = `${window.location.origin}${window.location.pathname}${q.toString() ? `?${q}` : ''}`;
        try {
          await navigator.clipboard.writeText(url);
          button.textContent = 'Link copied';
        } catch {
          window.prompt('Copy this link:', url);
        }
        setTimeout(() => { button.textContent = label; }, 2200);
      });
    });

    run();
    return api;
  }

  /* SVG -------------------------------------------------------------------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}, text) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, val);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  root.CPLTools = { parse, fixed, sig, si, siParts, nearestE, read, snapshot, apply, mount, svg, MINUS, DASH };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CPLTools;
})(typeof window !== 'undefined' ? window : globalThis);
