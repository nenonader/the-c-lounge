// Made By Eng Nayer Nader
(function () {
  'use strict';

  function smoothAnchors() {
    document.querySelectorAll('a[href^="#svc-"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = a.getAttribute('href');
        if (window.CLScrollTo) window.CLScrollTo(target);
        else document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

                                                                                 
  function disciplinesReel() {
    const section = document.getElementById('disciplinesReel');
    const track = document.getElementById('reelTrack');
    const bar = document.getElementById('reelProgressBar');
    if (!section || !track) return;

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const gsapOK = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

                                                                            
                                                                          
    if (!gsapOK || isReduced || !isFine) {
      section.classList.add('no-pin');
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    section.classList.remove('no-pin');

    function build() {
      const distance = track.scrollWidth - window.innerWidth + 48;
      if (distance <= 0) return null;

      const cards = track.querySelectorAll('.reel-card');
      const counter = document.getElementById('reelCount');

      const tl = gsap.to(track, {
        x: -distance,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + (distance + window.innerHeight * 0.4),
          scrub: 0.6,
          pin: '.reel-pin',
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (bar) bar.style.width = (self.progress * 100) + '%';
            const idx = Math.min(cards.length - 1, Math.round(self.progress * (cards.length - 1)));
            cards.forEach((c, n) => c.classList.toggle('is-active', n === idx));
            if (counter) counter.textContent = String(idx + 1).padStart(2, '0');
          },
        },
      });
      return tl;
    }

    let tween = build();
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (tween) tween.kill();
        gsap.set(track, { x: 0 });
        tween = build();
        ScrollTrigger.refresh();
      }, 180);
    }, { passive: true });
  }

  window.pageInit = function () {
    smoothAnchors();
    disciplinesReel();
  };
})();
