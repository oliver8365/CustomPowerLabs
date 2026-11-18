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
