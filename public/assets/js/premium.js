// Made By Eng Nayer Nader
(function () {
  'use strict';

  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const gsapOK = typeof gsap !== 'undefined';

                                                                       
  function spotlight() {
    if (!hasFinePointer || isReduced) return;
    const glow = document.createElement('div');
    glow.className = 'cursor-spotlight';
    document.body.appendChild(glow);
    let mx = innerWidth / 2, my = innerHeight / 2, gx = mx, gy = my;
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
    (function loop() {
      if (document.hidden) { requestAnimationFrame(loop); return; }
      gx += (mx - gx) * 0.09;
      gy += (my - gy) * 0.09;
      glow.style.transform = 'translate(' + gx + 'px,' + gy + 'px)';
      requestAnimationFrame(loop);
    })();
  }

                                                                     
  function cursorInvert() {
    if (!hasFinePointer) return;
    const invertZones = document.querySelectorAll('.hero-media, .founder-visual, .img-reveal, .sb-media, .reel-card, .g-img');
    invertZones.forEach((z) => {
      z.addEventListener('mouseenter', () => document.body.classList.add('cursor-invert'));
      z.addEventListener('mouseleave', () => document.body.classList.remove('cursor-invert'));
    });
  }

                                                                          
  function magnetic() {
    if (!hasFinePointer || isReduced) return;
    const els = document.querySelectorAll('.btn, .nav-cta, .chat-toggle');
    els.forEach((el) => {
      const strength = el.classList.contains('btn') || el.classList.contains('nav-cta') ? 0.35 : 0.45;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const relX = e.clientX - (r.left + r.width / 2);
        const relY = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (relX * strength) + 'px,' + (relY * strength) + 'px)';
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

                                               
  function tilt() {
    if (!hasFinePointer || isReduced) return;
    const sel = '.usp-card, .tier-card, .index-item, .value-cell';
    document.querySelectorAll(sel).forEach((card) => {
      card.classList.add('tilt-card');
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(900px) rotateY(' + (px * 6) + 'deg) rotateX(' + (py * -6) + 'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

                                                                            
  function splitTitles() {
    const titles = document.querySelectorAll('.section-title:not(.no-split)');
    titles.forEach((el) => {
      if (el.dataset.split) return;
      el.dataset.split = '1';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      let n;
      while ((n = walker.nextNode())) if (n.nodeValue.trim()) textNodes.push(n);
      textNodes.forEach((node) => {
        const words = node.nodeValue.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        words.forEach((w) => {
          if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
          const span = document.createElement('span');
          span.className = 'sw';
          span.textContent = w;
          frag.appendChild(span);
        });
        node.parentNode.replaceChild(frag, node);
      });
    });

    if (isReduced) {
      titles.forEach((t) => t.classList.add('title-revealed'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        entry.target.classList.add('title-revealed');
        const words = entry.target.querySelectorAll('.sw');
        if (gsapOK) {
          gsap.fromTo(words, { opacity: 0, y: 28, filter: 'blur(8px)' },
            { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.0, ease: 'power3.out', stagger: 0.03 });
        } else {
          words.forEach((w, i) => { w.style.transitionDelay = (i * 30) + 'ms'; w.classList.add('in'); });
        }
      });
    }, { threshold: 0.3, rootMargin: '0px 0px -8% 0px' });
    titles.forEach((t) => io.observe(t));
  }

                                                                  
  function frameDrift() {
    const frame = document.querySelector('.hero-frame');
    if (!frame || !hasFinePointer || isReduced) return;
    window.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / innerWidth - 0.5) * 10;
      const ny = (e.clientY / innerHeight - 0.5) * 10;
      frame.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
    }, { passive: true });
  }

                                                                            
  function marqueeReveal() {
    const el = document.querySelector('.marquee-strip');
    if (!el || isReduced) return;
                                                                   
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          el.classList.add('in');
          io.unobserve(el);
        }
      });
    }, { threshold: 0.1 });
    io.observe(el);
  }

                                                                              
  function numberMorph() {
    if (isReduced) return;
    const els = document.querySelectorAll('.stat-morph');
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        const dur = 2200;
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 4);
          el.textContent = Math.round(target * eased) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  }

                                                            
  function eyebrowLines() {
    if (isReduced || !gsapOK) return;
    const eyebrows = Array.from(document.querySelectorAll('.eyebrow')).filter((el) => !el.closest('.page-hero'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        const pseudo = el.querySelector('.eyebrow-line') || el;
        gsap.fromTo(el, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.9, ease: 'power3.out' });
      });
    }, { threshold: 0.5 });
    eyebrows.forEach((el) => io.observe(el));
  }

                                                                              
  function pageHeroReveal() {
    const h1 = document.querySelector('.page-hero h1');
                                                                      
    const maskedHero = h1 && h1.querySelector('.wm');
    if (!h1 || isReduced || !gsapOK) return;
    if (!maskedHero) {
      gsap.fromTo(h1, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', delay: 0.8 });
    }
    const eyebrow = document.querySelector('.page-hero .eyebrow');
    if (eyebrow) gsap.fromTo(eyebrow, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 1.0, ease: 'power3.out', delay: 0.5 });
    const lede = document.querySelector('.page-hero .lede');
    if (lede) gsap.fromTo(lede, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', delay: 1.0 });
  }

                                                                          
  function galleryStagger() {
    const items = document.querySelectorAll('.g-item');
    if (!items.length || isReduced || !gsapOK) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        gsap.to(entry.target, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out' });
      });
    }, { threshold: 0.08 });
    items.forEach((item, i) => {
      gsap.set(item, { opacity: 0, y: 60 });
      io.observe(item);
    });
  }

                                                                       
  function disciplineStagger() {
    const rows = document.querySelectorAll('.discipline-row');
    if (!rows.length || isReduced || !gsapOK) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const idx = Array.from(rows).indexOf(entry.target);
        gsap.fromTo(entry.target,
          { opacity: 0, x: -30 },
          { opacity: 1, x: 0, duration: 0.85, ease: 'power3.out', delay: idx * 0.04 });
      });
    }, { threshold: 0.2 });
    rows.forEach((row) => { gsap.set(row, { opacity: 0 }); io.observe(row); });
  }

                                                                          
  function serviceBlockReveal() {
    const blocks = document.querySelectorAll('.service-block');
    if (!blocks.length || isReduced || !gsapOK) return;
    blocks.forEach((block) => {
      const media = block.querySelector('.sb-media');
      const copy = block.querySelector('.sb-body');
      ScrollTrigger.create({
        trigger: block,
        start: 'top 80%',
        onEnter: () => {
          if (media) gsap.fromTo(media, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 1.2, ease: 'power3.out' });
          if (copy) gsap.fromTo(copy, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', delay: 0.15 });
        },
        once: true,
      });
    });
  }

                                                          
  function footerBorder() {
    const footer = document.querySelector('.site-footer');
    if (!footer || isReduced || !gsapOK) return;
    const line = document.createElement('div');
    line.className = 'footer-gold-line';
    footer.prepend(line);
    ScrollTrigger.create({
      trigger: footer,
      start: 'top 95%',
      onEnter: () => {
        gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.8, ease: 'power3.inOut', transformOrigin: 'left center' });
      },
      once: true,
    });
  }

                                                                  
  function tierCardEntrance() {
    const cards = document.querySelectorAll('.tier-card');
    if (!cards.length || isReduced || !gsapOK) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const idx = Array.from(cards).indexOf(entry.target);
        gsap.fromTo(entry.target,
          { opacity: 0, y: 50, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'power3.out', delay: idx * 0.1 });
      });
    }, { threshold: 0.15 });
    cards.forEach((c) => { gsap.set(c, { opacity: 0 }); io.observe(c); });
  }

                                                    
  function contactReveal() {
    const points = document.querySelectorAll('.cp');
    if (!points.length || isReduced || !gsapOK) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const idx = Array.from(points).indexOf(entry.target);
        gsap.fromTo(entry.target,
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.9, ease: 'power3.out', delay: idx * 0.08 });
      });
    }, { threshold: 0.2 });
    points.forEach((p) => { gsap.set(p, { opacity: 0 }); io.observe(p); });
  }

                                                                        
  function valueCellPulse() {
    const cells = document.querySelectorAll('.value-cell');
    if (!cells.length || isReduced || !gsapOK) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const idx = Array.from(cells).indexOf(entry.target);
        gsap.fromTo(entry.target,
          { opacity: 0, y: 30, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 1.0, ease: 'power3.out', delay: idx * 0.07 });
      });
    }, { threshold: 0.2 });
    cells.forEach((c) => { gsap.set(c, { opacity: 0 }); io.observe(c); });
  }

                                                              
  function ornamentDraw() {
                                                                          
                                                                 
    if (isReduced || !gsapOK) return;
    const logo = document.querySelector('.ornament .orn-logo');
    if (!logo) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        gsap.fromTo(logo, { opacity: 0 }, { opacity: 0.85, duration: 1.5, ease: 'power2.out', delay: 1.2 });
      });
    }, { threshold: 0.3 });
    io.observe(logo);
  }

                                                         
  function uspStagger() {
    const cards = document.querySelectorAll('.usp-card');
    if (!cards.length || isReduced || !gsapOK) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting);
      if (!visible.length) return;
      visible.forEach((entry) => io.unobserve(entry.target));
      const targets = visible.map(e => e.target);
      gsap.fromTo(targets,
        { opacity: 0, y: 40, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 1.0, ease: 'power3.out', stagger: 0.08 });
    }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
    cards.forEach((c) => { gsap.set(c, { opacity: 0 }); io.observe(c); });
  }

  function boot() {
    spotlight();
    cursorInvert();
    magnetic();
    tilt();
    splitTitles();
    frameDrift();
    marqueeReveal();
    numberMorph();
    eyebrowLines();
    pageHeroReveal();
    galleryStagger();
    disciplineStagger();
    if (gsapOK && typeof ScrollTrigger !== 'undefined') {
      serviceBlockReveal();
      footerBorder();
      valueCellPulse();
    }
    tierCardEntrance();
    contactReveal();
    ornamentDraw();
    uspStagger();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
