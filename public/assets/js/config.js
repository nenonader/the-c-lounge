// Made By Eng Nayer Nader
// The C Lounge — front-end endpoint resolution.
//
// The private API is served from the SAME origin as the site on Render
// (clounge-web hosts both the static build and /api/*), so same-origin is the
// default. Override before this script loads only when the API lives elsewhere:
//   <script>window.CL_API_BASE = 'https://api.thecloungeworld.com';</script>
(function () {
  'use strict';

  var explicit = typeof window.CL_API_BASE === 'string' ? window.CL_API_BASE : null;
  var isFile = window.location.protocol === 'file:';

  // Same-origin by default; relative paths keep the CSP connect-src at 'self'.
  var base = explicit !== null ? explicit : (isFile ? '' : '');

  window.CL_API_BASE = base;
  window.CL_FORM_ENDPOINT = base + '/api/inquiries';
  window.CL_CHAT_ENDPOINT = base + '/api/chat';
  window.CL_HEALTH_ENDPOINT = base + '/api/health';
  window.CL_ANALYTICS_ENDPOINT = base + '/api/analytics/events';
  window.CL_SIGNATURE = 'Made By Eng Nayer Nader';
})();
