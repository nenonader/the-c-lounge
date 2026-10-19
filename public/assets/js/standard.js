// Made By Eng Nayer Nader
(function () {
  'use strict';

  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function journeyStory() {
    const story = document.getElementById('journeyStory');
    if (!story) return;

    const chapters = Array.from(story.querySelectorAll('.journey-chapter'));
    const images = Array.from(story.querySelectorAll('.journey-stage-image'));
    const no = story.querySelector('[data-stage-no]');
    const kicker = story.querySelector('[data-stage-kicker]');
    const title = story.querySelector('[data-stage-title]');
    const progress = story.querySelector('[data-stage-progress]');
    if (!chapters.length) return;

    let active = -1;
    function activate(index) {
      const next = Math.max(0, Math.min(chapters.length - 1, index));
      if (next === active) return;
      active = next;
      const chapter = chapters[next];
      const step = chapter.dataset.step || String(next + 1).padStart(2, '0');

      chapters.forEach((item, i) => item.classList.toggle('is-active', i === next));
      images.forEach((item) => {
        const selected = item.dataset.stageImage === step;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-hidden', String(!selected));
      });
      if (no) no.textContent = step + ' / ' + String(chapters.length).padStart(2, '0');
      if (kicker) kicker.textContent = chapter.dataset.kicker || '';
      if (title) title.textContent = chapter.dataset.title || '';
      if (progress) progress.style.transform = 'scaleX(' + ((next + 1) / chapters.length) + ')';
    }

    activate(0);
    if (isReduced || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top - innerHeight * 0.43) - Math.abs(b.boundingClientRect.top - innerHeight * 0.43));
      if (!visible.length) return;
      activate(chapters.indexOf(visible[0].target));
    }, { rootMargin: '-34% 0px -42% 0px', threshold: 0.01 });

    chapters.forEach((chapter) => observer.observe(chapter));
  }

  window.pageInit = function () {
    journeyStory();
  };
})();
