// Made By Eng Nayer Nader
(function () {
  'use strict';

  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = typeof window.gsap !== 'undefined';
  const hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined';

                                                 
  let lenis = null;
  if (typeof Lenis !== 'undefined' && !isReduced) {
    lenis = new Lenis({
      duration: 1.35,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    if (hasScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
                                                                            
                                                                            
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  window.CLenis = lenis;
  window.CLScrollTo = (target) => {
    if (lenis) lenis.scrollTo(target, { offset: -70, duration: 1.4 });
    else document.querySelector(target)?.scrollIntoView({ behavior: isReduced ? 'auto' : 'smooth' });
  };

                                           
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (dot && ring && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    const onMove = (e) => { mx = e.clientX; my = e.clientY; dot.style.left = mx + 'px'; dot.style.top = my + 'px'; };
    const rafCursor = () => {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
      requestAnimationFrame(rafCursor);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    requestAnimationFrame(rafCursor);
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('a, button, .discipline-row, .index-item, select, .testi-arrow');
      document.body.classList.toggle('cursor-on-hover', !!t);
    });
  }

                                       
  const preloader = document.getElementById('preloader');
  const preFill = preloader?.querySelector('.preloader-bar span');
  const preRing = preloader?.querySelector('.preloader-ring .fill');
  const heroLoad = () => document.body.classList.add('hero-load');
  const PRELOAD_KEY = 'clPreloaded';

  function runPreloader(cb) {
    if (!preloader) { cb && cb(); return; }
                                                                             
                                                                           
    if (isReduced || sessionStorage.getItem(PRELOAD_KEY) === '1') {
      preloader.style.display = 'none';
      heroLoad();
      cb && cb();
      return;
    }
    const letters = preloader.querySelectorAll('.pw');
    letters.forEach((l, i) => l.style.animationDelay = (0.25 + i * 0.06) + 's');

    let p = 0;
    let assetsReady = document.readyState === 'complete';
    const startedAt = performance.now();
    window.addEventListener('load', () => { assetsReady = true; }, { once: true });
    setTimeout(() => { assetsReady = true; }, 4500);
    const timer = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const ceiling = assetsReady && elapsed > 650 ? 100 : 92;
      p += Math.max(0.8, (ceiling - p) * 0.16);
      if (p >= 99.5 && ceiling === 100) { p = 100; clearInterval(timer); }
      if (preFill) preFill.style.width = p + '%';
      if (preRing) preRing.style.strokeDashoffset = String(339 * (1 - p / 100));
      if (p >= 100) {
        setTimeout(() => {
          sessionStorage.setItem(PRELOAD_KEY, '1');
          preloader.classList.add('panel-out');
          setTimeout(() => { preloader.style.display = 'none'; }, 1000);
          heroLoad();
          cb && cb();
        }, 220);
      }
    }, 80);
  }

                                             
  const transScreen = document.getElementById('transitionScreen');
  const transitionEl = transScreen?.querySelector('span');
  const TRANS_KEY = 'clTransition';

  function showTransition() {
    if (!transScreen || isReduced || !hasGSAP) return;
    gsap.set(transScreen, { yPercent: -100 });
    if (transitionEl) transitionEl.textContent = 'The C Lounge';
    gsap.to(transitionEl, { opacity: 1, duration: 0.35, delay: 0.15 });
    gsap.to(transScreen, { yPercent: 0, duration: 0.65, ease: 'power3.inOut', delay: 0.05 });
  }

  function hideTransition() {
    if (!transScreen || isReduced || !hasGSAP) return;
    const screen = transScreen;
    if (transitionEl) gsap.to(transitionEl, { opacity: 0, duration: 0.3, delay: 0.2 });
    gsap.to(screen, {
      yPercent: -100, duration: 0.75, ease: 'power3.inOut', delay: 0.3,
      onComplete: () => { gsap.set(screen, { yPercent: -100 }); },
    });
  }

  window.addEventListener('pageshow', (event) => {
    if (!transScreen || isReduced) return;
    if (event.persisted) {
      sessionStorage.removeItem(TRANS_KEY);
      if (hasGSAP) gsap.set(transScreen, { yPercent: -100 });
      else transScreen.style.transform = 'translateY(-100%)';
      if (transitionEl) transitionEl.style.opacity = '0';
      return;
    }
    if (sessionStorage.getItem(TRANS_KEY) === 'out') {
      sessionStorage.removeItem(TRANS_KEY);
      showTransition();
      setTimeout(hideTransition, 420);
    }
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-transition]');
    if (!link) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
    e.preventDefault();
    sessionStorage.setItem(TRANS_KEY, 'out');
    if (!transScreen || isReduced || !hasGSAP) { location.href = href; return; }
    if (transitionEl) transitionEl.textContent = 'The C Lounge';
    gsap.set(transScreen, { yPercent: -100 });
    gsap.to(transitionEl, { opacity: 1, duration: 0.3, delay: 0.1 });
    gsap.to(transScreen, { yPercent: 0, duration: 0.6, ease: 'power3.inOut' });
    setTimeout(() => { location.href = href; }, 720);
  });

                                 
  const nav = document.getElementById('mainNav');
  const toggle = document.getElementById('navToggle');
  const mobile = document.getElementById('navMobile');

  function onScrollNav() {
    if (!nav) return;
    const scrolled = window.scrollY > 40;
    nav.classList.toggle('scrolled', scrolled);
    document.body.classList.toggle('nav-solid', scrolled);
  }
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  if (toggle && mobile) {
    const firstMobileLink = mobile.querySelector('a');
    let menuReturnFocus = null;
    toggle.setAttribute('aria-controls', 'navMobile');
    toggle.addEventListener('click', () => {
      const open = mobile.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      mobile.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (lenis) open ? lenis.stop() : lenis.start();
      if (open) {
        menuReturnFocus = document.activeElement;
        setTimeout(() => firstMobileLink?.focus(), 80);
      } else if (menuReturnFocus instanceof HTMLElement) {
        menuReturnFocus.focus();
      }
    });
    mobile.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      mobile.classList.remove('open');
      toggle.classList.remove('open');
      document.body.style.overflow = '';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      mobile.setAttribute('aria-hidden', 'true');
      if (lenis) lenis.start();
    }));
    document.addEventListener('keydown', (e) => {
      if (!mobile.classList.contains('open')) return;
      if (e.key === 'Tab') {
        const focusable = Array.from(mobile.querySelectorAll('a, button:not([disabled])'));
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      if (e.key !== 'Escape') return;
      mobile.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      mobile.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lenis) lenis.start();
      toggle.focus();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 1080 || !mobile.classList.contains('open')) return;
      mobile.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      mobile.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lenis) lenis.start();
    }, { passive: true });
  }

                                                              
  window.addEventListener('load', () => {
    requestAnimationFrame(() => {
      if (hasScrollTrigger) ScrollTrigger.refresh();
    });
  });

                                              
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        if (en.target.classList.contains('ornament')) animateOrnament(en.target);
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  document.querySelectorAll('.reveal, .reveal-fade, .reveal-scale, .img-reveal, .ornament').forEach((el) => io.observe(el));

  function animateOrnament(el) {
    const svg = el.querySelector('svg');
    if (!svg || isReduced) return;
    const drawables = svg.querySelectorAll('path, circle, line');
    if (!hasGSAP) return;
    gsap.fromTo(drawables,
      { strokeDasharray: 600, strokeDashoffset: 600 },
      { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut', stagger: 0.06 });
  }

                                      
  const counterEls = document.querySelectorAll('[data-count]');
  if (counterEls.length && !isReduced) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        cio.unobserve(el);
        const target = parseFloat(el.getAttribute('data-count'));
        const suffix = el.getAttribute('data-suffix') || '';
        const dur = 1800;
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.innerHTML = Math.round(target * eased) + '<sup>' + suffix + '</sup>';
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    counterEls.forEach((el) => cio.observe(el));
  } else if (isReduced) {
    counterEls.forEach((el) => {
      const suffix = el.getAttribute('data-suffix') || '';
      el.innerHTML = el.getAttribute('data-count') + (suffix ? '<sup>' + suffix + '</sup>' : '');
    });
  }

                                  
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

                                             
  (function activeNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    const map = { 'index.html': 'nav-home', 'services.html': 'nav-services', 'standard.html': 'nav-services', 'about.html': 'nav-about', 'gallery.html': 'nav-gallery', 'membership.html': 'nav-membership', 'contact.html': 'nav-contact' };
    const id = map[path];
    if (id) document.querySelectorAll('.' + id).forEach((a) => a.classList.add('active'));
    document.querySelectorAll('.nav-links a, .nav-mobile > a:not(.nav-mobile-cta)').forEach((a) => {
      const hrefPath = new URL(a.href, location.href).pathname.split('/').pop() || 'index.html';
      if (hrefPath === path) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  })();

  /* ==========================================================================
     PRIVATE CONCIERGE  —  v73
     --------------------------------------------------------------------------
     Made By Eng Nayer Nader

     What changed, and why each change exists:

     1.  CONTINUITY.  The site is multi-page. In v72 the conversation lived in
         a JS variable, so walking from the home page to Services threw the
         whole exchange away and the visitor started again from "Welcome."
         The transcript and session id now live in sessionStorage and are
         restored on every page.
     2.  HONEST WAITING.  A cold clounge-ai takes 30-60s to answer. v72 showed
         an empty bubble with a blinking caret for that entire time, which
         reads as broken. There is now a real "considering" indicator, and the
         panel pre-warms the upstream the moment it is opened, before the
         visitor has finished typing.
     3.  RECOVERABLE FAILURE.  A failed turn used to be a dead end. It now
         offers "Try again", which re-sends the exact message.
     4.  A LIVE STATUS LINE.  The header says whether the desk is reachable
         instead of always claiming it is.
     5.  ACCESSIBILITY.  Real dialog semantics, a focus trap that includes the
         composer, focus restoration, polite live-region announcements, and a
         composer that grows with the text instead of hiding it.
     ========================================================================== */

  const chatToggle = document.getElementById('chatToggle');
  const chatPanel = document.getElementById('chatPanel');
  const chatClose = document.getElementById('chatClose');
  const chatBody = document.getElementById('chatBody');
  const chatQuick = document.getElementById('chatQuick');
  const chatStatus = document.querySelector('.chat-header .ch-status');
  const CHAT_ENDPOINT = window.CL_CHAT_ENDPOINT || '';
  const CHAT_STORE_KEY = 'cl.concierge.v73';
  const CHAT_MAX_CHARS = 1200;

  let chatSessionId = null;
  let chatBusy = false;
  let lastFocusBeforeChat = null;
  let lastFailedMessage = null;

  const CHAT_REPLIES = {
    jet: {
      text: 'Of course. Our aviation desk can coordinate a private jet or helicopter worldwide. Share your route and preferred timing, and the desk will prepare a discreet solution.',
      href: 'contact.html?service=Private%20Aviation', label: 'Start an aviation enquiry',
    },
    airport: {
      text: 'We coordinate private Meet & Assist, fast-track, lounges and onward ground transport across 1,000+ airports. Tell the desk where you are flying.',
      href: 'contact.html?service=Airport%20VIP%20%26%20Meet%20and%20Assist', label: 'Arrange airport handling',
    },
    membership: {
      text: 'Membership is by application and invitation. Signature, Privé and Sovereign are calibrated to the reach of your world.',
      href: 'membership.html', label: 'View private membership',
    },
    human: {
      text: 'A member of the desk will respond personally and in strict confidence.',
      href: 'contact.html', label: 'Contact the private desk',
    },
    default: { text: 'Every request is handled personally and held in strict confidence.' },
  };

  /* --- Transcript persistence -------------------------------------------- */

  function readStore() {
    try {
      const raw = sessionStorage.getItem(CHAT_STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.turns)) return null;
      // A stale session on the server would 400 every turn. Six hours matches
      // SESSION_TTL_SECONDS on clounge-ai.
      if (Date.now() - Number(parsed.savedAt || 0) > 6 * 60 * 60 * 1000) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function writeStore() {
    try {
      const turns = Array.from(chatBody?.querySelectorAll('.chat-msg') || [])
        .filter((node) => !node.dataset.transient)
        .slice(-40)
        .map((node) => ({
          who: node.classList.contains('user') ? 'user' : 'bot',
          text: node.querySelector('.chat-copy')?.textContent || '',
        }))
        .filter((turn) => turn.text.trim());
      sessionStorage.setItem(CHAT_STORE_KEY, JSON.stringify({
        sessionId: chatSessionId, turns, savedAt: Date.now(),
      }));
    } catch (_) { /* private mode, quota, or storage disabled — never fatal */ }
  }

  function restoreTranscript() {
    const saved = readStore();
    if (!saved || !saved.turns.length || !chatBody) return false;
    chatSessionId = saved.sessionId || null;
    chatBody.innerHTML = '';
    saved.turns.forEach((turn) => addMsg(turn.text, turn.who));
    retireQuickPrompts(true);
    return true;
  }

  /* --- Panel -------------------------------------------------------------- */

  if (chatToggle && chatPanel) {
    chatToggle.setAttribute('aria-controls', 'chatPanel');
    chatToggle.setAttribute('aria-expanded', 'false');
    chatPanel.setAttribute('role', 'dialog');
    chatPanel.setAttribute('aria-modal', 'false');
    chatPanel.setAttribute('aria-label', 'C Lounge private concierge');
    chatPanel.setAttribute('aria-hidden', 'true');
  }
  if (chatBody) {
    chatBody.setAttribute('aria-live', 'polite');
    chatBody.setAttribute('aria-atomic', 'false');
    chatBody.setAttribute('role', 'log');
  }

  function toggleChat(open) {
    if (!chatPanel) return;
    const willOpen = open !== undefined ? open : !chatPanel.classList.contains('open');
    if (willOpen) lastFocusBeforeChat = document.activeElement;
    chatPanel.classList.toggle('open', willOpen);
    chatToggle?.setAttribute('aria-expanded', String(willOpen));
    chatPanel.setAttribute('aria-hidden', String(!willOpen));
    if (willOpen) {
      ensureChatComposer();
      loadAISuggestions();
      warmConcierge();
      restoreOnce();
      setTimeout(() => chatPanel.querySelector('.chat-composer textarea')?.focus(), 80);
    } else {
      (lastFocusBeforeChat instanceof HTMLElement ? lastFocusBeforeChat : chatToggle)?.focus();
    }
  }
  chatToggle?.addEventListener('click', () => toggleChat());
  chatClose?.addEventListener('click', () => toggleChat(false));

  let restored = false;
  function restoreOnce() {
    if (restored) return;
    restored = true;
    restoreTranscript();
    scrollChatToEnd(true);
  }

  /**
   * Wake clounge-ai before the visitor needs it. Render frees an idle instance
   * after ~15 minutes; without this the FIRST message of a quiet morning pays
   * the entire cold start while the visitor watches an empty bubble.
   */
  let warmedAt = 0;
  function warmConcierge() {
    if (!CHAT_ENDPOINT || Date.now() - warmedAt < 120000) return;
    warmedAt = Date.now();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    fetch((window.CL_API_BASE || '') + '/api/health', {
      signal: controller.signal, headers: { Accept: 'application/json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setDeskStatus(data ? 'online' : 'unknown'))
      .catch(() => setDeskStatus('unknown'));
  }

  function setDeskStatus(mode) {
    if (!chatStatus) return;
    const label = mode === 'online'
      ? 'Private Concierge · AI Assisted'
      : mode === 'degraded'
        ? 'Private Concierge · reaching the desk'
        : 'Private Concierge · AI Assisted';
    chatStatus.textContent = label;
    chatStatus.dataset.mode = mode;
  }

  /* --- Messages ----------------------------------------------------------- */

  function nearBottom() {
    if (!chatBody) return true;
    return chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 90;
  }

  function scrollChatToEnd(force) {
    if (!chatBody) return;
    if (force || nearBottom()) chatBody.scrollTop = chatBody.scrollHeight;
  }

  function addMsg(text, who, action) {
    const stick = nearBottom();
    const m = document.createElement('div');
    m.className = 'chat-msg ' + who;
    const copy = document.createElement('span');
    copy.className = 'chat-copy';
    copy.textContent = text;
    m.appendChild(copy);
    if (action?.href && action?.label) m.appendChild(buildAction(action));
    chatBody.appendChild(m);
    scrollChatToEnd(stick);
    return m;
  }

  function buildAction(action) {
    const a = document.createElement('a');
    a.className = 'chat-action';
    a.href = action.href;
    if (action.whatsapp) a.classList.add('is-whatsapp');
    if (action.href.startsWith('http')) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else if (!action.href.startsWith('mailto')) {
      a.setAttribute('data-transition', '');
    }
    a.textContent = action.label + ' →';
    return a;
  }

  /** The considering indicator. Replaces v72's empty bubble + blinking caret. */
  function showThinking() {
    const node = document.createElement('div');
    node.className = 'chat-msg bot chat-thinking';
    node.dataset.transient = 'true';
    node.setAttribute('aria-label', 'The concierge is composing a reply');
    node.innerHTML = '<span class="chat-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    chatBody.appendChild(node);
    scrollChatToEnd(true);
    return node;
  }

  /* --- Composer ----------------------------------------------------------- */

  function ensureChatComposer() {
    if (!chatPanel || chatPanel.querySelector('.chat-composer')) return;
    const form = document.createElement('form');
    form.className = 'chat-composer';
    form.setAttribute('novalidate', '');
    form.innerHTML =
      '<textarea name="message" rows="1" maxlength="' + CHAT_MAX_CHARS + '" '
      + 'aria-label="Message the private concierge" autocomplete="off" '
      + 'placeholder="Tell the desk what you have in mind…"></textarea>'
      + '<button type="submit" aria-label="Send message"><span aria-hidden="true">→</span></button>';
    const privacy = document.createElement('p');
    privacy.className = 'chat-privacy';
    privacy.textContent = 'AI-assisted · Do not share passport, payment or medical details here.';
    chatPanel.append(form, privacy);

    const input = form.elements.message;

    const autoGrow = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 132) + 'px';
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message || chatBusy) return;
      input.value = '';
      autoGrow();
      setQuickPromptsDimmed(false);
      sendAIMessage(message);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    // The moment the visitor starts composing their own message, the prompt
    // chips stop being an invitation and start being clutter competing with
    // what they are writing.
    input.addEventListener('input', (event) => {
      autoGrow();
      setQuickPromptsDimmed(event.target.value.trim().length > 0);
    });
    input.addEventListener('paste', () => setTimeout(() => {
      autoGrow();
      setQuickPromptsDimmed(true);
    }, 0));
  }

  function setQuickPromptsDimmed(dimmed) {
    if (!chatQuick) return;
    chatQuick.classList.toggle('is-dimmed', dimmed);
    if (dimmed) chatQuick.setAttribute('inert', '');
    else chatQuick.removeAttribute('inert');
  }

  function setComposerBusy(busy) {
    chatBusy = busy;
    const submit = chatPanel?.querySelector('.chat-composer button');
    const input = chatPanel?.querySelector('.chat-composer textarea');
    if (submit) submit.disabled = busy;
    if (input) input.setAttribute('aria-busy', String(busy));
    chatPanel?.classList.toggle('is-busy', busy);
  }

  /* --- Session & suggestions ---------------------------------------------- */

  async function getChatSession() {
    if (chatSessionId) return chatSessionId;
    if (!CHAT_ENDPOINT) return null;
    const response = await fetch(CHAT_ENDPOINT + '/new-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(window.CLAnalytics?.headers?.() || {}) },
      body: JSON.stringify({
        visitor_id: window.CLAnalytics?.getVisitorId?.() || null,
        analytics_session_id: window.CLAnalytics?.getSessionId?.() || null,
      }),
    });
    if (!response.ok) throw new Error('The private concierge is unavailable.');
    const data = await response.json();
    chatSessionId = data.session_id;
    writeStore();
    return chatSessionId;
  }

  async function loadAISuggestions() {
    if (!CHAT_ENDPOINT || !chatQuick || chatQuick.dataset.loaded === 'true') return;
    chatQuick.dataset.loaded = 'true';
    try {
      const response = await fetch(CHAT_ENDPOINT + '/suggestions', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data.suggestions) || !data.suggestions.length) return;
      if (chatQuick.dataset.retired === 'true') return;
      chatQuick.innerHTML = '';
      data.suggestions.slice(0, 5).forEach((prompt) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.prompt = prompt;
        button.textContent = prompt;
        chatQuick.appendChild(button);
      });
    } catch (_) { /* the elegant guided fallback remains available */ }
  }

  function retireQuickPrompts(immediate) {
    if (!chatQuick || chatQuick.dataset.retired === 'true') return;
    chatQuick.dataset.retired = 'true';
    chatQuick.classList.add('is-retired');
    chatQuick.setAttribute('inert', '');
    const collapse = () => {
      chatQuick.hidden = true;
      chatQuick.removeAttribute('inert');
    };
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) collapse();
    else setTimeout(collapse, 420);
  }

  /* --- The turn ------------------------------------------------------------ */

  async function sendAIMessage(message) {
    if (!chatBody || chatBusy) return;
    lastFailedMessage = null;
    addMsg(message, 'user');
    retireQuickPrompts();

    if (!CHAT_ENDPOINT) {
      const lower = message.toLowerCase();
      const key = lower.includes('membership') ? 'membership'
        : lower.includes('airport') ? 'airport'
          : (lower.includes('jet') || lower.includes('aviation')) ? 'jet' : 'human';
      const reply = CHAT_REPLIES[key] || CHAT_REPLIES.default;
      setTimeout(() => { addMsg(reply.text, 'bot', reply); writeStore(); }, 350);
      return;
    }

    setComposerBusy(true);
    const thinking = showThinking();
    let bubble = null;
    let copy = null;

    /** Swap the considering indicator for the real bubble on the first token. */
    const ensureBubble = () => {
      if (bubble) return;
      thinking.remove();
      bubble = addMsg('', 'bot');
      bubble.classList.add('is-streaming');
      copy = bubble.querySelector('.chat-copy');
    };

    try {
      const sessionId = await getChatSession();
      const response = await fetch(CHAT_ENDPOINT + '/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
          ...(window.CLAnalytics?.headers?.() || {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          message,
          visitor_id: window.CLAnalytics?.getVisitorId?.() || null,
          analytics_session_id: window.CLAnalytics?.getSessionId?.() || null,
        }),
      });
      if (!response.ok || !response.body) throw new Error('The private concierge is unavailable.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let degraded = false;

      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try { event = JSON.parse(line); } catch (_) { continue; }

          if (event.type === 'token') {
            ensureBubble();
            copy.textContent += event.text || '';
            scrollChatToEnd();
          }
          if (event.type === 'handoff' && event.ready && event.whatsapp_url) {
            ensureBubble();
            bubble.appendChild(buildAction({
              href: event.whatsapp_url,
              label: 'Confirm & continue on WhatsApp',
              whatsapp: true,
            }));
          }
          if (event.type === 'done' && event.degraded) degraded = true;
          if (event.type === 'error') throw new Error(event.message || 'The private concierge is unavailable.');
        }
        if (done) break;
      }

      ensureBubble();
      if (!copy.textContent.trim()) {
        copy.textContent = 'The private desk is ready to continue this conversation.';
      }
      setDeskStatus(degraded ? 'degraded' : 'online');
    } catch (_) {
      if (bubble) bubble.remove();
      thinking.remove();
      lastFailedMessage = message;
      setDeskStatus('degraded');
      const failure = addMsg(
        'I could not reach the private desk just now. Your request has not been lost — '
        + 'try once more, or place it directly and a member of the desk will respond personally.',
        'bot'
      );
      failure.classList.add('is-error');

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'chat-action is-retry';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => {
        if (chatBusy || !lastFailedMessage) return;
        const again = lastFailedMessage;
        failure.remove();
        // Drop the visitor's echoed message too, so the retry does not
        // duplicate it in the transcript.
        const previous = chatBody.querySelector('.chat-msg.user:last-of-type');
        if (previous && previous.querySelector('.chat-copy')?.textContent === again) previous.remove();
        sendAIMessage(again);
      });
      failure.appendChild(retry);
      failure.appendChild(buildAction({ href: 'contact.html', label: 'Place a private brief' }));
    } finally {
      bubble?.classList.remove('is-streaming');
      setComposerBusy(false);
      writeStore();
      scrollChatToEnd();
    }
  }

  chatQuick?.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const key = button.dataset.reply;
    const prompt = button.dataset.prompt || button.textContent.trim();
    if (CHAT_ENDPOINT || button.dataset.prompt) sendAIMessage(prompt);
    else {
      addMsg(prompt, 'user');
      const reply = CHAT_REPLIES[key] || CHAT_REPLIES.default;
      setTimeout(() => { addMsg(reply.text, 'bot', reply); writeStore(); }, 350);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!chatPanel?.classList.contains('open')) return;
    if (e.key === 'Escape') { toggleChat(false); return; }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(chatPanel.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )).filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Carry the conversation across page navigations on this multi-page site.
  window.addEventListener('pagehide', writeStore);
  if (readStore()) restoreOnce();

                                   
                                                                      
  const FORM_ENDPOINT = window.CL_FORM_ENDPOINT || '';

  function initForms() {
    const form = document.getElementById('secureForm');
    if (!form) return;
    const success = document.getElementById('formSuccess');
    const errorEl = document.getElementById('formError');
    const fields = form.querySelectorAll('input, textarea, select');
    fields.forEach((f) => {
      const evt = f.tagName === 'SELECT' ? 'change' : 'input';
      f.addEventListener(evt, () => f.closest('.field')?.classList.toggle('filled', String(f.value || '').trim() !== ''));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      const btnLabel = btn?.querySelector('span');
      const originalBtnLabel = btnLabel?.textContent || btn?.textContent || 'Submit';
      const setBtnLabel = (text) => {
        if (btnLabel) btnLabel.textContent = text;
        else if (btn) btn.textContent = text;
      };
      if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; setBtnLabel('Sending…'); }
      if (errorEl) errorEl.classList.remove('show');
      const data = Object.fromEntries(new FormData(form).entries());
      const lines = Object.entries(data)
        .filter(([, v]) => v && String(v).trim() !== '')
        .map(([k, v]) => k.replace(/[-_]/g, ' ') + ': ' + v)
        .join('\n');

      const showSuccess = (result = {}) => {
        if (!success) return;
        form.style.display = 'none';
        success.classList.add('show');
        const reference = document.getElementById('formReference');
        const whatsapp = document.getElementById('formWhatsApp');
        if (reference && result.reference) reference.textContent = 'Private reference · ' + result.reference;

        // The brief is saved either way, but the desk may not have been
        // notified (mail transport down). Saying "a member will contact you"
        // in that case is a promise the site cannot keep, so tell the visitor
        // the truth and give them a channel that works right now.
        if (result.notified === false) {
          const body = success.querySelector('p:not(.form-reference)');
          if (body && result.message) body.textContent = result.message;
          const desk = Array.isArray(result.desk_email)
            ? result.desk_email.join(', ')
            : result.desk_email;
          if (desk && body) {
            const direct = document.createElement('p');
            direct.className = 'form-direct-desk';
            direct.innerHTML = 'You can also reach the desk directly at <a href="mailto:'
              + String(desk).split(',')[0].trim()
              + '?subject=' + encodeURIComponent('Reference ' + (result.reference || ''))
              + '">' + String(desk).split(',')[0].trim() + '</a>.';
            body.insertAdjacentElement('afterend', direct);
          }
        }

        if (whatsapp && result.whatsapp_url) {
          whatsapp.href = result.whatsapp_url;
          whatsapp.hidden = false;
        }
        success.focus();
      };
      const showFailure = () => {
                                                                                
        const isMembership = location.pathname.endsWith('membership.html');
        const subject = encodeURIComponent(isMembership ? 'The C Lounge — Membership Application' : 'The C Lounge — Private Enquiry');
        const body = encodeURIComponent(lines + '\n\n(Submitted via thecloungeworld.com)');
        const mailbox = isMembership ? 'Private@TheCLoungeWorld.com' : 'Concierge@TheCLoungeWorld.com';
        if (errorEl) {
          errorEl.classList.add('show');
          errorEl.innerHTML = 'We could not reach our server just now. Please <a href="mailto:' + mailbox + '?subject=' + subject + '&body=' + body + '">send your request by email</a> and the private desk will respond directly.';
        } else {
          location.href = 'mailto:' + mailbox + '?subject=' + subject + '&body=' + body;
        }
        if (btn) { btn.disabled = false; btn.style.opacity = ''; setBtnLabel(originalBtnLabel); }
      };

      if (FORM_ENDPOINT) {
        try {
          const res = await fetch(FORM_ENDPOINT, {
            method: 'POST',
            headers: { Accept: 'application/json', ...(window.CLAnalytics?.headers?.() || {}) },
            body: new FormData(form),
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success !== false) { window.dispatchEvent(new CustomEvent('cl:inquiry-result', { detail: { success: true, reference: result.reference || null } })); window.CLAnalytics?.track('inquiry_submitted', { reference: result.reference || null, service: data.service || null, urgency: data.urgency || null, preferred_channel: data.preferred_channel || null }); showSuccess(result); } else { window.dispatchEvent(new CustomEvent('cl:inquiry-result', { detail: { success: false } })); window.CLAnalytics?.track('inquiry_failed', { status: res.status }); showFailure(); }
        } catch (err) {
          window.dispatchEvent(new CustomEvent('cl:inquiry-result', { detail: { success: false } }));
          window.CLAnalytics?.track('inquiry_failed', { reason: 'network' });
          showFailure();
        }
      } else {
                                                                              
                                                                               
        const isMembership = location.pathname.endsWith('membership.html');
        const mailbox = isMembership ? 'Private@TheCLoungeWorld.com' : 'Concierge@TheCLoungeWorld.com';
        const subject = encodeURIComponent(isMembership ? 'The C Lounge — Membership Application' : 'The C Lounge — Private Enquiry');
        const body = encodeURIComponent(lines + '\n\n(Prepared via thecloungeworld.com)');
        const mailto = 'mailto:' + mailbox + '?subject=' + subject + '&body=' + body;
        if (errorEl) {
          errorEl.classList.add('show');
          errorEl.innerHTML = 'Please <a href="' + mailto + '">continue in your email application</a> to place this request with the private desk.';
        }
        location.href = mailto;
        if (btn) { btn.disabled = false; btn.style.opacity = ''; setBtnLabel(originalBtnLabel); }
      }
    });
  }

                                                           
  function initParallax() {
    if (!hasGSAP || !hasScrollTrigger || isReduced) return;
    document.querySelectorAll('[data-parallax]').forEach((el) => {
      gsap.to(el, {
        yPercent: 18,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: 1 },
      });
    });
  }

                                                            
  function initScrollProgress() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;
    const set = () => {
      const h = document.documentElement;
      const max = (h.scrollHeight - h.clientHeight) || 1;
      const pct = Math.min(1, Math.max(0, (window.scrollY || h.scrollTop) / max));
      bar.style.transform = 'scaleX(' + pct + ')';
    };
    if (lenis) lenis.on('scroll', set);
    window.addEventListener('scroll', set, { passive: true });
    window.addEventListener('resize', set);
    set();
  }

                                  
  function boot() {
                                                                             
                                                                       
    const requestedService = new URLSearchParams(window.location.search).get('service');
    const serviceField = document.getElementById('f-service');
    if (requestedService && serviceField) {
      const match = Array.from(serviceField.options).find((o) => o.textContent.trim() === requestedService.trim());
      if (match) {
        serviceField.value = match.value || match.textContent;
        serviceField.closest('.field')?.classList.add('filled');
      }
    }
    const heroVideo = document.querySelector('[data-hero-video]');
    if (heroVideo) {
      const saveData = !!navigator.connection?.saveData;
      const isPhone = window.matchMedia('(max-width: 640px)').matches;
      const mobileSrc = heroVideo.dataset.srcMobile;
      // A phone now gets the portrait master. Without one it still falls back
      // to the poster, exactly as before — the landscape file is never played
      // on a phone, where it would be cropped to a sliver and cost 4MB.
      const allowMotion = !isReduced && !saveData && (!isPhone || !!mobileSrc);

      // Real handsets need these set as PROPERTIES, not just attributes, or the
      // autoplay gate rejects play() even on a muted element. Desktop and
      // DevTools emulation are more forgiving, which is why this only shows up
      // on a physical device.
      heroVideo.muted = true;
      heroVideo.defaultMuted = true;
      heroVideo.playsInline = true;
      heroVideo.setAttribute('playsinline', '');
      heroVideo.setAttribute('webkit-playsinline', '');

      if (allowMotion) {
        if (isPhone && mobileSrc) {
          heroVideo.querySelectorAll('source').forEach((s) => s.remove());
          const portrait = document.createElement('source');
          portrait.src = mobileSrc;
          portrait.type = 'video/mp4';
          heroVideo.appendChild(portrait);
          if (heroVideo.dataset.posterMobile) heroVideo.poster = heroVideo.dataset.posterMobile;
          heroVideo.load();
        }
        const tryPlay = () => heroVideo.play().catch(() => { /* poster remains */ });
        tryPlay();
        // Some Android builds refuse the first programmatic play() and allow it
        // only after the user touches the page. Retry once on the first gesture.
        const retryOnGesture = () => {
          tryPlay();
          ['touchstart', 'pointerdown', 'scroll'].forEach((e) =>
            window.removeEventListener(e, retryOnGesture));
        };
        ['touchstart', 'pointerdown', 'scroll'].forEach((e) =>
          window.addEventListener(e, retryOnGesture, { passive: true }));
      } else {
        heroVideo.pause();
        heroVideo.style.display = 'none';
      }
      document.addEventListener('visibilitychange', () => {
        if (!allowMotion) return;
        if (document.hidden) heroVideo.pause();
        else heroVideo.play().catch(() => {});
      });

      // Temporary on-device diagnostic. Append ?herodebug=1 to the URL to read
      // the real state on a physical phone, where there is no console. Remove
      // this block once the hero video is confirmed working.
      if (/[?&]herodebug=1/.test(location.search)) {
        const panel = document.createElement('pre');
        panel.style.cssText = 'position:fixed;left:8px;right:8px;top:80px;z-index:99999;' +
          'margin:0;padding:10px;font:11px/1.5 monospace;color:#0f0;background:rgba(0,0,0,.88);' +
          'border:1px solid #0f0;white-space:pre-wrap;pointer-events:none';
        document.body.appendChild(panel);
        const NET = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];
        const ERR = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' };
        const draw = () => {
          panel.textContent = [
            'viewport   ' + window.innerWidth + 'x' + window.innerHeight,
            'isPhone    ' + isPhone,
            'saveData   ' + saveData,
            'reduced    ' + isReduced,
            'allowMotion' + ' ' + allowMotion,
            'display    ' + getComputedStyle(heroVideo).display,
            'currentSrc ' + (heroVideo.currentSrc || '(none)').split('/').pop(),
            'networkSt  ' + NET[heroVideo.networkState],
            'readyState ' + heroVideo.readyState,
            'videoSize  ' + heroVideo.videoWidth + 'x' + heroVideo.videoHeight,
            'paused     ' + heroVideo.paused,
            'currentTime' + ' ' + heroVideo.currentTime.toFixed(2),
            'error      ' + (heroVideo.error ? ERR[heroVideo.error.code] : 'none')
          ].join('\n');
        };
        draw();
        setInterval(draw, 500);
      }
    }
    initForms();
    initParallax();
    initScrollProgress();
    runPreloader(() => {
      if (window.pageInit) window.pageInit();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
