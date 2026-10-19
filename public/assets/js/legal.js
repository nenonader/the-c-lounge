// Made By Eng Nayer Nader
(function () {
  'use strict';

  function smoothToc() {
    document.querySelectorAll('.legal-toc a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = a.getAttribute('href');
        if (window.CLScrollTo) window.CLScrollTo(target);
        else document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  window.pageInit = function () {
    smoothToc();
  };
})();
