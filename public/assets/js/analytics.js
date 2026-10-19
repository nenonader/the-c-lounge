// Made By Eng Nayer Nader
(function () {
  'use strict';

  var STORAGE_VISITOR = 'cl_visitor_id';
  var STORAGE_SESSION = 'cl_session_id';
  var endpoint = function () { return window.CL_ANALYTICS_ENDPOINT || '/api/analytics/events'; };
  var visitorId = null;
  var sessionId = null;
  var pageStartedAt = Date.now();
  var sentScroll = {};
  var formStarted = {};

  function id() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function storageGet(key, session) {
    try { return (session ? window.sessionStorage : window.localStorage).getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value, session) {
    try { (session ? window.sessionStorage : window.localStorage).setItem(key, value); } catch (_) {}
  }

  visitorId = storageGet(STORAGE_VISITOR, false) || id();
  sessionId = storageGet(STORAGE_SESSION, true) || id();
  storageSet(STORAGE_VISITOR, visitorId, false);
  storageSet(STORAGE_SESSION, sessionId, true);

  function deviceType() {
    var w = window.innerWidth || 0;
    if (w < 768) return 'mobile';
    if (w < 1200) return 'tablet';
    return 'desktop';
  }

  function basePayload() {
    return {
      visitor_id: visitorId,
      session_id: sessionId,
      page_path: window.location.pathname + window.location.search + window.location.hash,
      page_title: document.title,
      referrer: document.referrer || null,
      language: navigator.language || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      country: (navigator.language || '').split('-')[1] || null,
      device_type: deviceType(),
      screen: String(window.screen && window.screen.width || '') + 'x' + String(window.screen && window.screen.height || ''),
    };
  }

  function send(eventType, data, options) {
    var payload = basePayload();
    payload.event_type = eventType;
    payload.occurred_at = new Date().toISOString();
    if (data && typeof data === 'object') payload.data = data;
    if (options && options.value !== undefined) payload.value = Number(options.value);
    if (options && options.currency) payload.currency = options.currency;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && (!options || options.beacon !== false)) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint(), blob)) return;
      }
    } catch (_) {}
    try {
      fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  window.CLAnalytics = {
    track: send,
    identify: function (data) { send('visitor_identified', data); },
    value: function (eventType, amount, currency, data) { send(eventType || 'commercial_value', data, { value: amount, currency: currency }); },
    getVisitorId: function () { return visitorId; },
    getSessionId: function () { return sessionId; },
    headers: function () { return { 'X-Visitor-Id': visitorId, 'X-Analytics-Session': sessionId }; },
  };

  function visibleText(el) {
    return String((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  }

  function pathFor(el) {
    if (!el) return null;
    var href = el.getAttribute('href');
    return href ? href.slice(0, 500) : null;
  }

  document.addEventListener('click', function (event) {
    var el = event.target.closest && event.target.closest('a,button,[role="button"]');
    if (!el) return;
    var explicit = el.getAttribute('data-analytics-event');
    send(explicit || 'interaction', {
      element: el.tagName.toLowerCase(),
      label: visibleText(el),
      href: pathFor(el),
      id: el.id || null,
      class_name: String(el.className || '').slice(0, 200),
    });
  }, true);

  document.addEventListener('focusin', function (event) {
    var field = event.target;
    if (!field || !field.name || !field.form) return;
    var formId = field.form.id || field.form.getAttribute('name') || 'form';
    if (!formStarted[formId]) {
      formStarted[formId] = true;
      send('form_started', { form_id: formId, page: window.location.pathname });
    }
    send('form_field_focus', { form_id: formId, field: field.name });
  }, true);

  document.addEventListener('change', function (event) {
    var field = event.target;
    if (!field || !field.name || !field.form) return;
    var formId = field.form.id || field.form.getAttribute('name') || 'form';
    var data = { form_id: formId, field: field.name };
    if (field.tagName === 'SELECT') data.selection = String(field.value || '').slice(0, 160);
    if (field.type === 'checkbox' || field.type === 'radio') data.selected = Boolean(field.checked);
    send('form_field_change', data);
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.tagName) return;
    send('form_submit_attempt', { form_id: form.id || form.getAttribute('name') || 'form' });
  }, true);

  function scrollMilestone() {
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    var pct = Math.round((window.scrollY / max) * 100);
    [25, 50, 75, 90].forEach(function (mark) {
      if (pct >= mark && !sentScroll[mark]) {
        sentScroll[mark] = true;
        send('scroll_depth', { percent: mark });
      }
    });
  }

  window.addEventListener('scroll', scrollMilestone, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      send('page_exit', { duration_seconds: Math.max(0, Math.round((Date.now() - pageStartedAt) / 1000)) });
    }
  });

  window.addEventListener('beforeunload', function () {
    send('page_exit', { duration_seconds: Math.max(0, Math.round((Date.now() - pageStartedAt) / 1000)) });
  });

  send('page_view');
}());
