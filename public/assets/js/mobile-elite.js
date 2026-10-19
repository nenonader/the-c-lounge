/* =============================================================================
   THE C LOUNGE — MOBILE ELITE RUNTIME
   Made By Eng Nayer Nader

   Progressive enhancement only. It never replaces main.js; it hardens the
   handheld behaviours main.js sets up:
     - true iOS-safe scroll locking that preserves position
     - dynamic viewport unit for browsers without dvh
     - drawer close on Escape, back gesture, outside tap, swipe and resize
     - focus containment and aria-hidden correctness
     - inert background content while the drawer is open
     - double-tap zoom suppression on controls
   Loaded with `defer`, after main.js.
   ============================================================================= */
(function () {
  'use strict';

  var SIGNATURE = 'Made By Eng Nayer Nader';
  var doc = document;
  var body = doc.body;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------------- */
  /* Dynamic viewport height (fallback for browsers without dvh/svh)         */
  /* ---------------------------------------------------------------------- */
  function setViewportUnit() {
    doc.documentElement.style.setProperty('--vh-unit', window.innerHeight * 0.01 + 'px');
  }
  setViewportUnit();
  var vhTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(vhTimer);
    vhTimer = setTimeout(setViewportUnit, 120);
  }, { passive: true });
  window.addEventListener('orientationchange', function () {
    setTimeout(setViewportUnit, 220);
  }, { passive: true });

  /* Keep fixed mobile UI above the on-screen keyboard. */
  function syncVisualViewport() {
    var viewport = window.visualViewport;
    var height = viewport ? viewport.height : window.innerHeight;
    doc.documentElement.style.setProperty('--cl-viewport-height', height + 'px');
    if (!viewport || window.innerWidth > 640) {
      body.classList.remove('cl-keyboard-open');
      return;
    }
    var covered = Math.max(0, window.innerHeight - height - (viewport.offsetTop || 0));
    body.classList.toggle('cl-keyboard-open', covered > 120);
  }
  syncVisualViewport();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true });
  }

  /* ---------------------------------------------------------------------- */
  /* Scroll lock that survives iOS Safari                                    */
  /* ---------------------------------------------------------------------- */
  var lockedScrollY = 0;
  var lockCount = 0;

  function lockScroll() {
    if (lockCount++ > 0) return;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    body.style.top = '-' + lockedScrollY + 'px';
    body.classList.add('cl-scroll-locked');
  }

  function unlockScroll() {
    if (lockCount === 0) return;
    if (--lockCount > 0) return;
    body.classList.remove('cl-scroll-locked');
    body.style.top = '';
    // Restore without triggering smooth-scroll animation.
    var behavior = doc.documentElement.style.scrollBehavior;
    doc.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, lockedScrollY);
    doc.documentElement.style.scrollBehavior = behavior;
  }

  window.CLScrollLock = { lock: lockScroll, unlock: unlockScroll };

  /* ---------------------------------------------------------------------- */
  /* Navigation drawer hardening                                             */
  /* ---------------------------------------------------------------------- */
  var toggle = doc.getElementById('navToggle');
  var drawer = doc.getElementById('navMobile');

  if (toggle && drawer) {
    var lastFocused = null;
    var historyPushed = false;

    function isOpen() {
      return drawer.classList.contains('open');
    }

    function focusables() {
      // getClientRects() is used rather than offsetParent: offsetParent is null
      // for position:fixed subtrees, which is exactly what this drawer is, so
      // the old check could return an empty list and break the focus trap.
      return Array.prototype.filter.call(
        drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (el) {
          return el.getClientRects().length > 0 && !el.hasAttribute('aria-hidden');
        }
      );
    }

    // Everything outside the drawer is made inert while it is open, so a screen
    // reader or a Tab press cannot reach the page behind it. Documented in this
    // file's header since V55 but never actually implemented until V58.
    var inertTargets = [];
    function setBackgroundInert(on) {
      if (on) {
        inertTargets = Array.prototype.filter.call(
          doc.body.children,
          function (el) { return el !== drawer && !el.contains(drawer); }
        );
        inertTargets.forEach(function (el) {
          if (el.hasAttribute('inert')) { el.dataset.clWasInert = '1'; return; }
          el.setAttribute('inert', '');
        });
      } else {
        inertTargets.forEach(function (el) {
          if (el.dataset.clWasInert) { delete el.dataset.clWasInert; return; }
          el.removeAttribute('inert');
        });
        inertTargets = [];
      }
    }

    function openDrawer() {
      if (isOpen()) return;
      lastFocused = doc.activeElement;
      drawer.classList.add('open');
      toggle.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      drawer.setAttribute('aria-hidden', 'false');
      body.classList.add('cl-nav-open');
      setBackgroundInert(true);
      lockScroll();
      if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();
      // Back gesture / hardware back closes the drawer instead of leaving.
      try {
        history.pushState({ clDrawer: true }, '');
        historyPushed = true;
      } catch (e) { historyPushed = false; }
      var first = focusables()[0];
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, reduced ? 0 : 120);
    }

    // `reason` is one of: undefined (user dismissed), 'popstate' (back gesture
    // already unwound the entry), or 'navigation' (a drawer link is about to
    // load a new page).
    function closeDrawer(reason) {
      if (!isOpen()) return;
      var fromPop = reason === true || reason === 'popstate';
      drawer.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      drawer.setAttribute('aria-hidden', 'true');
      body.classList.remove('cl-nav-open');
      setBackgroundInert(false);
      unlockScroll();
      if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();
      // history.back() must NOT run when a drawer link is navigating. On iOS
      // Safari the queued back() and the pending navigation race each other:
      // the visitor taps "Our Story" and lands back on the page they came from,
      // or the drawer entry is left dangling in the stack. When the drawer is
      // closing because we are leaving the page anyway, just drop the flag.
      var unwindHistory = historyPushed && !fromPop && reason !== 'navigation';
      historyPushed = false;
      if (unwindHistory) {
        try { history.back(); } catch (e) { /* no-op */ }
      }
      // Returning focus to the toggle is right for a dismissal, but wrong when
      // the page is unloading — it would steal focus from the incoming document.
      if (reason !== 'navigation' && lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus({ preventScroll: true });
      }
    }

    window.CLDrawer = { open: openDrawer, close: closeDrawer, isOpen: isOpen };

    // Own the toggle: replace the node to drop any duplicate listeners so the
    // drawer can never end up half-open from two competing handlers.
    var freshToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(freshToggle, toggle);
    toggle = freshToggle;
    toggle.setAttribute('type', 'button');
    toggle.setAttribute('aria-controls', 'navMobile');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      if (isOpen()) closeDrawer(); else openDrawer();
    });

    // Any link closes the drawer before navigating.
    drawer.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      // An in-page anchor is a dismissal, not a navigation.
      closeDrawer(href.charAt(0) === '#' ? undefined : 'navigation');
    });

    // Escape.
    doc.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // Back gesture.
    window.addEventListener('popstate', function () {
      if (isOpen()) closeDrawer('popstate');
    });

    // Swipe up or right to dismiss.
    var startX = 0, startY = 0, tracking = false;
    drawer.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) { tracking = false; return; }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    drawer.addEventListener('touchend', function (event) {
      if (!tracking) return;
      tracking = false;
      var touch = event.changedTouches[0];
      if (!touch) return;
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      var horizontal = Math.abs(dx) > Math.abs(dy);
      if (horizontal && dx > 90) closeDrawer();
      else if (!horizontal && dy < -110 && drawer.scrollTop <= 0) closeDrawer();
    }, { passive: true });

    // Rotating to desktop width must not leave a locked page behind.
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (window.innerWidth > 1080 && isOpen()) closeDrawer();
      }, 140);
    }, { passive: true });

    // A backgrounded tab should never come back mid-animation.
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden && isOpen()) closeDrawer();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Concierge panel: lock the page behind it on phones                      */
  /* ---------------------------------------------------------------------- */
  // The panel is injected by main.js, which may finish after this deferred
  // script runs, and the phone breakpoint can be crossed by a rotation. Both
  // used to leave the page scrollable behind an open chat panel.
  var chatObserver = null;
  function watchChatPanel() {
    var chatPanel = doc.getElementById('chatPanel');
    if (!chatPanel || chatObserver) return;
    chatObserver = new MutationObserver(function () {
      var phone = window.matchMedia('(max-width: 640px)').matches;
      var open = phone
        && (chatPanel.classList.contains('open') || chatPanel.getAttribute('aria-hidden') === 'false');
      if (open && !chatPanel.dataset.clLocked) {
        chatPanel.dataset.clLocked = '1';
        lockScroll();
      } else if (!open && chatPanel.dataset.clLocked) {
        delete chatPanel.dataset.clLocked;
        unlockScroll();
      }
    });
    chatObserver.observe(chatPanel, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  }
  watchChatPanel();
  if (!chatObserver) {
    window.addEventListener('load', watchChatPanel, { once: true });
    setTimeout(watchChatPanel, 1500);
  }

  /* ---------------------------------------------------------------------- */
  /* Suppress double-tap zoom on controls (iOS)                              */
  /* ---------------------------------------------------------------------- */
  var lastTouchEnd = 0;
  doc.addEventListener('touchend', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (!target.closest('button, .btn, .nav-toggle, .chat-quick, .nav-mobile a')) return;
    var now = Date.now();
    if (now - lastTouchEnd <= 320) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  /* ---------------------------------------------------------------------- */
  /* Pause heavy media when the page is not visible (battery)                */
  /* ---------------------------------------------------------------------- */
  doc.addEventListener('visibilitychange', function () {
    var videos = doc.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      if (doc.hidden) { try { videos[i].pause(); } catch (e) {} }
      else if (videos[i].hasAttribute('autoplay') || videos[i].dataset.heroVideo !== undefined) {
        var play = videos[i].play();
        if (play && play.catch) play.catch(function () {});
      }
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Signature                                                               */
  /* ---------------------------------------------------------------------- */
  try {
    doc.documentElement.setAttribute('data-signature', SIGNATURE);
    if (window.console && console.log) {
      console.log('%cThe C Lounge', 'color:#c6a66a;font:600 18px/1.4 serif;letter-spacing:.28em');
      console.log('%c' + SIGNATURE, 'color:#8b8b8b;font:11px/1.6 monospace;letter-spacing:.14em');
    }
  } catch (e) { /* no-op */ }
})();
