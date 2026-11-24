/* PCB trace impedance: microstrip, stripline, edge-coupled pairs and grounded
   coplanar waveguide. Static (quasi-TEM) closed-form models from the literature.
   The maths is at the top and loads under Node for testing; the page wiring
   below it runs only in a browser. All lengths in one consistent unit. */
(function () {
  'use strict';

  const ETA0 = 376.730313668; // wave impedance of free space, ohms
  const C0 = 299792458; // speed of light, m/s
  const PI = Math.PI;

  /* Elliptic integrals ------------------------------------------------------ */

  // Arithmetic-geometric mean. K(k) = π / (2·AGM(1, k')) (Abramowitz and
  // Stegun 17.6); it converges quadratically, to full precision in a few steps.
  function agm(a, b) {
    for (let i = 0; i < 60 && Math.abs(a - b) > 1e-15 * a; i++) {
      const m = (a + b) / 2;
      b = Math.sqrt(a * b);
      a = m;
    }
    return (a + b) / 2;
  }

  // Complete elliptic integral of the first kind, modulus k.
  function ellipK(k) {
    return PI / (2 * agm(1, Math.sqrt((1 - k) * (1 + k))));
  }

  // K(k)/K(k'). Pass k' when it can be computed more accurately than √(1 − k²).
  function kRatio(k, kp = Math.sqrt((1 - k) * (1 + k))) {
    if (!(k > 0)) return 0;
    if (!(kp > 0)) return Infinity;
    return agm(1, k) / agm(1, kp);
  }

  /* Microstrip: Hammerstad and Jensen (1980) -------------------------------- */

  // Impedance of a zero-thickness strip in air, u = W/h. Hammerstad and Jensen
  // quote better than 0.01% for u ≤ 1 and 0.03% for u ≤ 1000.
  function hjZ01(u) {
    const f = 6 + (2 * PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528));
    return (ETA0 / (2 * PI)) * Math.log(f / u + Math.sqrt(1 + 4 / (u * u)));
  }

  // Static effective permittivity of a zero-thickness strip. Hammerstad and
  // Jensen quote better than 0.2% for εr ≤ 128 and 0.01 ≤ u ≤ 100.
  function hjEeff(u, er) {
    const a = 1 + Math.log((Math.pow(u, 4) + Math.pow(u / 52, 2)) / (Math.pow(u, 4) + 0.432)) / 49
      + Math.log(1 + Math.pow(u / 18.1, 3)) / 18.7;
    const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
    return (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / u, -a * b);
  }

  // Width corrections for strip thickness (Hammerstad and Jensen 1980):
  // du1 in air, dur in the dielectric. tn = t/h.
  function hjDeltaU(u, tn, er) {
    if (!(tn > 0)) return { du1: 0, dur: 0 };
    const th = Math.tanh(Math.sqrt(6.517 * u));
    const du1 = (tn / PI) * Math.log(1 + (4 * Math.E * th * th) / tn);
    const dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(er - 1))) * du1;
    return { du1, dur };
  }

  // Surface microstrip, Hammerstad and Jensen (1980), with their thickness
  // correction. Returns Z0 and the static effective permittivity.
  function microstrip(w, h, t, er) {
    const u = w / h;
    const { du1, dur } = hjDeltaU(u, t / h, er);
    const u1 = u + du1, ur = u + dur;
    const eR = hjEeff(ur, er);
    const z0 = hjZ01(ur) / Math.sqrt(eR);
    const eeff = eR * Math.pow(hjZ01(u1) / hjZ01(ur), 2);
    return { z0, eeff };
  }

  /* Edge-coupled microstrip: Kirschning and Jansen (1984) ------------------- */

  // Static even- and odd-mode impedances and effective permittivities of two
  // zero-thickness strips, after Kirschning and Jansen (1984). ue and uo are
  // the normalised widths used for each mode (equal when t = 0), g = s/h.
  // Their stated range is 0.1 ≤ u ≤ 10, 0.1 ≤ g ≤ 10, 1 ≤ εr ≤ 18.
  function kjStatic(ue, uo, g, er) {
    // Even mode effective permittivity.
    const v = (ue * (20 + g * g)) / (10 + g * g) + g * Math.exp(-g);
    const ae = 1 + Math.log((Math.pow(v, 4) + Math.pow(v / 52, 2)) / (Math.pow(v, 4) + 0.432)) / 49
      + Math.log(1 + Math.pow(v / 18.1, 3)) / 18.7;
    const be = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
    const eE = (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / v, -ae * be);

    // Odd mode effective permittivity, built on the single strip's value.
    const eSo = hjEeff(uo, er);
    const a0 = 0.7287 * (eSo - (er + 1) / 2) * (1 - Math.exp(-0.179 * uo));
    const b0 = (0.747 * er) / (0.15 + er);
    const c0 = b0 - (b0 - 0.207) * Math.exp(-0.414 * uo);
    const d0 = 0.593 + 0.694 * Math.exp(-0.562 * uo);
    const eO = ((er + 1) / 2 + a0 - eSo) * Math.exp(-c0 * Math.pow(g, d0)) + eSo;

    // Impedances, as corrections to the single strip in air.
    const q = (u) => {
      const Q1 = 0.8695 * Math.pow(u, 0.194);
      const Q2 = 1 + 0.7519 * g + 0.189 * Math.pow(g, 2.31);
      const Q3 = 0.1975 + Math.pow(16.6 + Math.pow(8.4 / g, 6), -0.387)
        + Math.log(Math.pow(g, 10) / (1 + Math.pow(g / 3.4, 10))) / 241;
      const Q4 = ((2 * Q1) / Q2) / (Math.exp(-g) * Math.pow(u, Q3) + (2 - Math.exp(-g)) * Math.pow(u, -Q3));
      const Q5 = 1.794 + 1.14 * Math.log(1 + 0.638 / (g + 0.517 * Math.pow(g, 2.43)));
      const Q6 = 0.2305 + Math.log(Math.pow(g, 10) / (1 + Math.pow(g / 5.8, 10))) / 281.3
        + Math.log(1 + 0.598 * Math.pow(g, 1.154)) / 5.1;
      const Q7 = (10 + 190 * g * g) / (1 + 82.3 * g * g * g);
      const Q8 = Math.exp(-6.5 - 0.95 * Math.log(g) - Math.pow(g / 0.15, 5));
      const Q9 = Math.log(Q7) * (Q8 + 1 / 16.5);
      const Q10 = Q4 - (Q5 / Q2) * Math.exp(Q6 * Math.log(u) * Math.pow(u, -Q9));
      return { Q4, Q10 };
    };
    const z1e = hjZ01(ue), z1o = hjZ01(uo); // single strip in air
    const ze = z1e / Math.sqrt(eE) / (1 - (z1e / ETA0) * q(ue).Q4);
    const zo = z1o / Math.sqrt(eO) / (1 - (z1o / ETA0) * q(uo).Q10);
    return { ze, zo, eE, eO };
  }

  // Edge-coupled surface microstrip with strip thickness. Thickness enters
  // through Jansen's even- and odd-mode width corrections (Jansen 1978):
  // du_e = du·(1 − ½·exp(−0.69·du/dt)), du_o = du_e + dt, dt = (t/h)/(g·εr).
  function coupledMicrostrip(w, s, h, t, er) {
    const u = w / h, g = s / h, tn = t / h;
    let ue = u, uo = u;
    if (tn > 0) {
      const du = hjDeltaU(u, tn, er).dur;
      const dt = tn / (g * er);
      ue = u + du * (1 - 0.5 * Math.exp((-0.69 * du) / dt));
      uo = ue + dt;
    }
    return kjStatic(ue, uo, g, er);
  }

  /* Stripline: Cohn (1954, 1955) with Wheeler's (1978) thickness ------------- */

  // Zero-thickness strip centred between planes b apart: Cohn's exact
  // conformal-mapping result, Z0 = (η0 / 4√εr)·K(k)/K(k'), k = sech(πW/2b).
  function cohnStripline(w, b, er) {
    const x = (PI * w) / (2 * b);
    return (ETA0 / (4 * Math.sqrt(er))) * kRatio(1 / Math.cosh(x), Math.tanh(x));
  }

  // Wheeler's (1978) effective width of a strip of thickness t between planes
  // b apart: the thick strip acts as a thin strip W + ΔW wide between planes
  // b − t apart. ΔW = (t/π)·[1 − ½·ln((x/(2 − x))² + (0.0796x/(W/b + 1.1x))^m)],
  // x = t/b, m = 2/(1 + ⅔·x/(1 − x)). Wheeler quotes 0.5% for W'/(b − t) < 10.
  function wheelerDeltaW(w, b, t) {
    if (!(t > 0)) return 0;
    const x = t / b;
    const m = 2 / (1 + ((2 / 3) * x) / (1 - x));
    return (t / PI) * (1 - 0.5 * Math.log(Math.pow(x / (2 - x), 2) + Math.pow((0.0796 * x) / (w / b + 1.1 * x), m)));
  }

  // Symmetric stripline: Wheeler's effective width in Cohn's exact formula.
  function stripline(w, b, t, er) {
    const z0 = cohnStripline(w + wheelerDeltaW(w, b, t), b - Math.max(t, 0), er);
    return { z0, eeff: er };
  }

  // Cohn's fringing capacitance term for a thick strip, x = t/b (Cohn 1955):
  // Cf = 2·ln((2 − x)/(1 − x)) − x·ln(x(2 − x)/(1 − x)²). Cf(0) = 2·ln 2.
  function cohnCf(x) {
    if (!(x > 0)) return 2 * Math.LN2;
    return 2 * Math.log((2 - x) / (1 - x)) - x * Math.log((x * (2 - x)) / Math.pow(1 - x, 2));
  }

  // Edge-coupled stripline. Zero thickness: Cohn's (1955) exact even and odd
  // mode results, k_e = tanh(πW/2b)·tanh(π(W + S)/2b), k_o = tanh(πW/2b)·coth(π(W + S)/2b).
  // Thickness: Cohn's corrections. Both modes scale the coupling part of the
  // admittance by Cf(t/b)/Cf(0) and add it to the thick single strip; for
  // S/t < 5 the odd mode instead adds the parallel-plate capacitance of the
  // facing edges, 2t/S, and removes their extra fringing.
  function coupledStripline(w, s, b, t, er) {
    const a = Math.tanh((PI * w) / (2 * b)), c = Math.tanh((PI * (w + s)) / (2 * b));
    const k = ETA0 / (4 * Math.sqrt(er));
    const ke = a * c, ko = a / c;
    const ze0 = k / kRatio(ke), zo0 = k / kRatio(ko);
    const tt = Math.max(t, 0);
    if (!(tt > 0)) return { ze: ze0, zo: zo0, eE: er, eO: er };
    const z0 = cohnStripline(w, b, er);
    const zt = stripline(w, b, tt, er).z0;
    const r = cohnCf(tt / b) / cohnCf(0);
    const ze = 1 / (1 / zt - r * (1 / z0 - 1 / ze0));
    let zo = 1 / (1 / zt + r * (1 / zo0 - 1 / z0));
    if (s / tt < 5) {
      const eta = ETA0 / Math.sqrt(er);
      const cfp = (x) => cohnCf(x) / (PI * (1 - x)); // fringing per corner, C/ε
      zo = 1 / (1 / zo0 + (1 / zt - 1 / z0) - (2 / eta) * (cfp(tt / b) - cfp(0)) + (2 * tt) / (eta * s));
    }
    return { ze, zo, eE: er, eO: er };
  }

  /* Grounded coplanar waveguide --------------------------------------------- */

  // Conductor-backed coplanar waveguide with wide top grounds: conformal
  // mapping (Ghione and Naldi 1987; Wadell 1991; Simons 2001).
  // k = W/(W + 2G), k3 = tanh(πW/4h)/tanh(π(W + 2G)/4h).
  // Thickness: effective strip width in the upper (air) partial capacitance
  // and the εeff reduction of Gupta et al., Δ = (1.25t/π)(1 + ln(4πW/t)).
  function cpwg(w, gap, h, t, er) {
    const k = w / (w + 2 * gap);
    const k3 = Math.tanh((PI * w) / (4 * h)) / Math.tanh((PI * (w + 2 * gap)) / (4 * h));
    const q1 = kRatio(k), q3 = kRatio(k3);
    let eeff = (q1 + er * q3) / (q1 + q3);
    let q1e = q1;
    if (t > 0) {
      const d = ((1.25 * t) / PI) * (1 + Math.log((4 * PI * w) / t));
      const ke = Math.min(k + ((1 - k * k) * d) / (2 * gap), 1 - 1e-12);
      q1e = kRatio(ke);
      eeff -= (0.7 * (eeff - 1) * t / gap) / (q1 + (0.7 * t) / gap);
    }
    const z0 = (ETA0 / 2) / Math.sqrt(eeff) / (q1e + q3);
    return { z0, eeff };
  }

  /* Field solver: 2D method of moments ------------------------------------- */

  // Quasi-static capacitance of the cross-section by the method of moments
  // (Harrington 1968): conductor surfaces are cut into flat segments with a
  // constant charge density each, and the potential is matched at segment
  // midpoints. The Green's functions include the dielectric and the ground
  // planes exactly, so only the conductors are discretised (as in Weeks 1970):
  //  - microstrip and CPWG: a grounded slab of height h under air, by images;
  //  - stripline: a homogeneous dielectric between two planes, closed form.
  // Potentials are in units of 1/(4πε), so C = 4πε0·Q.

  // ∫₀ᵘ ln(v² + d²) dv
  function lnInt(u, d) {
    d = Math.abs(d);
    const r2 = u * u + d * d;
    let r = -2 * u;
    if (r2 > 0) r += u * Math.log(r2);
    if (d > 0) r += 2 * d * Math.atan(u / d);
    return r;
  }

  // ∫ ln((xi − x')² + (yi + sg·y' + c)²) along a segment (horizontal or vertical).
  function segLn(xi, yi, s, sg, c) {
    if (s.hz) {
      const d = yi + sg * s.y1 + c;
      return lnInt(s.x2 - xi, d) - lnInt(s.x1 - xi, d);
    }
    const dx = xi - s.x1;
    return sg * (lnInt(yi + sg * s.y2 + c, dx) - lnInt(yi + sg * s.y1 + c, dx));
  }

  // Six-point Gauss-Legendre on [−1, 1].
  const G6X = [-0.9324695142031521, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969, 0.6612093864662645, 0.9324695142031521];
  const G6W = [0.1713244923791704, 0.3607615730481386, 0.4679139345726910, 0.4679139345726910, 0.3607615730481386, 0.1713244923791704];
  const G2X = 0.5773502691896257;

  // Kernel for conductors in air above a slab (height h, εr) on a ground
  // plane. With K = (εr − 1)/(εr + 1), a unit line charge at (x', y') gives
  // −[L(y − y') − K·L(y + y' − 2h) − (1 − K²)·Σ (−K)ⁿ⁻¹·L(y + y' − 2h + 2nh)],
  // L(d) = ln((x − x')² + d²): a Fourier-transform solution expanded in images.
  function slabKernel(h, er) {
    const K = (er - 1) / (er + 1);
    const cs = [], ds = [];
    if (K !== 0) { cs.push(-K); ds.push(-2 * h); }
    for (let n = 1; n < 400; n++) {
      const coef = -(1 - K * K) * Math.pow(-K, n - 1);
      if (n > 1 && Math.abs(coef) < 1e-8) break;
      cs.push(coef); ds.push(2 * (n - 1) * h);
    }
    const m = cs.length;
    return function (xi, yi, s) {
      let a = segLn(xi, yi, s, -1, 0);
      // Two Gauss points along the segment, for the distant images.
      const hx = ((s.x2 - s.x1) / 2) * G2X, hy = ((s.y2 - s.y1) / 2) * G2X;
      const dxa = xi - (s.xm - hx), dxb = xi - (s.xm + hx), dxa2 = dxa * dxa, dxb2 = dxb * dxb;
      const ya = yi + s.ym - hy, yb = yi + s.ym + hy, half = s.len / 2;
      for (let k = 0; k < m; k++) {
        const c = ds[k], d = yi + s.ym + c;
        if (s.len < 0.5 * Math.abs(d)) {
          const p = ya + c, q = yb + c;
          a += cs[k] * half * Math.log((dxa2 + p * p) * (dxb2 + q * q));
        } else {
          a += cs[k] * segLn(xi, yi, s, 1, c);
        }
      }
      return -a;
    };
  }

  // ln(2·sinh²(π·dx/2b) + 2·sin²(π·c/2b)) = ln(cosh(π·dx/b) − cos(π·c/b)), without overflow.
  function lnS(dx, c, b) {
    const al = (PI * Math.abs(dx)) / (2 * b);
    if (al > 15) return 2 * al - Math.LN2;
    const sh = Math.sinh(al), sn = Math.sin((PI * c) / (2 * b));
    return Math.log(2 * sh * sh + 2 * sn * sn);
  }

  // Kernel for a homogeneous dielectric between planes at y = 0 and y = b:
  // −ln[(cosh(πΔx/b) − cos(π(y − y')/b)) / (cosh(πΔx/b) − cos(π(y + y')/b))].
  // The logarithmic singularities are integrated exactly and the smooth
  // remainders by six-point Gauss-Legendre.
  function planesKernel(b) {
    const r0 = Math.log((PI * PI) / (2 * b * b));
    return function (xi, yi, s) {
      const l1 = segLn(xi, yi, s, -1, 0), l2 = segLn(xi, yi, s, 1, 0), l3 = segLn(xi, yi, s, 1, -2 * b);
      const hx = (s.x2 - s.x1) / 2, hy = (s.y2 - s.y1) / 2;
      let r = 0;
      for (let k = 0; k < 6; k++) {
        const x = s.xm + G6X[k] * hx, y = s.ym + G6X[k] * hy;
        const dx = xi - x, dy = yi - y, sy = yi + y, dx2 = dx * dx;
        const r1 = dx2 + dy * dy;
        const R1 = r1 > 1e-300 ? lnS(dx, dy, b) - Math.log(r1) : r0;
        const R2 = lnS(dx, sy, b) - Math.log((dx2 + sy * sy) * (dx2 + (sy - 2 * b) * (sy - 2 * b)));
        r += G6W[k] * (R1 - R2);
      }
      return -(l1 + (r * s.len) / 2 - l2 - l3);
    };
  }

  // Break [a, b] into n pieces, finer towards the ends that carry an edge
  // singularity: 'both', 'end' (at b) or 'start' (at a).
  function cuts(a, b, n, mode) {
    const p = [];
    for (let k = 0; k <= n; k++) {
      const f = mode === 'both' ? (1 - Math.cos((PI * k) / n)) / 2
        : mode === 'end' ? Math.sin((PI * k) / (2 * n))
          : 1 - Math.cos((PI * k) / (2 * n));
      p.push(a + (b - a) * f);
    }
    return p;
  }

  // n pieces growing geometrically from a first piece l0 at a.
  function geoCuts(a, b, n, l0) {
    const L = b - a;
    if (n * l0 >= L) return cuts(a, b, n, 'both');
    let lo = 1, hi = 2;
    const span = (r) => (l0 * (Math.pow(r, n) - 1)) / (r - 1);
    while (span(hi) < L) hi *= 2;
    for (let i = 0; i < 80; i++) { const r = (lo + hi) / 2; if (span(r) < L) lo = r; else hi = r; }
    const r = (lo + hi) / 2, p = [a];
    let x = a, l = l0;
    for (let k = 1; k < n; k++) { x += l; l *= r; p.push(x); }
    p.push(b);
    return p;
  }

  function addSegs(list, xs, ys, cond) {
    for (let k = 0; k < xs.length - 1; k++) {
      const x1 = Math.min(xs[k], xs[k + 1]), x2 = Math.max(xs[k], xs[k + 1]);
      const y1 = Math.min(ys[k], ys[k + 1]), y2 = Math.max(ys[k], ys[k + 1]);
      const hz = y1 === y2;
      const len = hz ? x2 - x1 : y2 - y1;
      if (len > 0) list.push({ x1, x2, y1, y2, hz, len, xm: (x1 + x2) / 2, ym: (y1 + y2) / 2, cond });
    }
  }

  // Segments of a rectangle [x1, x2] × [y, y + t] (t = 0 gives a flat strip).
  // half = true: the rectangle starts on the symmetry line x = 0, so its left
  // side is omitted and only the right-hand edge is refined.
  // l0 > 0: a wide ground, meshed geometrically from its inner edge at x1.
  function rectSegs(list, x1, x2, y, t, cond, n, half, l0) {
    const nh = Math.max(4, Math.round(n));
    const xs = l0 ? geoCuts(x1, x2, nh, l0) : cuts(x1, x2, nh, half ? 'end' : 'both');
    const flat = (yy) => xs.map(() => yy);
    addSegs(list, xs, flat(y + t), cond);
    if (t > 0) {
      addSegs(list, xs, flat(y), cond);
      const nv = Math.max(3, Math.round(n / 4));
      const ys = cuts(y, y + t, nv, 'both');
      addSegs(list, ys.map(() => x2), ys, cond);
      if (!half) addSegs(list, ys.map(() => x1), ys, cond);
    }
  }

  // Dense LU solve with partial pivoting; A is overwritten.
  function luSolve(A, rhs, n) {
    const x = Float64Array.from(rhs);
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > max) { max = v; p = i; } }
      if (!(max > 0)) return null;
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = x[k]; x[k] = x[p]; x[p] = t;
      }
      const piv = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / piv;
        if (f === 0) continue;
        for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
        x[i] -= f * x[k];
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
      x[i] = s / A[i * n + i];
    }
    return x;
  }

  // Charge on conductor 0 (right half only) with conductor potentials v, for
  // a structure symmetric about x = 0 (sym = +1) or antisymmetric (−1).
  function moments(segs, kernel, v, sym) {
    const n = segs.length;
    const A = new Float64Array(n * n);
    const rhs = new Float64Array(n);
    const mirror = segs.map((sj) => ({ x1: -sj.x2, x2: -sj.x1, y1: sj.y1, y2: sj.y2, hz: sj.hz, len: sj.len, xm: -sj.xm, ym: sj.ym }));
    for (let i = 0; i < n; i++) {
      const si = segs[i];
      rhs[i] = v[si.cond];
      for (let j = 0; j < n; j++) A[i * n + j] = kernel(si.xm, si.ym, segs[j]) + sym * kernel(si.xm, si.ym, mirror[j]);
    }
    const q = luSolve(A, rhs, n);
    if (!q) return NaN;
    let Q = 0;
    for (let j = 0; j < n; j++) if (segs[j].cond === 0) Q += q[j] * segs[j].len;
    return Q;
  }

  // The structure's right half. p: { kind: 'ms' | 'sl' | 'dms' | 'dsl' | 'cpwg',
  // w, t, er, h (slab), h1 and h2 (stripline: dielectric below and above the
  // trace), s (pair spacing), g (CPWG gap) }. q scales the segment counts.
  function fieldSolve(p, q = 1) {
    const t = p.t > 1e-3 * Math.min(p.w, p.h || Infinity, p.h1 || Infinity, p.h2 || Infinity, p.s || Infinity, p.g || Infinity) ? p.t : 0;
    const planes = p.kind === 'sl' || p.kind === 'dsl';
    const y0 = planes ? p.h1 : p.h;
    // Narrow gaps need finer segments near the facing edges.
    const gap = Math.min(p.kind === 'cpwg' ? p.g : p.kind[0] === 'd' ? p.s : Infinity, Infinity);
    const n = 16 * q * (gap < 0.3 * p.w ? 2 : 1);
    const half = [], pair = [];
    if (p.kind === 'dms' || p.kind === 'dsl') {
      rectSegs(pair, p.s / 2, p.s / 2 + p.w, y0, t, 0, 1.5 * n, false);
    } else {
      rectSegs(half, 0, p.w / 2, y0, t, 0, n, true);
      if (p.kind === 'cpwg') {
        // Wide coplanar grounds; their far edges are distant enough not to matter.
        const x1 = p.w / 2 + p.g;
        const lg = Math.max(12 * p.h, 4 * (p.w + 2 * p.g));
        rectSegs(half, x1, x1 + lg, y0, t, 1, 2.5 * n, false, 0.01 * Math.min(p.g, p.w));
      }
    }
    if (planes) {
      const b = p.h1 + t + p.h2;
      const k = planesKernel(b);
      // Homogeneous dielectric: one solve; C = εr·Ca.
      if (pair.length) {
        const qe = moments(pair, k, [1], 1), qo = moments(pair, k, [1], -1);
        return { ze: ETA0 / (4 * PI * Math.sqrt(p.er) * qe), zo: ETA0 / (4 * PI * Math.sqrt(p.er) * qo), eE: p.er, eO: p.er };
      }
      const q0 = 2 * moments(half, k, [1, 0], 1);
      return { z0: ETA0 / (4 * PI * Math.sqrt(p.er) * q0), eeff: p.er };
    }
    const kd = slabKernel(p.h, p.er), ka = slabKernel(p.h, 1);
    if (pair.length) {
      const de = moments(pair, kd, [1], 1), ae = moments(pair, ka, [1], 1);
      const dO = moments(pair, kd, [1], -1), aO = moments(pair, ka, [1], -1);
      return { ze: ETA0 / (4 * PI * Math.sqrt(de * ae)), zo: ETA0 / (4 * PI * Math.sqrt(dO * aO)), eE: de / ae, eO: dO / aO };
    }
    const d = 2 * moments(half, kd, [1, 0], 1), a = 2 * moments(half, ka, [1, 0], 1);
    return { z0: ETA0 / (4 * PI * Math.sqrt(d * a)), eeff: d / a };
  }

  /* Results for the page ---------------------------------------------------- */

  const DIFF = { dms: true, dsl: true };

  // Analysis by the field solver. p: { k: 'ms' | 'sl' | 'dms' | 'dsl' | 'cpwg',
  // w, t, er, h (microstrip and CPWG), h1, h2 (stripline: dielectric below and
  // above the trace), s (pair spacing), g (CPWG gap) }, lengths in one unit.
  function analyse(p) {
    const r = fieldSolve({ ...p, kind: p.k });
    if (!DIFF[p.k]) {
      return { diff: false, main: r.z0, z0: r.z0, eeff: r.eeff, delay: Math.sqrt(r.eeff) / C0 };
    }
    const one = fieldSolve({ ...p, kind: p.k === 'dms' ? 'ms' : 'sl' });
    return {
      diff: true, main: 2 * r.zo, zdiff: 2 * r.zo, zo: r.zo, ze: r.ze, zcm: r.ze / 2,
      kc: (r.ze - r.zo) / (r.ze + r.zo), eO: r.eO, eE: r.eE, eeff: r.eO,
      delay: Math.sqrt(r.eO) / C0, delayE: Math.sqrt(r.eE) / C0, single: one.z0,
    };
  }

  // The classic closed-form result for the same inputs, for comparison: Z0,
  // or Zdiff for a pair. NaN where there is no closed form (offset stripline).
  function closedForm(p) {
    const b = p.h1 + p.h2 + p.t;
    const sym = Math.abs(p.h1 - p.h2) <= 1e-9 * b;
    switch (p.k) {
      case 'ms': return microstrip(p.w, p.h, p.t, p.er).z0;
      case 'sl': return sym ? stripline(p.w, b, p.t, p.er).z0 : NaN;
      case 'dms': return 2 * coupledMicrostrip(p.w, p.s, p.h, p.t, p.er).zo;
      case 'dsl': return sym ? 2 * coupledStripline(p.w, p.s, b, p.t, p.er).zo : NaN;
      case 'cpwg': return cpwg(p.w, p.g, p.h, p.t, p.er).z0;
      default: return NaN;
    }
  }

  // Solve one dimension, which = 'w' (width), 's' (pair spacing) or 'g'
  // (CPWG gap), for a target Z0, or Zdiff for a pair. Z falls as the width
  // grows and rises with spacing or gap. The search starts from the closed-form
  // answer, brackets the root in steps of 1.3×, then refines by the Illinois
  // method on ln(x) and ln(Z). Returns NaN when the target is out of reach in
  // 0.01 to 50 times the dielectric height (20 times for spacing and gap).
  function solveFor(p, which, target, f = (q) => analyse(q).main) {
    const ref = p.k === 'sl' || p.k === 'dsl' ? p.h1 + p.h2 + p.t : p.h;
    const lo = 0.01 * ref, hi = (which === 'w' ? 50 : 20) * ref;
    const dir = which === 'w' ? -1 : 1; // sign of d(ln Z)/d(ln x)
    const err = (q, x) => Math.log(q({ ...p, [which]: x }) / target);

    // Starting point from the closed form, where it exists and is sensible.
    let x0 = p[which];
    const cf = (q) => closedForm(q);
    if (Number.isFinite(cf(p))) {
      // Scan a log grid for the first sign change, then bisect.
      let ua = NaN, ea = NaN;
      for (let i = 0; i <= 48; i++) {
        const u = Math.log(lo) + (i / 48) * Math.log(hi / lo), e = err(cf, Math.exp(u));
        if (!Number.isFinite(e)) continue;
        if (Number.isFinite(ea) && (e < 0) !== (ea < 0)) {
          let ub = u;
          for (let k = 0; k < 50; k++) {
            const m = (ua + ub) / 2, em = err(cf, Math.exp(m));
            if (!Number.isFinite(em)) break;
            if ((em < 0) === (ea < 0)) ua = m; else ub = m;
          }
          x0 = Math.exp((ua + ub) / 2);
          break;
        }
        ua = u; ea = e;
      }
    }
    if (!(x0 > lo && x0 < hi)) x0 = Math.min(Math.max(x0 || ref, lo * 1.01), hi / 1.01);

    // Bracket.
    let xa = x0, ea = err(f, xa);
    if (!Number.isFinite(ea)) return NaN;
    if (Math.abs(ea) < 1e-6) return xa;
    const step = (ea > 0) === (dir < 0) ? 1.3 : 1 / 1.3;
    let xb = xa, eb = ea;
    for (let i = 0; i < 60; i++) {
      xb = xa * step;
      if (xb < lo || xb > hi) return NaN;
      eb = err(f, xb);
      if (!Number.isFinite(eb)) return NaN;
      if ((eb < 0) !== (ea < 0)) break;
      xa = xb; ea = eb;
    }
    if ((eb < 0) === (ea < 0)) return NaN;

    // Illinois (modified regula falsi) on u = ln x.
    let ua = Math.log(xa), ub = Math.log(xb), side = 0;
    for (let i = 0; i < 40; i++) {
      const u = (ua * eb - ub * ea) / (eb - ea);
      const e = err(f, Math.exp(u));
      if (!Number.isFinite(e)) return NaN;
      if (Math.abs(e) < 2e-6 || Math.abs(ub - ua) < 1e-7) return Math.exp(u);
      if ((e < 0) === (eb < 0)) { ub = u; eb = e; if (side === -1) ea /= 2; side = -1; }
      else { ua = u; ea = e; if (side === 1) eb /= 2; side = 1; }
    }
    return Math.exp((ua + ub) / 2);
  }

  const maths = { ETA0, C0, agm, ellipK, kRatio, hjZ01, hjEeff, hjDeltaU, microstrip, kjStatic, coupledMicrostrip, cohnStripline, wheelerDeltaW, stripline, cohnCf, coupledStripline, cpwg, lnInt, slabKernel, planesKernel, fieldSolve, analyse, closedForm, solveFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = maths; return; }

  /* Page ------------------------------------------------------------------- */

  const T = window.CPLTools;
  const tool = document.querySelector('[data-tool="trace-impedance"]');
  if (!T || !tool) return;

  const form = tool.querySelector('form');
  const fig = tool.querySelector('[data-ti-figure]');
  const warnEl = tool.querySelector('[data-ti-warn]');
  const applyBtn = tool.querySelector('[data-ti-apply]');

  const MIL = 0.0254; // mm per mil
  const LENGTHS = ['w', 't', 'h', 'h1', 'h2', 's', 'g'];
  const NEEDS = { ms: ['w', 't', 'h'], sl: ['w', 't', 'h1', 'h2'], dms: ['w', 't', 'h', 's'], dsl: ['w', 't', 'h1', 'h2', 's'], cpwg: ['w', 't', 'h', 'g'] };
  const METHOD = {
    ms: 'Hammerstad and Jensen',
    sl: 'Cohn, with Wheeler’s thickness correction',
    dms: 'Kirschning and Jansen, with Jansen’s thickness correction',
    dsl: 'Cohn, with his thickness correction',
    cpwg: 'conformal mapping, with the Gupta et al. thickness correction',
  };
  // Starting values for each structure, in mm. Switching structure moves a
  // field to the new structure's value only if it still holds a starting value.
  const START = {
    ms: { w: 0.35, target: 50 },
    sl: { w: 0.14, target: 50 },
    dms: { w: 0.22, s: 0.15, target: 100 },
    dsl: { w: 0.1, s: 0.2, target: 100 },
    cpwg: { w: 0.3, g: 0.15, target: 50 },
  };

  let units = 'mm', kind = 'ms';
  const scale = () => (units === 'mil' ? MIL : 1);
  const fmt = (x) => String(Number(x.toPrecision(4)));
  const num = (name) => T.parse(form.elements[name].value);
  const ohms = (x) => (Number.isFinite(x) ? T.fixed(x, x < 10 ? 2 : 1) : T.DASH);

  // Unit toggle: convert every length so the geometry stays the same.
  function setUnits(next) {
    if (next === units) return;
    const k = (units === 'mil' ? MIL : 1) / (next === 'mil' ? MIL : 1);
    for (const n of LENGTHS) {
      const x = num(n);
      if (Number.isFinite(x)) form.elements[n].value = fmt(x * k);
    }
    units = next;
  }

  function setKind(next) {
    if (next === kind || !START[next]) return;
    for (const name of ['w', 's', 'g', 'target']) {
      const want = START[next][name];
      if (want === undefined) continue;
      const u = name === 'target' ? 1 : scale();
      const cur = num(name);
      const untouched = Object.values(START).some((d) => d[name] !== undefined && Math.abs(cur - Number(fmt(d[name] / u))) <= 1e-3 * (d[name] / u));
      if (untouched) form.elements[name].value = fmt(want / u);
    }
    kind = next;
  }

  // These run before the form's own listeners, so the values change first.
  form.querySelectorAll('input[name="units"]').forEach((r) => ['input', 'change'].forEach((e) => r.addEventListener(e, () => setUnits(r.value))));
  form.querySelectorAll('input[name="k"]').forEach((r) => ['input', 'change'].forEach((e) => r.addEventListener(e, () => setKind(r.value))));

  tool.querySelectorAll('[data-ti-oz]').forEach((b) => b.addEventListener('click', () => {
    form.elements.t.value = fmt(Number(b.dataset.tiOz) / scale());
    form.dispatchEvent(new Event('change'));
  }));

  let solved = null;
  applyBtn.addEventListener('click', () => {
    if (!solved) return;
    form.elements[solved.name].value = solved.text;
    form.dispatchEvent(new Event('change'));
  });

  // Small cache: one click fires both input and change.
  const cache = new Map();
  function memo(key, fn) {
    if (cache.has(key)) return cache.get(key);
    const r = fn();
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    cache.set(key, r);
    return r;
  }

  function rangeProblem(p) {
    const ref = p.k === 'sl' || p.k === 'dsl' ? p.h1 + p.h2 + p.t : p.h;
    const r = (x) => x / ref;
    const ok = (x) => x >= 0.005 && x <= 100;
    if (!ok(r(p.w)) || (p.s !== undefined && !ok(r(p.s))) || (p.g !== undefined && !ok(r(p.g)))
      || r(p.t) > 2 || p.t > 5 * p.w || (p.h1 !== undefined && (r(p.h1) < 0.01 || r(p.h2) < 0.01))) {
      return 'Outside the range this calculator handles. Keep W, S and G between 0.005 and 100 times the dielectric height, T below twice the height and five times the width, and H1 and H2 above 1% of the plane spacing.';
    }
    return '';
  }

  /* Synthesis runs just after the analysis, so typing stays responsive. */

  let solveTimer = 0, solveKey = '';
  function scheduleSolve(p, which, target, r, ui) {
    const word = which === 'w' ? 'width' : which === 's' ? 'spacing' : 'gap';
    const u = units;
    ui.out('solveLabel', word[0].toUpperCase() + word.slice(1) + ' for ' + Number(target.toPrecision(4)) + ' Ω');
    applyBtn.textContent = 'Use this ' + word;
    const key = JSON.stringify([p, which, target, u]);
    if (key === solveKey) return;
    solveKey = key;
    clearTimeout(solveTimer);
    solved = null;
    applyBtn.disabled = true;
    ui.out('solve', '…');
    ui.out('solveUnit', u);
    ui.out('solveNote', '');
    solveTimer = setTimeout(() => {
      const x = memo('solve' + key, () => solveFor(p, which, target));
      if (key !== solveKey) return;
      if (Number.isFinite(x)) {
        const text = T.sig(x / (u === 'mil' ? MIL : 1), 3);
        ui.out('solve', text);
        solved = { name: which, text };
        applyBtn.disabled = false;
        return;
      }
      ui.out('solve', T.DASH);
      let why = 'Out of reach: the ' + word + ' would have to be outside 0.01 to ' + (which === 'w' ? 50 : 20) + ' times the dielectric height.';
      if (which === 's' && target >= 2 * r.single) why = 'Out of reach: however far apart, the pair only approaches twice the impedance of one trace, ' + T.fixed(2 * r.single, 1) + ' Ω. Use narrower traces.';
      if (which === 'g' && r.ms && target >= r.ms) why = 'Out of reach: with the grounds far away this is a plain microstrip of ' + T.fixed(r.ms, 1) + ' Ω, the most it can reach. Use a narrower trace.';
      ui.out('solveNote', why);
    }, 60);
  }

  /* Cross-section ----------------------------------------------------------- */

  let lastDraw = null;
  function draw(p, label) {
    lastDraw = [p, label];
    fig.replaceChildren();
    if (!p) return;
    // A narrower drawing on small screens keeps the labels legible.
    const VW = fig.getBoundingClientRect().width < 480 ? 420 : 640;
    fig.setAttribute('viewBox', '0 30 ' + VW + ' 206');
    const add = (tag, attrs, text) => fig.append(T.svg(tag, attrs, text));
    const planes = p.k === 'sl' || p.k === 'dsl', pair = p.k === 'dms' || p.k === 'dsl', cpw = p.k === 'cpwg';
    const L = VW === 640 ? 40 : 8, R = VW - 84, cx = (L + R) / 2 + 10, base = 222;

    // One scale where it fits; heights are clamped so thin or thick stacks stay readable.
    const stack = planes ? p.h1 + p.t + p.h2 : p.h;
    const core = pair ? 2 * p.w + p.s : cpw ? p.w + 2 * p.g : p.w;
    const sx = (R - L - 40) / (core * 1.5 + 1.5 * stack);
    let sy = sx;
    const maxStack = 110;
    if (stack * sy < 56) sy = 56 / stack;
    if (stack * sy > maxStack) sy = maxStack / stack;
    const tp = Math.min(Math.max(p.t * sy, p.t > 0 ? 3 : 1.5), 20);
    const px = (x) => Math.max(x * sx, 3);
    const wp = px(p.w);

    const dim = (x1, y1, x2, y2) => add('line', { class: 'ti-dim', x1, y1, x2, y2 });
    function hdim(x1, x2, y, text, from) {
      dim(x1, from, x1, y - 4); dim(x2, from, x2, y - 4); dim(x1, y, x2, y);
      add('text', { class: 'chart-text-hi', x: (x1 + x2) / 2, y: y - 7, 'text-anchor': 'middle' }, text);
    }
    function vdim(x, y1, y2, text) {
      dim(x, y1, x, y2); dim(x - 4, y1, x + 4, y1); dim(x - 4, y2, x + 4, y2);
      add('text', { class: 'chart-text-hi', x: x + 8, y: (y1 + y2) / 2 + 4 }, text);
    }

    // Planes and dielectric.
    const hp = planes ? p.h1 * sy : p.h * sy;
    const top = planes ? base - stack * sy : base - hp; // top of the dielectric
    add('rect', { class: 'ti-gnd', x: L, y: base, width: R - L, height: 8 });
    add('rect', { class: 'ti-diel', x: L, y: top, width: R - L, height: base - top });
    if (planes) add('rect', { class: 'ti-gnd', x: L, y: top - 8, width: R - L, height: 8 });
    add('text', { class: 'chart-text', x: R - 8, y: base - 8, 'text-anchor': 'end' }, 'εr ' + Number(p.er.toPrecision(4)));

    // Traces: the bottom of the copper sits at yb.
    const yb = planes ? base - hp : top;
    const yt = yb - tp;
    const traces = pair ? [cx - (p.s * sx) / 2 - wp, cx + (p.s * sx) / 2] : [cx - wp / 2];
    traces.forEach((x) => add('rect', { class: 'ti-cu', x, y: yt, width: wp, height: tp }));

    if (cpw) {
      const gp = px(p.g);
      const g1 = cx - wp / 2 - gp, g2 = cx + wp / 2 + gp;
      add('rect', { class: 'ti-gnd', x: L, y: yt, width: g1 - L, height: tp });
      add('rect', { class: 'ti-gnd', x: g2, y: yt, width: R - 24 - g2, height: tp });
      for (const x of [g1 - 14, g1 - 50, g2 + 14, g2 + 50]) {
        if (x > L + 112 && x < R - 60) add('line', { class: 'ti-via', x1: x, y1: yb, x2: x, y2: base });
      }
      hdim(g2 - gp, g2, yt - 32, 'G ' + label(p.g), yt);
      vdim(R - 18, yt, yb, 'T ' + label(p.t));
    }

    // Dimensions above the copper, or above the top plane for stripline.
    const above = planes ? top - 8 : yt;
    const right = traces[traces.length - 1] + wp;
    hdim(traces[0], traces[0] + wp, above - 12, 'W ' + label(p.w), yt);
    if (pair) hdim(traces[0] + wp, traces[1], above - 32, 'S ' + label(p.s), yt);
    if (!cpw) vdim(Math.min(right + 10, R - 70), yt, yb, 'T ' + label(p.t));

    if (planes) {
      vdim(L + 12, yb, base, 'H1 ' + label(p.h1));
      vdim(L + 12, top, yt, 'H2 ' + label(p.h2));
    } else {
      vdim(L + 12, top, base, 'H ' + label(p.h));
    }

    const what = { ms: 'microstrip', sl: 'stripline', dms: 'edge-coupled microstrip pair', dsl: 'edge-coupled stripline pair', cpwg: 'grounded coplanar waveguide' }[p.k];
    fig.setAttribute('aria-label', 'Cross-section of a ' + what + ': trace width ' + label(p.w) + ', copper ' + label(p.t)
      + (pair ? ', spacing ' + label(p.s) : '') + (cpw ? ', gap ' + label(p.g) : '')
      + (planes ? ', ' + label(p.h1) + ' of dielectric below and ' + label(p.h2) + ' above' : ', on ' + label(p.h) + ' of dielectric')
      + ', Dk ' + Number(p.er.toPrecision(4)) + '.');
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (lastDraw) draw(...lastDraw); }, 150);
  });

  /* Update ------------------------------------------------------------------ */

  const OUT = ['main', 'zo', 'ze', 'zcm', 'single', 'kc', 'eeff', 'eE', 'dmm', 'din', 'vel', 'cap', 'ind'];

  T.mount(tool, (v, ui) => {
    units = v.units === 'mil' ? 'mil' : 'mm';
    kind = NEEDS[v.k] ? v.k : 'ms';
    const f = scale(), u = units;
    const diff = kind === 'dms' || kind === 'dsl', cpw = kind === 'cpwg';
    const label = (x) => T.sig(x / f, 3) + ' ' + u;

    tool.querySelectorAll('[data-ti-for]').forEach((el) => { el.hidden = !el.dataset.tiFor.split(' ').includes(kind); });
    tool.querySelectorAll('[data-ti-show]').forEach((el) => { el.hidden = (el.dataset.tiShow === 'diff') !== diff; });
    tool.querySelectorAll('[data-ti-unit]').forEach((el) => { el.textContent = u; });
    ui.out('solveX', cpw ? 'Gap' : 'Spacing');
    ui.out('mainLabel', diff ? 'Differential impedance, Zdiff' : 'Characteristic impedance, Z0');
    ui.out('targetLabel', diff ? 'Target Zdiff' : 'Target Z0');
    ui.out('eeffLabel', diff ? 'Effective permittivity, odd' : 'Effective permittivity');
    ui.out('delayLabel', diff ? 'Delay, odd mode' : 'Propagation delay');
    ui.out('delayLabel2', diff ? 'Delay, odd mode' : 'Propagation delay');
    ui.out('capUnit', u === 'mil' ? 'pF/inch' : 'pF/mm');
    ui.out('indUnit', u === 'mil' ? 'nH/inch' : 'nH/mm');
    const which = (diff || cpw) && v.solve === 'x' ? (cpw ? 'g' : 's') : 'w';

    const bad = NEEDS[kind].concat(['er', 'target']).some((n) => form.elements[n].getAttribute('aria-invalid') === 'true');
    const p = { k: kind, er: v.er };
    for (const n of NEEDS[kind]) p[n] = v[n] * f;
    const problem = bad ? 'Check the highlighted values.' : rangeProblem(p);

    if (problem) {
      OUT.forEach((k) => ui.out(k, T.DASH));
      ui.out('verdict', problem);
      ui.out('check', '');
      ui.out('solve', T.DASH);
      ui.out('solveNote', '');
      clearTimeout(solveTimer);
      solveKey = '';
      solved = null;
      applyBtn.disabled = true;
      warnEl.hidden = true;
      draw(null);
      return;
    }

    const key = JSON.stringify(p);
    const r = memo(key, () => {
      const a = analyse(p);
      if (cpw) a.ms = fieldSolve({ ...p, kind: 'ms' }).z0;
      return a;
    });
    if (!Number.isFinite(r.main)) {
      OUT.forEach((k) => ui.out(k, T.DASH));
      ui.out('verdict', 'The solver could not find a result for these values.');
      draw(p, label);
      return;
    }

    ui.out('main', ohms(r.main));
    const dz = r.main - v.target, pc = (100 * dz) / v.target;
    const tgt = Number(v.target.toPrecision(4)) + ' Ω target';
    ui.out('verdict', Math.abs(pc) < 0.5 ? 'Within 0.5% of the ' + tgt + '.'
      : T.fixed(Math.abs(dz), 1) + ' Ω (' + T.fixed(Math.abs(pc), 1) + '%) ' + (dz > 0 ? 'above' : 'below') + ' the ' + tgt + '.');

    const ps = r.delay * 1e12 * 1e-3; // ps per mm
    ui.out('eeff', T.fixed(r.eeff, 2));
    ui.out('dmm', T.fixed(ps, 2));
    ui.out('din', T.fixed(ps * 25.4, 1));
    ui.out('vel', T.fixed(100 / Math.sqrt(r.eeff), 1));
    if (diff) {
      ui.out('zo', ohms(r.zo));
      ui.out('ze', ohms(r.ze));
      ui.out('zcm', ohms(r.zcm));
      ui.out('single', ohms(r.single));
      ui.out('kc', T.fixed(r.kc, 3));
      ui.out('eE', T.fixed(r.eE, 2));
    } else {
      const per = u === 'mil' ? 0.0254 : 1e-3; // metres per inch, or per mm
      ui.out('cap', T.sig((Math.sqrt(r.eeff) / (C0 * r.z0)) * 1e12 * per, 3));
      ui.out('ind', T.sig(((r.z0 * Math.sqrt(r.eeff)) / C0) * 1e9 * per, 3));
    }

    // Warnings that do not stop the calculation.
    const warn = [];
    if (diff && r.kc < 0.01) warn.push('The traces barely couple at this spacing, so Zdiff is close to twice the single-ended impedance.');
    if (cpw && Math.abs(r.main / r.ms - 1) < 0.01) warn.push('The coplanar grounds are far enough away to make little difference: this is close to a plain microstrip (' + T.fixed(r.ms, 1) + ' Ω).');
    if (p.t > p.w) warn.push('The copper is thicker than the trace is wide. Real traces this shape etch to a strong trapezoid, so treat the result as rough.');
    const gap = diff ? p.s : cpw ? p.g : Infinity;
    if (gap < p.t) warn.push('The gap is narrower than the copper is thick. Check that your fab can etch it.');
    warnEl.textContent = warn.join(' ');
    warnEl.hidden = warn.length === 0;

    // Closed-form comparison.
    const cf = closedForm(p);
    if (Number.isFinite(cf)) {
      const d = (100 * (cf - r.main)) / r.main;
      let text = 'Closed-form check (' + METHOD[kind] + '): ' + ohms(cf) + ' Ω, ' + (Math.abs(d) < 0.05 ? 'the same as the field solution.' : T.fixed(Math.abs(d), 1) + '% ' + (d > 0 ? 'above' : 'below') + ' the field solution.');
      if (Math.abs(d) > 2) {
        const p0 = { ...p, t: 0 };
        const f0 = memo(JSON.stringify(p0), () => analyse(p0)).main, c0 = closedForm(p0);
        if (p.t > 0 && Math.abs(c0 / f0 - 1) < 0.01) text += ' Nearly all of the difference is the copper thickness: the classic corrections were developed for metal much thinner than these gaps.';
        else if (cpw && p.g > p.h) text += ' The conformal-mapping CPWG formula loses accuracy once the gap is wider than the dielectric height.';
      }
      ui.out('check', text);
    } else {
      ui.out('check', 'There is no closed form here for offset stripline, so only the field solution is shown.');
    }

    draw(p, label);
    scheduleSolve(p, which, v.target, r, ui);
  });
})();
