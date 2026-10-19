// Made By Eng Nayer Nader
(function () {
  'use strict';

  function briefSignal() {
    const form = document.getElementById('secureForm');
    if (!form) return;
    const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]):not(.hp-field), select, textarea'));
    const heading = form.querySelector('.form-heading');
    const meter = document.createElement('div');
    meter.className = 'brief-meter';
    meter.setAttribute('aria-hidden', 'true');
    meter.innerHTML = '<span>Private brief</span><i><em></em></i><b>0%</b>';
    heading?.insertAdjacentElement('afterend', meter);
    const fill = meter.querySelector('em');
    const value = meter.querySelector('b');

    const update = () => {
      const completed = fields.filter((field) => field.type === 'checkbox' ? field.checked : field.value.trim() !== '').length;
      const pct = Math.round((completed / Math.max(1, fields.length)) * 100);
      if (fill) fill.style.transform = 'scaleX(' + (pct / 100) + ')';
      if (value) value.textContent = pct + '%';
    };
    fields.forEach((field) => {
      field.addEventListener('focus', () => form.classList.add('signal-active'));
      field.addEventListener('blur', () => form.classList.remove('signal-active'));
      field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', update);
    });
    update();
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

  window.pageInit = function () { briefSignal(); opsClock(); };

  window.addEventListener('cl:inquiry-result', function (event) {
    var detail = event.detail || {};
    if (window.CLAnalytics) window.CLAnalytics.track(detail.success ? 'form_submit_success' : 'form_submit_failure', { form_id: 'secureForm', reference: detail.reference || null });
  });
})();
