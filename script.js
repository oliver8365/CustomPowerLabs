(() => {
  'use strict';

  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const pad3 = (n) => String(n).padStart(3, '0');

  // Analytics and the cookie choice. Google Analytics is fetched only after the
  // visitor accepts; until then the site sets no cookies and contacts no third
  // party. The choice is kept in localStorage, a small card asks for it once,
  // and the footer's "Cookie settings" brings the card back.
  (() => {
    const GA_ID = 'G-LR9Z0N8S60';
    const KEY = 'cpl-analytics';
    const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
    const save = (value) => { try { localStorage.setItem(KEY, value); } catch (e) { /* private mode: ask again next time */ } };
    let fetched = false;

    const start = () => {
      window[`ga-disable-${GA_ID}`] = false;
      if (fetched) return;
      fetched = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', {
        analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      });
      window.gtag('js', new Date());
      window.gtag('config', GA_ID);
      if (/^\/thank-you/.test(window.location.pathname)) window.gtag('event', 'generate_lead');
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      document.head.appendChild(tag);
    };

    const stop = () => {
      window[`ga-disable-${GA_ID}`] = true;
      const host = window.location.hostname;
      const domains = ['', host, `.${host.replace(/^www\./, '')}`];
      document.cookie.split(';').forEach((pair) => {
        const name = pair.split('=')[0].trim();
        if (!/^_ga/.test(name)) return;
        domains.forEach((domain) => {
          document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
        });
      });
    };

    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text) el.textContent = text;
      return el;
    };
    let card = null;
    let state = null;
    let opener = null;
    const describe = () => {
      const choice = read();
      state.textContent = choice === 'yes' ? 'Analytics are on.' : choice === 'no' ? 'Analytics are off.' : '';
    };
    const close = () => {
      if (!card) return;
      card.classList.remove('is-open');
      if (opener) { opener.focus(); opener = null; }
    };
    const choose = (value) => {
      save(value);
      if (value === 'yes') start(); else stop();
      close();
    };
    const build = () => {
      card = make('section', 'consent');
      card.setAttribute('aria-label', 'Cookie choice');
      card.tabIndex = -1;
      const text = make('p', '', 'We would like to count visits with Google Analytics. No cookies are set unless you accept. ');
      const link = make('a', '', 'Privacy');
      link.href = '/privacy';
      text.appendChild(link);
      const actions = make('div', 'consent-actions');
      const no = make('button', 'btn btn-small btn-ghost', 'Decline');
      const yes = make('button', 'btn btn-small', 'Accept');
      no.type = yes.type = 'button';
      no.addEventListener('click', () => choose('no'));
      yes.addEventListener('click', () => choose('yes'));
      actions.append(no, yes);
      state = make('p', 'consent-state');
      card.append(make('p', 'consent-title', 'Cookies'), text, actions, state);
      card.addEventListener('keydown', (event) => { if (event.key === 'Escape' && read()) close(); });
      document.body.appendChild(card);
    };
    const open = (from) => {
      if (!card) build();
      describe();
      opener = from || null;
      // Two frames, so the card's starting position is painted before it moves.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        card.classList.add('is-open');
        if (from) card.focus();
      }));
    };

    const choice = read();
    if (choice === 'yes') start();
    // No answer yet: ask, a moment after the page has settled. A browser that
    // sends the Global Privacy Control signal has already answered no.
    else if (choice === null && !navigator.globalPrivacyControl) setTimeout(() => open(), 1800);

    const social = document.querySelector('.footer-social');
    if (social) {
      const button = make('button', '', 'Cookie settings');
      button.type = 'button';
      button.dataset.cookieSettings = '';
      social.prepend(button);
    }
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cookie-settings]');
      if (button) open(button);
    });
  })();

  // Header: transparent at the very top of the page, solid once scrolled.
  if (header) {
    const onScroll = () => header.classList.toggle('is-top', window.scrollY < 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile navigation.
  if (header && toggle && nav) {
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open) => {
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', () => setOpen(!isOpen()));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Scroll reveal. Only elements below the fold are hidden, so content stays
  // visible if this script never runs or the user prefers reduced motion.
  const reveals = document.querySelectorAll('.reveal');

  if (reveals.length && 'IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.replace('is-pending', 'is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    reveals.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add('is-pending');
      observer.observe(el);
    });
  }

  // Hero figure: a scan line climbs the line drawing and leaves the rendered
  // machine behind it. Afterwards a pointer acts as an x-ray lens back to the
  // drawing, and a click or tap replays the scan. Without this script, or with
  // reduced motion, the stylesheet just shows the render.
  document.querySelectorAll('[data-scan]').forEach((figure) => {
    const art = figure.querySelector('.scan-art');
    const render = figure.querySelector('.scan-render');
    const blueprint = figure.querySelector('.scan-blueprint');
    const status = figure.querySelector('.scan-status');
    const canMask = window.CSS && CSS.supports &&
      (CSS.supports('mask-composite', 'intersect') || CSS.supports('-webkit-mask-composite', 'source-in'));
    if (!art || !render || !blueprint || reducedMotion || !canMask) {
      figure.classList.add('is-plain');
      return;
    }

    const START = -3;
    const END = 103;
    let scan = START;
    let lens = 0;
    let lensTarget = 0;
    let sweep = null;
    let frame = 0;
    let timer = 0;

    const apply = () => {
      figure.style.setProperty('--scan', scan.toFixed(2));
      figure.style.setProperty('--lens', `${Math.max(0.1, lens).toFixed(1)}px`);
    };
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const tick = (now) => {
      frame = 0;
      let busy = false;
      if (sweep) {
        const t = clamp((now - sweep.start) / sweep.duration);
        scan = START + (END - START) * ease(t);
        if (status) status.textContent = `Rendering ${pad3(Math.round(clamp(scan / 100) * 100))}%`;
        if (t < 1) {
          busy = true;
        } else {
          sweep = null;
          figure.classList.remove('is-scanning');
          figure.classList.add('is-done');
          if (status) status.textContent = '';
        }
      }
      if (Math.abs(lensTarget - lens) > 0.5) {
        lens += (lensTarget - lens) * 0.2;
        busy = true;
      } else {
        lens = lensTarget;
      }
      apply();
      if (busy) frame = requestAnimationFrame(tick);
    };
    const kick = () => { if (!frame) frame = requestAnimationFrame(tick); };

    const run = (delay) => {
      clearTimeout(timer);
      sweep = null;
      scan = START;
      lens = lensTarget = 0;
      apply();
      figure.classList.remove('is-done', 'is-scanning');
      if (status) status.textContent = 'Wireframe';
      timer = setTimeout(() => {
        figure.classList.add('is-scanning');
        sweep = { start: performance.now(), duration: 2800 };
        kick();
      }, delay);
    };

    figure.classList.add('is-live');
    apply();

    const loaded = (img) => (img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }));
    Promise.all([loaded(render), loaded(blueprint)]).then(() => {
      figure.classList.add('is-ready');
      run(1100);
    });

    if (finePointer) {
      art.addEventListener('pointermove', (event) => {
        if (!figure.classList.contains('is-done')) return;
        const box = art.getBoundingClientRect();
        figure.style.setProperty('--mx', `${(event.clientX - box.left).toFixed(1)}px`);
        figure.style.setProperty('--my', `${(event.clientY - box.top).toFixed(1)}px`);
        lensTarget = Math.max(90, box.width * 0.16);
        kick();
      });
      art.addEventListener('pointerleave', () => { lensTarget = 0; kick(); });
    }
    art.addEventListener('click', () => {
      if (figure.classList.contains('is-done')) run(450);
    });
  });

  // Where the machine sits in each frame of a build sequence, as
  // [left, top, right, bottom] in thousandths of the frame. The stage uses it
  // to keep the machine framed on any screen. Measured from the renders.
  const FRAMING = {
    '/img/talos-5/build/': [
      [337,117,692,837], [337,115,692,837], [337,112,692,837], [337,110,692,837], [337,108,692,837], [337,104,692,837],
      [337,100,692,837], [337,97,692,837], [337,94,692,838], [337,81,692,838], [337,90,692,838], [337,89,692,838],
      [337,89,692,839], [337,90,692,839], [337,91,692,839], [337,93,692,840], [337,95,693,840], [337,97,693,840],
      [337,100,693,841], [336,103,693,841], [336,107,693,841], [336,110,693,841], [336,114,694,842], [336,118,694,842],
      [335,122,694,842], [335,126,694,843], [335,130,694,843], [335,133,694,844], [335,136,694,844], [335,138,694,844],
      [335,139,694,845], [335,141,694,845], [335,141,694,845], [335,142,694,846], [335,142,694,846], [335,142,694,846],
      [335,142,694,847], [335,142,695,847], [335,141,695,847], [335,141,695,848], [334,141,695,848], [334,141,695,848],
      [334,141,695,848], [334,141,695,848], [334,141,696,849], [334,141,696,849], [333,141,696,849], [333,140,696,849],
      [333,139,696,850], [333,138,696,850], [333,136,696,850], [333,134,696,850], [333,130,696,851], [333,125,697,851],
      [333,120,697,851], [333,113,698,852], [333,106,698,852], [333,98,699,852], [333,91,699,852], [333,83,700,853],
      [333,76,700,853], [333,69,701,853], [333,64,701,854], [333,48,701,854], [332,56,702,854], [332,54,702,855],
      [331,52,702,855], [331,51,702,856], [329,50,703,857], [328,49,703,858], [326,48,704,860], [324,47,705,862],
      [320,45,706,865], [317,42,707,869], [313,39,709,874], [309,36,710,879], [305,33,712,885], [301,30,713,891],
      [297,28,715,898], [294,26,716,904], [291,25,717,910], [283,15,719,916], [283,25,719,922], [282,27,720,927],
      [278,30,721,931], [273,33,722,936], [266,37,723,940], [258,41,724,944], [247,46,725,949], [234,50,727,953],
      [219,53,729,957], [201,56,731,961], [182,58,733,965], [162,59,735,969], [141,59,738,972], [122,59,741,974],
      [103,57,744,976], [86,56,748,981], [72,53,751,978], [60,51,755,977], [50,48,759,976], [43,45,762,974],
      [33,42,766,973], [29,39,769,970], [29,36,773,968], [29,34,776,966], [30,31,779,964], [30,29,782,962],
      [30,27,784,960], [30,26,786,958], [31,24,788,957], [31,23,790,956], [31,22,791,956], [32,21,793,955],
      [32,20,793,955], [32,20,794,955], [32,19,795,956], [33,19,795,956], [33,19,796,956], [33,19,796,956],
    ],
  };

  // Scroll-driven build: pins the stage and draws one of N frames to a canvas
  // based on how far through the track the reader has scrolled. Frames start
  // downloading only as the section approaches. Without JS or with reduced
  // motion, the static poster image stays in place.
  document.querySelectorAll('.build').forEach((section) => {
    const stage = section.querySelector('.build-stage');
    const canvas = section.querySelector('.build-canvas');
    const areaEl = section.querySelector('.build-area');
    const ctx = canvas && canvas.getContext('2d', { alpha: false });
    const total = Number(section.dataset.frames) || 0;
    if (!stage || !ctx || !areaEl || !total || reducedMotion || !('IntersectionObserver' in window)) {
      section.classList.add('is-static'); // the stylesheet keeps the poster and drops the reserved track
      return;
    }
    const last = total - 1;
    const boxes = FRAMING[section.dataset.path] || null;
    // Phone layout gets the lighter 720p set while moving and sharpens to
    // 1080p when it comes to rest; everything wider gets 1080p throughout.
    // A visitor who has asked their browser to save data gets 720p only.
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    const baseSet = saveData || window.matchMedia('(max-width: 760px)').matches ? '720' : '1080';
    const src = (i, set) => `${section.dataset.path}${set}/frame_${pad3(i)}.webp`;
    const BG = '10, 11, 18'; // the renders' backdrop; matches --bg-stage
    // The first and last slices of the track hold still, so the sequence has a
    // beat to land before the page moves on.
    const LEAD = 0.02;
    const RUN = 0.86;

    // Stage furniture, built from the captions in the markup.
    const captionsEl = section.querySelector('.build-captions');
    const captions = Array.from(section.querySelectorAll('.build-caption')).map((el) => ({
      el, from: Number(el.dataset.from), to: Number(el.dataset.to), label: el.dataset.label || '', fill: -1,
    }));
    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text) el.textContent = text;
      return el;
    };
    const side = make('div', 'build-side');
    const rail = make('div', 'build-rail');
    const segments = make('div', 'build-segments');
    const hud = make('div', 'build-hud');
    const hint = make('div', 'build-hint');
    const count = make('b', '', '000');
    const counter = make('span', 'build-count');
    counter.append('Frame ', count, ` / ${pad3(last)}`);
    hud.append(make('span', 'build-title', section.dataset.title || ''), counter);
    hint.append(make('span', '', 'Scroll to assemble'), make('i'));
    [side, hud, segments, hint].forEach((el) => el.setAttribute('aria-hidden', 'true'));

    const jump = (frame) => {
      const span = section.offsetHeight - stage.offsetHeight;
      const top = section.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + span * (LEAD + RUN * (frame / last)) + 2, behavior: 'smooth' });
    };

    captions.forEach((caption, n) => {
      const button = make('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.append(make('span', 'num', String(n + 1).padStart(2, '0')), make('span', '', caption.label), make('i'));
      button.addEventListener('click', () => jump(caption.from + (caption.to - caption.from) * 0.5));
      rail.appendChild(button);
      caption.rail = button;
      caption.segment = make('span');
      caption.segment.style.flexGrow = String(caption.to - caption.from + 1);
      segments.appendChild(caption.segment);
    });
    side.appendChild(rail);
    if (captionsEl) side.appendChild(captionsEl);
    stage.append(side, hud, segments, hint);
    section.classList.add('is-live', 'at-start');

    const callouts = Array.from(section.querySelectorAll('.build-callout')).map((el, n) => {
      el.style.setProperty('--n', String(n));
      return { el, x: Number(el.dataset.x), y: Number(el.dataset.y), len: Number(el.dataset.len) || 0.1 };
    });

    const frames = new Array(total);
    const crisp = new Map(); // 1080p stills fetched at rest on the phone layout
    let area = { x: 0, y: 0, w: 1, h: 1 };
    let maxWidth = Infinity;
    let target = 0;      // the frame the scroll position asks for
    let f = 0;           // the frame on screen: eases towards target, fractional in motion
    let shown = -1;
    let started = false;
    let visible = false;
    let loop = 0;
    let lastTime = 0;
    let crispTimer = 0;

    const ready = (img) => img && img.complete && img.naturalWidth > 0;
    // The nearest loaded frame at or below i, so fast scrolling never shows a blank.
    const nearest = (i) => {
      for (let k = i; k >= 0; k--) if (ready(frames[k])) return frames[k];
      return null;
    };

    // Virtual camera: where to draw the whole frame so that the machine's box
    // for (fractional) frame ff fits the stage's .build-area.
    const camera = (ff) => {
      let box = [0.04, 0.04, 0.96, 0.96];
      if (boxes) {
        const a = Math.floor(ff);
        const b = Math.min(last, a + 1);
        const t = ff - a;
        box = boxes[a].map((v, n) => (v + (boxes[b][n] - v) * t) / 1000);
      }
      const margin = 0.012;
      const bw = box[2] - box[0] + margin * 2;
      const bh = box[3] - box[1] + margin * 2;
      const w = Math.min(area.w / bw, (area.h / bh) * (16 / 9), maxWidth);
      const h = w * (9 / 16);
      return {
        x: area.x + area.w / 2 - ((box[0] + box[2]) / 2) * w,
        y: area.y + area.h / 2 - ((box[1] + box[3]) / 2) * h,
        w,
        h,
      };
    };

    // Draw a frame, then run its edge pixels out to the canvas edges so the
    // backdrop carries on past the render instead of ending in a rectangle.
    const blit = (img, cam) => {
      const cw = canvas.width;
      const ch = canvas.height;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      ctx.drawImage(img, cam.x, cam.y, cam.w, cam.h);
      const x0 = Math.ceil(cam.x);
      const y0 = Math.ceil(cam.y);
      const x1 = Math.floor(cam.x + cam.w);
      const y1 = Math.floor(cam.y + cam.h);
      if (x0 > 0) ctx.drawImage(img, 1, 0, 1, ih, 0, cam.y, x0, cam.h);
      if (x1 < cw) ctx.drawImage(img, iw - 2, 0, 1, ih, x1, cam.y, cw - x1, cam.h);
      if (y0 > 0) ctx.drawImage(img, 0, 1, iw, 1, cam.x, 0, cam.w, y0);
      if (y1 < ch) ctx.drawImage(img, 0, ih - 2, iw, 1, cam.x, y1, cam.w, ch - y1);
    };

    // Fade those run-out edges into the flat backdrop colour.
    const settle = (cam) => {
      const cw = canvas.width;
      const ch = canvas.height;
      const reach = Math.max(cam.w, cam.h) * 0.3;
      const fade = (xa, ya, xb, yb, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(xa, ya, xb, yb);
        g.addColorStop(0, `rgba(${BG}, 0)`);
        g.addColorStop(1, `rgba(${BG}, 1)`);
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      };
      const x0 = Math.ceil(cam.x);
      const y0 = Math.ceil(cam.y);
      const x1 = Math.floor(cam.x + cam.w);
      const y1 = Math.floor(cam.y + cam.h);
      if (x0 > 0) fade(x0, 0, x0 - reach, 0, 0, 0, x0, ch);
      if (x1 < cw) fade(x1, 0, x1 + reach, 0, x1, 0, cw - x1, ch);
      if (y0 > 0) fade(0, y0, 0, y0 - reach, 0, 0, cw, y0);
      if (y1 < ch) fade(0, y1, 0, y1 + reach, 0, y1, cw, ch - y1);
    };

    const paint = () => {
      const a = Math.floor(f);
      const t = f - a;
      const first = (t === 0 && crisp.get(a)) || nearest(a);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${BG})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!first) return;
      const cam = camera(f);
      blit(first, cam);
      // In motion, blend towards the next frame for movement finer than the frame step.
      const next = t > 0.02 ? frames[a + 1] : null;
      if (ready(next)) {
        ctx.globalAlpha = t;
        blit(next, cam);
        ctx.globalAlpha = 1;
      }
      settle(cam);
    };

    const sync = () => {
      const i = Math.round(f);
      if (i !== shown) {
        shown = i;
        count.textContent = pad3(i);
        captions.forEach((caption) => {
          const on = i >= caption.from && i <= caption.to;
          caption.el.classList.toggle('is-on', on);
          caption.rail.classList.toggle('is-on', on);
          caption.rail.classList.toggle('is-done', i > caption.to);
        });
        section.classList.toggle('at-start', i < 2);
        section.classList.toggle('is-complete', i >= last);
      }
      captions.forEach((caption) => {
        const fill = clamp((f - caption.from) / Math.max(1, caption.to - caption.from));
        if (fill === caption.fill) return;
        caption.fill = fill;
        caption.rail.style.setProperty('--fill', fill.toFixed(3));
        caption.segment.style.setProperty('--fill', fill.toFixed(3));
      });
    };

    const scrollTarget = () => {
      // Travel is measured from the stage, not the window: on phones the window
      // grows as the browser toolbars slide away, the pinned stage does not.
      const span = section.offsetHeight - stage.offsetHeight;
      const p = span > 0 ? clamp(-section.getBoundingClientRect().top / span) : 0;
      return Math.round(clamp((p - LEAD) / RUN) * last);
    };

    // At rest on the phone layout, swap in the 1080p version of the frame.
    const sharpen = () => {
      clearTimeout(crispTimer);
      if (baseSet === '1080' || saveData) return;
      crispTimer = setTimeout(() => {
        const i = target;
        if (f !== i || crisp.has(i)) return;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          crisp.set(i, img);
          if (crisp.size > 6) crisp.delete(crisp.keys().next().value);
          if (f === i) paint();
        };
        img.src = src(i, '1080');
      }, 240);
    };

    const tick = (now) => {
      loop = 0;
      const dt = Math.min(64, now - lastTime || 16);
      lastTime = now;
      target = scrollTarget();
      if (!visible) {
        if (f !== target) { f = target; shown = -1; }
        return;
      }
      const before = f;
      f += (target - f) * (1 - Math.exp(-dt / 85));
      if (Math.abs(target - f) < 0.02) f = target;
      if (f !== before || shown < 0) { paint(); sync(); }
      if (f !== target) request(); else sharpen();
    };
    const request = () => { if (!loop) loop = requestAnimationFrame(tick); };
    const redraw = () => { paint(); sync(); };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = stage.getBoundingClientRect();
      const inner = areaEl.getBoundingClientRect();
      const width = Math.round(box.width * dpr);
      const height = Math.round(box.height * dpr);
      // Setting a canvas size clears it, so only do that when the size changed
      // (phones fire resize every time the toolbars slide).
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      area = {
        x: (inner.left - box.left) * dpr,
        y: (inner.top - box.top) * dpr,
        w: Math.max(1, inner.width * dpr),
        h: Math.max(1, inner.height * dpr),
      };
      maxWidth = 1920 * 1.35 * dpr; // never enlarge the renders much past their own pixels
      // Pin the callouts to their points on the finished machine.
      const end = camera(last);
      callouts.forEach((c) => {
        c.el.style.left = `${((end.x + c.x * end.w) / dpr).toFixed(1)}px`;
        c.el.style.top = `${((end.y + c.y * end.h) / dpr).toFixed(1)}px`;
        c.el.style.setProperty('--len', `${((c.len * end.h) / dpr).toFixed(1)}px`);
      });
      redraw();
      request();
    };

    // Frames are requested coarse to fine: every eighth, then the ones between,
    // and so on. On a slow connection the whole sequence is scrubbable early
    // (in bigger steps) instead of stalling wherever the downloads have got to.
    const fetchFrames = () => {
      const order = [];
      const seen = new Set();
      for (let stride = 8; stride >= 1; stride /= 2) {
        for (let i = 0; i < total; i += stride) {
          if (!seen.has(i)) { seen.add(i); order.push(i); }
        }
      }
      order.forEach((i) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { if (i <= Math.ceil(f) + 1) redraw(); };
        img.src = src(i, baseSet);
        frames[i] = img;
      });
    };
    // Wait for the page itself to finish loading first, so the frames never
    // compete with the hero for bandwidth.
    const load = () => {
      if (started) return;
      started = true;
      if (document.readyState === 'complete') fetchFrames();
      else window.addEventListener('load', fetchFrames, { once: true });
    };

    // Start downloading about two screens before the section arrives.
    const nearby = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { load(); nearby.disconnect(); }
    }, { rootMargin: '200% 0px' });
    nearby.observe(section);

    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) request();
    }, { rootMargin: '10% 0px' }).observe(section);

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', resize);
    resize();
  });

  // Process timeline: the line fills, and each step lights, as the list
  // scrolls through the viewport. Works for the row and the stacked layout.
  document.querySelectorAll('[data-progress]').forEach((list) => {
    const steps = Array.from(list.children);
    if (!steps.length || reducedMotion) return;
    list.classList.add('is-tracking');
    let queued = false;
    const update = () => {
      queued = false;
      const box = list.getBoundingClientRect();
      const vh = window.innerHeight;
      const stacked = steps.length > 1 && steps[1].offsetTop > steps[0].offsetTop + 4;
      // Row: fill while the list crosses the middle band of the screen.
      // Stack: fill in step with the reader, a little ahead of the centre.
      const p = stacked
        ? clamp((vh * 0.62 - box.top) / Math.max(1, box.height))
        : clamp((vh * 0.9 - box.top) / (vh * 0.5));
      list.style.setProperty('--p', p.toFixed(4));
      steps.forEach((step) => {
        const at = stacked ? step.offsetTop / Math.max(1, list.offsetHeight) : step.offsetLeft / Math.max(1, list.offsetWidth);
        step.classList.toggle('is-on', p > at + 0.012);
      });
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  });

  // Cards: a soft light follows the pointer.
  if (finePointer) {
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const box = card.getBoundingClientRect();
        card.style.setProperty('--x', `${(event.clientX - box.left).toFixed(0)}px`);
        card.style.setProperty('--y', `${(event.clientY - box.top).toFixed(0)}px`);
      });
    });
  }

  // Footer year.
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // Contact form: preselect the enquiry type from ?enquiry=...
  const enquiry = document.getElementById('enquiry');
  const wanted = new URLSearchParams(window.location.search).get('enquiry');
  if (enquiry && wanted && Array.from(enquiry.options).some((option) => option.value === wanted)) {
    enquiry.value = wanted;
  }
})();
