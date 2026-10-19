// Made By Eng Nayer Nader
(function () {
  'use strict';

  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsapOK = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

                                                                 
                                                                          
                                                                         
                                                                           
  function splitHeroWords() {
    const h1 = document.querySelector('.page-hero h1');
    if (!h1) return;

    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) textNodes.push(n);

    textNodes.forEach((node) => {
      const words = node.nodeValue.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      words.forEach((w) => {
        if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
        const mask = document.createElement('span');
        mask.className = 'wm';
        const inner = document.createElement('span');
        inner.className = 'wm-inner';
        inner.textContent = w;
        mask.appendChild(inner);
        frag.appendChild(mask);
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  function heroWordReveal() {
    const h1 = document.querySelector('.page-hero h1');
    const inners = document.querySelectorAll('.page-hero h1 .wm-inner');
    if (!inners.length) return;
    if (h1) h1.style.opacity = 1;
    if (isReduced || !gsapOK) {
      inners.forEach((el) => { el.style.transform = 'none'; el.style.opacity = 1; });
      return;
    }
    gsap.fromTo(inners,
      { yPercent: 120, opacity: 0, filter: 'blur(6px)' },
      { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 1.25, ease: 'power4.out', stagger: 0.035, delay: 0.35 });
  }

                                                           
                                                                         
                                                                            
  function heroExit() {
    if (!gsapOK || isReduced) return;
    const inner = document.querySelector('.hero .hero-inner');
    if (!inner) return;
    gsap.to(inner, {
      yPercent: -18,
      opacity: 0.25,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
      },
    });
  }

                                                                            
                                                                      
  function ghostNumerals() {
    const rows = document.querySelectorAll('.discipline-row');
    if (!rows.length) return;
    rows.forEach((row) => {
      const no = row.querySelector('.d-no');
      if (no) row.setAttribute('data-no', no.textContent.trim());
    });
  }

                                                                        
                                                                     
                                                                     
  function testiProgress() {
    const bar = document.querySelector('.testi-progress span');
    const wrap = document.querySelector('.testi-wrap');
    if (!bar || !wrap) return;

    const INTERVAL = 6200;
    let paused = false;
    let last = performance.now();
    let rafId = 0;
    const fill = () => {
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(0)';
      void bar.offsetWidth;
      bar.style.transition = 'transform ' + INTERVAL + 'ms linear';
      requestAnimationFrame(() => { bar.style.transform = 'scaleX(1)'; });
    };

    if (isReduced) { bar.style.transform = 'scaleX(0)'; bar.style.transition = 'none'; return; }

    fill();

    const loop = (now) => {
      if (!paused && now - last >= INTERVAL) { last = now; fill(); }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const restart = () => { last = performance.now(); fill(); };
    document.querySelectorAll('.testi-prev, .testi-next, .testi-dot').forEach((el) => {
      el.addEventListener('click', restart);
    });
                                                                           
    wrap.addEventListener('mouseenter', () => { paused = true; });
    wrap.addEventListener('mouseleave', () => { paused = false; last = performance.now(); fill(); });
    void rafId;
  }

                                                                            
                                                                        
                                     
  function serviceIndex() {
    if (!gsapOK || isReduced) return;
    const items = document.querySelectorAll('.index-item');
    const blocks = document.querySelectorAll('.service-block');
    if (!items.length || !blocks.length) return;

    const setActive = (i) => {
      items.forEach((it, n) => {
        const active = n === i;
        it.classList.toggle('active', active);
        if (active) it.setAttribute('aria-current', 'location');
        else it.removeAttribute('aria-current');
      });
    };

    blocks.forEach((block, i) => {
      ScrollTrigger.create({
        trigger: block,
        start: 'top 55%',
        end: 'bottom 45%',
        onToggle: (self) => { if (self.isActive) setActive(i); },
      });
    });
  }

                                                                  
                                                                    
                                                         
  function storyLine() {
    const line = document.querySelector('.story-line');
    if (!line) return;
    if (isReduced || !gsapOK) { line.classList.add('no-anim'); return; }

    const fill = line.querySelector('.sl-fill');
    const dot = line.querySelector('.sl-dot');

    gsap.fromTo(fill,
      { scaleY: 0 },
      { scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: '.story', start: 'top 75%', end: 'bottom 55%', scrub: 0.8 } });

    gsap.fromTo(dot,
      { top: '0%' },
      { top: 'calc(100% - 4px)', ease: 'none',
        scrollTrigger: { trigger: '.story', start: 'top 75%', end: 'bottom 55%', scrub: 0.8 } });
  }

                                                                           
                                                                           
  function founderLetter() {
    const letter = document.getElementById('founderLetter');
    if (!letter) return;
    const paras = letter.querySelectorAll('p');
    const io = new MutationObserver(() => {
      if (!letter.classList.contains('open')) return;
      io.disconnect();
      if (isReduced || !gsapOK) { paras.forEach((p) => (p.style.opacity = 1)); return; }
      gsap.fromTo(paras,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', delay: 0.15 });
    });
    io.observe(letter, { attributes: true, attributeFilter: ['class'] });
  }

                                                                    
                                                                           
  function checkDraw() {
    const success = document.getElementById('formSuccess');
    if (!success) return;
    const circle = success.querySelector('svg circle');
    const path = success.querySelector('svg path');
    const io = new MutationObserver(() => {
      if (!success.classList.contains('show')) return;
      io.disconnect();
      if (!circle || !path || isReduced || !gsapOK) return;
      const cLen = circle.getTotalLength();
      const pLen = path.getTotalLength();
      gsap.set(circle, { strokeDasharray: cLen, strokeDashoffset: cLen });
      gsap.set(path, { strokeDasharray: pLen, strokeDashoffset: pLen });
      gsap.to(circle, { strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut', delay: 0.15 });
      gsap.to(path, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.out', delay: 0.75 });
    });
    io.observe(success, { attributes: true, attributeFilter: ['class'] });
  }

                                                                     
                                                                           
  function legalToc() {
    if (!gsapOK || isReduced) return;
    const toc = document.querySelector('.legal-toc');
    const blocks = document.querySelectorAll('.legal-block');
    if (!toc || !blocks.length) return;
    const links = toc.querySelectorAll('a');
    const setActive = (i) => {
      links.forEach((a, n) => {
        const active = n === i;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    };
    blocks.forEach((block, i) => {
      ScrollTrigger.create({
        trigger: block,
        start: 'top 50%',
        end: 'bottom 50%',
        onToggle: (self) => { if (self.isActive) setActive(i); },
      });
    });
  }

                                                                               
                                                                      
                                                        
  function pageHeroZoom() {
    const bg = document.querySelector('.page-hero .bg');
    if (!bg || isReduced || !gsapOK) return;
    gsap.fromTo(bg,
      { scale: 1.08 },
      { scale: 1, duration: 2.6, ease: 'power2.out', delay: 0.4 });
  }

                                  
  function boot() {
    heroWordReveal();
    heroExit();
    ghostNumerals();
    testiProgress();
    serviceIndex();
    storyLine();
    founderLetter();
    checkDraw();
    legalToc();
    pageHeroZoom();
  }

                                                                            
  splitHeroWords();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
