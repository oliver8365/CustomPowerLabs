(() => {
  'use strict';

  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');

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
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  // Scroll-driven build: pins the stage and draws one of N frames to a canvas
  // based on how far through the track the reader has scrolled. Frames start
  // downloading only as the section approaches. Without JS or with reduced
  // motion, the static poster image stays in place.
  document.querySelectorAll('.build').forEach((section) => {
    const canvas = section.querySelector('.build-canvas');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx || reducedMotion || !('IntersectionObserver' in window)) return;

    const total = Number(section.dataset.frames) || 0;
    if (!total) return;
    // Phone layout gets the lighter 720p set; everything wider gets 1080p.
    const smallScreen = window.matchMedia('(max-width: 760px)').matches;
    const dir = section.dataset.path + (smallScreen ? '720/' : '1080/');
    const src = (i) => `${dir}frame_${String(i).padStart(3, '0')}.webp`;

    const progress = section.querySelector('.build-progress');
    const captions = Array.from(section.querySelectorAll('.build-caption')).map((el) => ({
      el, from: Number(el.dataset.from), to: Number(el.dataset.to),
    }));
    const frames = new Array(total);
    let current = -1;
    let started = false;

    section.classList.add('is-live');

    const ready = (img) => img && img.complete && img.naturalWidth > 0;
    // The nearest loaded frame at or below i, so fast scrolling never shows a blank.
    const nearest = (i) => {
      for (let k = i; k >= 0; k--) if (ready(frames[k])) return frames[k];
      return null;
    };

    const draw = (i) => {
      const img = nearest(i);
      const cw = canvas.width;
      const ch = canvas.height;
      // Paint the renders' own backdrop first so the frame edges never show;
      // the CSS mask then fades the whole canvas into the page.
      ctx.fillStyle = '#0a0c11';
      ctx.fillRect(0, 0, cw, ch);
      if (!img) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const portrait = ch > cw;
      // Wide screens: contain, slightly inset so captions have room.
      // Tall phone screens: crop in so the machine stays large, and sit it high.
      const scale = portrait
        ? Math.max(cw / iw, (ch / ih) * 0.62)
        : Math.min(cw / iw, ch / ih) * 0.92;
      const w = iw * scale;
      const h = ih * scale;
      const x = (cw - w) / 2;
      const y = (ch - h) * (portrait ? 0.38 : 0.5);
      ctx.drawImage(img, x, y, w, h);

      // Feather the render's edges (its vignette is lighter than the corners)
      // so no rectangle shows against the backdrop.
      const f = Math.round(Math.min(w, h) * 0.1);
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(10, 12, 17, 1)');
        g.addColorStop(1, 'rgba(10, 12, 17, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      };
      edge(x, 0, x + f, 0, x, y, f, h);                 // left
      edge(x + w, 0, x + w - f, 0, x + w - f, y, f, h); // right
      edge(0, y, 0, y + f, x, y, w, f);                 // top
      edge(0, y + h, 0, y + h - f, x, y + h - f, w, f); // bottom
    };

    const position = () => {
      const span = section.offsetHeight - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -section.getBoundingClientRect().top / span)) : 0;
      return { p, i: Math.min(total - 1, Math.floor(p * total)) };
    };

    const render = (force) => {
      const { p, i } = position();
      if (progress) progress.style.setProperty('--p', p.toFixed(4));
      captions.forEach((c) => c.el.classList.toggle('is-on', i >= c.from && i <= c.to));
      if (force || i !== current) { current = i; draw(i); }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      render(true);
    };

    const load = () => {
      if (started) return;
      started = true;
      for (let i = 0; i < total; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { if (i <= current) render(true); };
        img.src = src(i);
        frames[i] = img;
      }
    };

    // Start downloading about two screens before the section arrives.
    const nearby = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { load(); nearby.disconnect(); }
    }, { rootMargin: '200% 0px' });
    nearby.observe(section);

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; render(false); });
    }, { passive: true });
    window.addEventListener('resize', resize);
    resize();
  });

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
