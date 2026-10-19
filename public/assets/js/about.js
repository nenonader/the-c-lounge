// Made By Eng Nayer Nader
(function () {
  'use strict';
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsapOK = typeof gsap !== 'undefined';

                                                      
  function founderLetter() {
    const toggle = document.getElementById('letterToggle');
    const letter = document.getElementById('founderLetter');
    if (!toggle || !letter) return;
    toggle.addEventListener('click', () => {
      const open = letter.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      letter.setAttribute('aria-hidden', String(!open));
      const i = toggle.querySelector('i');
      if (i) i.textContent = open ? '×' : '+';
    });
  }

                                                                           
  function founderParallax() {
    if (!gsapOK || isReduced) return;
    const visual = document.querySelector('.founder-visual');
    if (!visual) return;
                                                                 
    const img = visual.querySelector('img');
    if (!img) return;
    gsap.to(img, {
      yPercent: -6,
      ease: 'none',
      scrollTrigger: {
        trigger: '.founder',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1,
      },
    });
  }

                                                    
  function storyReveal() {
    if (!gsapOK || isReduced) return;
    const paras = document.querySelectorAll('.story-copy p');
    if (!paras.length) return;
    ScrollTrigger.create({
      trigger: '.story-copy',
      start: 'top 80%',
      onEnter: () => {
        gsap.fromTo(paras,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' });
      },
      once: true,
    });
  }

                                               
  function blockquoteReveal() {
    if (!gsapOK || isReduced) return;
    const bq = document.querySelector('.founder-copy blockquote');
    if (!bq) return;
    ScrollTrigger.create({
      trigger: bq,
      start: 'top 85%',
      onEnter: () => {
        gsap.fromTo(bq,
          { opacity: 0, x: -30 },
          { opacity: 1, x: 0, duration: 1.2, ease: 'power3.out' });
      },
      once: true,
    });
  }

  window.pageInit = function () {
    founderLetter();
    founderParallax();
    storyReveal();
    blockquoteReveal();
  };
})();
