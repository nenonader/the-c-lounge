// Made By Eng Nayer Nader
(function () {
  'use strict';

  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function tierAscend() {
    const path = document.getElementById('tierAscendPath');
    const grid = document.querySelector('.tier-grid');
    if (!path || !grid) return;

    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;

    if (isReduced) {
      path.style.strokeDashoffset = 0;
      return;
    }

    const gsapOK = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
    if (gsapOK && hasFinePointer) {
      gsap.to(path, {
        strokeDashoffset: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: grid,
          start: 'top 85%',
          end: 'top 35%',
          scrub: 0.6
        }
      });
    } else {
                                                                                 
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            path.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.22,.9,.3,1)';
            path.style.strokeDashoffset = 0;
            io.disconnect();
          }
        });
      }, { threshold: 0.3 });
      io.observe(grid);
    }
  }

  window.pageInit = function () {
    tierAscend();
  };
})();
