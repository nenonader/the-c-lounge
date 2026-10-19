// Made By Eng Nayer Nader
(function () {
  'use strict';
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsapOK = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

                                                                    
  function heroReveal() {
    if (!gsapOK || isReduced) return;
    gsap.fromTo('.hero-media img, .hero-media video',
      { scale: 1.14 },
      { scale: 1.0, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 } });
                                                                           
                                                                           
                                                                   
    gsap.fromTo('.hero-media',
      { yPercent: 0 },
      { yPercent: 9, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 } });
  }

                                                 
  function particles() {
    const canvas = document.getElementById('heroParticles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, dpr = 1, pts = [], rafId = 0, isVisible = false;
    const COUNT = window.innerWidth < 700 ? 42 : 68;

    function resize() {
      const parent = canvas.parentElement;
      w = parent.offsetWidth;
      h = parent.offsetHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.2,
        sx: (Math.random() - 0.5) * 0.18,
        sy: (Math.random() - 0.5) * 0.18,
        o: Math.random() * 0.55 + 0.1,
        tw: Math.random() * Math.PI * 2,
      }));
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.sx; p.y += p.sy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        p.tw += 0.016;
        const a = p.o * (0.6 + 0.4 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(198, 166, 106, ' + a + ')';
        ctx.fill();
      }
      if (isVisible && !document.hidden) rafId = requestAnimationFrame(draw);
      else rafId = 0;
    }
    const start = () => {
      if (!isReduced && isVisible && !document.hidden && !rafId) rafId = requestAnimationFrame(draw);
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      start();
    }, { rootMargin: '120px' });
    visibilityObserver.observe(canvas);
    document.addEventListener('visibilitychange', start);
  }

                                                                 
                        
                                                                 
                                                                  
                                                                   
                                                                      
                                                                     
                                                                 
                                                                    
  function constellation() {
    const canvas = document.getElementById('networkCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stage = canvas.parentElement;
    let w, h, dpr = 1, nodes = [], box = { ox: 0, oy: 0, cw: 0, ch: 0 }, rafId = 0, isVisible = false;
    let hover = -1;
    const staticMode = isReduced;

                                                
    const VB = { w: 2000, h: 1000 };

                                                                           
                                                                           
    const CITY_DEFS = [
	  ['London',        -0.13,  51.51, 'r', 0, true],
	  ['Paris',          2.35,  48.86, 'l', 0, true],
	  ['Geneva',         6.14,  46.20, 'l', 1, true],
	  ['Monaco',         7.42,  43.73, 'l', 1, true],
	  ['Madrid',        -3.70,  40.42, 'r', 0, false],
	  ['Istanbul',      28.98,  41.01, 'r', 0, true],
	  ['Alexandria',    29.92,  31.20, 'r', 0, true], // Global desk — hub
	  ['Dubai',         55.30,  25.20, 'r', 0, true],
	  ['Doha',          51.53,  25.29, 'r', 1, true],
	  ['Cape Town',     18.42, -33.92, 'l', 0, true],
	  ['New York',     -74.01,  40.71, 'r', 0, true],
	  ['Los Angeles',  -118.24, 34.05, 'r', 0, true],
	  ['Miami',         -80.19,  25.76, 'r', 1, true],
	  ['São Paulo',    -46.63, -23.55, 'r', 0, true],
	  ['Singapore',    103.82,   1.35, 'l', 0, true],
	  ['Hong Kong',    114.17,  22.32, 'l', 1, true],
	  ['Tokyo',        139.69,  35.68, 'l', 0, true],
	  ['Sydney',       151.21, -33.87, 'l', 0, true],
	];
    const HUB = 'Alexandria';

                                                                       
    function computeBox() {
      const scale = Math.max(w / VB.w, h / VB.h);
      const cw = VB.w * scale, ch = VB.h * scale;
      box = { ox: (w - cw) / 2, oy: (h - ch) / 2, cw, ch };
    }

    function buildNodes() {
      computeBox();
      nodes = CITY_DEFS.map(([name, lon, lat, side, dy, primary]) => {
        const fx = (lon + 180) / 360;
        const fy = (90 - lat) / 180;
        return {
          name, fx, fy, side, dy, primary,
          hub: name === HUB,
          x: box.ox + fx * box.cw,
          y: box.oy + fy * box.ch,
          r: 2.6,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.7 + Math.random() * 0.5,
        };
      });
    }

    function resize() {
      w = stage.offsetWidth;
      h = stage.offsetHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildNodes();
    }
    resize();
    window.addEventListener('resize', resize);

    const HUB_IDX = () => nodes.findIndex((n) => n.hub);
    const primaries = nodes.filter((n) => n.primary && !n.hub);
    primaries.forEach((n, i) => { n._pi = i; });
    const arcDots = primaries.map(() => ({
      t: Math.random(),
      speed: 0.00055 + Math.random() * 0.00035,
    }));

                                                                  
    function graticule() {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(244,241,235,0.045)';
      ctx.beginPath();
      for (let i = 1; i < 12; i++) {
        const x = box.ox + (i * box.cw) / 12;
        ctx.moveTo(x, box.oy); ctx.lineTo(x, box.oy + box.ch);
      }
      for (let i = 1; i < 6; i++) {
        const y = box.oy + (i * box.ch) / 6;
        ctx.moveTo(box.ox, y); ctx.lineTo(box.ox + box.cw, y);
      }
      ctx.stroke();
                                                                  
      ctx.strokeStyle = 'rgba(198,166,106,0.09)';
      ctx.beginPath();
      ctx.moveTo(box.ox, box.oy + box.ch / 2);
      ctx.lineTo(box.ox + box.cw, box.oy + box.ch / 2);
      ctx.moveTo(box.ox + box.cw / 2, box.oy);
      ctx.lineTo(box.ox + box.cw / 2, box.oy + box.ch);
      ctx.stroke();
      ctx.restore();
    }

                                                  
    function vignette() {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(5,8,14,0)');
      g.addColorStop(1, 'rgba(5,8,14,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function curvatureFor(node) {
      return node.fx > nodes[HUB_IDX()].fx ? 0.16 : -0.16;
    }
    function controlPoint(hx, hy, node) {
      const dx = node.x - hx, dy = node.y - hy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = curvatureFor(node);
      return {
        cx: (hx + node.x) / 2 - (dy / len) * k * len * 0.32,
        cy: (hy + node.y) / 2 + (dx / len) * k * len * 0.32,
      };
    }
    function drawArc(hx, hy, node, alpha, width) {
      const { cx, cy } = controlPoint(hx, hy, node);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(cx, cy, node.x, node.y);
      ctx.strokeStyle = 'rgba(198,166,106,' + alpha + ')';
      ctx.lineWidth = width;
      ctx.stroke();
    }
    function arcPoint(hx, hy, node, t) {
      const { cx, cy } = controlPoint(hx, hy, node);
      const b1 = (1 - t) * (1 - t);
      return {
        x: b1 * hx + 2 * (1 - t) * t * cx + t * t * node.x,
        y: b1 * hy + 2 * (1 - t) * t * cy + t * t * node.y,
      };
    }

    function drawPins() {
      nodes.forEach((n, i) => {
        const isHub = n.hub;
        const isHover = i === hover;
        const pulse = 0.5 + 0.5 * Math.sin(phase * n.pulseSpeed + n.phase);
        if (isHub) {
                                  
          ctx.beginPath();
          ctx.arc(n.x, n.y, 9 + 15 * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(231,211,164,' + (0.32 * (1 - pulse)) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(n.x, n.y, 5 + 9 * pulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(198,166,106,' + (0.5 * pulse) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
                      
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 28);
          g.addColorStop(0, 'rgba(198,166,106,0.26)');
          g.addColorStop(1, 'rgba(198,166,106,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 28, 0, Math.PI * 2);
          ctx.fill();
                         
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = 'rgba(231,211,164,0.95)';
          ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
          ctx.restore();
        } else {
          const r = n.r + (isHover ? 1.8 : 0);
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * (isHover ? 6 : 3.4) * (0.8 + 0.2 * pulse), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(198,166,106,' + (0.1 * pulse) + ')';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(231,211,164,' + (isHover ? 1 : 0.55 + 0.45 * pulse) + ')';
          ctx.fill();
        }
      });
    }

    function drawLabels() {
      const labelH = Math.max(8, box.ch * 0.011);
      const step = labelH * 1.55;
      nodes.forEach((n, i) => {
        const isHub = n.hub;
        const isHover = i === hover;
        const dx = n.side === 'r' ? n.r + 9 : -(n.r + 9);
        const ty = n.y + 4 + n.dy * step;
        ctx.font = '500 ' + (isHub ? 11 : 9.5) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = n.side === 'r' ? 'left' : 'right';
        ctx.letterSpacing = '0.16em';
        ctx.fillStyle = 'rgba(244,241,235,' + (isHub ? 0.92 : isHover ? 0.95 : 0.42) + ')';
        ctx.fillText(n.name.toUpperCase(), n.x + dx, ty);
        if (isHub) {
          ctx.font = '400 7px "JetBrains Mono", monospace';
          ctx.letterSpacing = '0.28em';
          ctx.fillStyle = 'rgba(198,166,106,0.75)';
          ctx.fillText('31.2°N · 29.9°E', n.x + dx, ty + step * 0.85);
        }
      });
    }

    let phase = 0;
    function draw() {
      ctx.clearRect(0, 0, w, h);
      phase += 0.0032;
      graticule();
      vignette();

      const hub = nodes[HUB_IDX()];
      const hx = hub.x, hy = hub.y;
      primaries.forEach((n) => {
        const hot = n._pi === hover;
        drawArc(hx, hy, n, hot ? 0.5 : 0.11, hot ? 1.1 : 0.7);
      });
      if (!staticMode) {
        primaries.forEach((n, i) => {
          const dot = arcDots[i];
          dot.t += dot.speed;
          if (dot.t > 1) dot.t = 0;
          const p = arcPoint(hx, hy, n, dot.t);
          const a = Math.sin(dot.t * Math.PI) * 0.7;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(231,211,164,' + a + ')';
          ctx.fill();
        });
      }
      drawPins();
      drawLabels();

      if (isVisible && !document.hidden && !staticMode) rafId = requestAnimationFrame(draw);
      else rafId = 0;
    }

    function start() {
      if (staticMode) { if (!rafId) { rafId = 1; draw(); } return; }
      if (isVisible && !document.hidden && !rafId) rafId = requestAnimationFrame(draw);
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      start();
    }, { rootMargin: '160px' });
    visibilityObserver.observe(canvas);
    document.addEventListener('visibilitychange', start);

                                                                 
    if (!staticMode) {
      canvas.style.cursor = 'default';
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let best = -1, bestD = 26;
        nodes.forEach((n, i) => {
          const d = Math.hypot(n.x - mx, n.y - my);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best !== hover) {
          hover = best;
          canvas.style.cursor = best >= 0 ? 'pointer' : 'default';
        }
      });
      canvas.addEventListener('mouseleave', () => { hover = -1; canvas.style.cursor = 'default'; });
    }
  }

                                                        
  function testimonials() {
    const slides = document.querySelectorAll('.testi-slide');
    const dots = document.querySelectorAll('.testi-dot');
    if (!slides.length) return;
    let idx = 0;
    let timer = null;
    let userPaused = isReduced;
    const toggle = document.querySelector('.testi-toggle');

    function stopTimer() { if (timer) clearInterval(timer); timer = null; }
    function startTimer() {
      stopTimer();
      if (!userPaused && !document.hidden) timer = setInterval(next, 6200);
    }

    function go(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach((s, n) => {
        const active = n === idx;
        s.classList.toggle('is-active', active);
        s.setAttribute('aria-hidden', String(!active));
      });
      dots.forEach((d, n) => {
        const active = n === idx;
        d.classList.toggle('is-active', active);
        if (active) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      startTimer();
    }
    function next() { go(idx + 1); }
    function prev() { go(idx - 1); }

    document.querySelector('.testi-prev')?.addEventListener('click', prev);
    document.querySelector('.testi-next')?.addEventListener('click', next);
    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
    const wrap = document.querySelector('.testi-wrap');
    wrap?.addEventListener('mouseenter', stopTimer);
    wrap?.addEventListener('mouseleave', startTimer);
    toggle?.addEventListener('click', () => {
      userPaused = !userPaused;
      toggle.textContent = userPaused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-label', userPaused ? 'Play operating standards' : 'Pause operating standards');
      userPaused ? stopTimer() : startTimer();
    });
    document.addEventListener('visibilitychange', () => document.hidden ? stopTimer() : startTimer());
    go(0);
    if (isReduced && toggle) {
      toggle.textContent = 'Play';
      toggle.setAttribute('aria-label', 'Play operating standards');
    }
  }

                                            
  function commandRing() {
    const rows = Array.from(document.querySelectorAll('.command-layout .discipline-row'));
    const nodes = Array.from(document.querySelectorAll('.command-node'));
    const core = document.querySelector('.command-core');
    const name = document.getElementById('commandName');
    const meta = document.getElementById('commandMeta');
    const route = document.getElementById('commandRoute');
    if (!rows.length || !nodes.length) return;

    const content = {
      '01': ['Airport Meet & Assist', 'Arrival secured before touchdown.'],
      '02': ['Private Aviation', 'Aircraft, slots and handling aligned.'],
      '03': ['Ground Mobility', 'Every transfer choreographed to the minute.'],
      '04': ['Accommodation', 'The right address, prepared in advance.'],
      '05': ['Lifestyle Desk', 'Personal detail handled without friction.'],
      '06': ['Yacht & Marine', 'Vessel, crew and itinerary in one brief.'],
      '07': ['Events & Access', 'Access becomes a complete experience.'],
      '08': ['Executive Travel', 'Complex movement, one named owner.'],
      '09': ['Membership', 'A standing relationship, ready before the ask.'],
    };

    let current = '01';
    function activate(key, immediate) {
      const detail = content[key];
      if (!detail || key === current && !immediate) return;
      current = key;
      rows.forEach((row) => row.classList.toggle('is-active', row.dataset.command === key));
      nodes.forEach((node) => node.classList.toggle('is-active', node.dataset.command === key));
      if (route) route.style.transform = 'rotate(' + (-90 + (Number(key) - 1) * 40) + 'deg)';

      const applyText = () => {
        if (name) name.textContent = detail[0];
        if (meta) meta.textContent = detail[1];
      };
      if (immediate || isReduced || !core) { applyText(); return; }
      core.classList.add('is-switching');
      window.setTimeout(() => {
        applyText();
        core.classList.remove('is-switching');
      }, 150);
    }

    [...rows, ...nodes].forEach((el) => {
      el.addEventListener('mouseenter', () => activate(el.dataset.command));
      el.addEventListener('focus', () => activate(el.dataset.command));
    });

                                                                              
                                                                        
                                                                            
                                                        
    let ticking = false;
    function updateFromScroll() {
      ticking = false;
      const centerY = innerHeight * 0.5;
      let closest = null;
      let closestDist = Infinity;
      rows.forEach((row) => {
        const rect = row.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) return;
        const rowCenter = rect.top + rect.height / 2;
        const dist = Math.abs(rowCenter - centerY);
        if (dist < closestDist) { closestDist = dist; closest = row; }
      });
      if (closest) activate(closest.dataset.command);
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(updateFromScroll); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateFromScroll();
    activate('01', true);
  }

                                                     
  function emReveals() {
    if (!gsapOK) return;
    document.querySelectorAll('.section-title').forEach((el) => {
      gsap.fromTo(el.querySelectorAll('em'), { opacity: 0, y: 10 }, {
        opacity: 1, y: 0, duration: 1.2, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' },
      });
    });
  }

                                                           
  function networkReveal() {
    if (!gsapOK || isReduced) return;
    const badges = document.querySelectorAll('.region-badges span');
    if (!badges.length) return;
    ScrollTrigger.create({
      trigger: '.region-badges',
      start: 'top 85%',
      onEnter: () => {
        gsap.fromTo(badges,
          { opacity: 0, y: 14, scale: 0.9 },
          { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.06, ease: 'power3.out' });
      },
      once: true,
    });
  }

                                                            
  function opsClock() {
    const el = document.querySelector('[data-local-clock]');
    if (!el) return;
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    function tick() { el.textContent = 'Local ' + fmt.format(new Date()); }
    tick();
    setInterval(tick, 30000);
  }

  window.pageInit = function () {
    heroReveal();
    particles();
    constellation();
    testimonials();
    commandRing();
    networkReveal();
    opsClock();
  };
})();
