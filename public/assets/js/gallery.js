// Made By Eng Nayer Nader
(function () {
  'use strict';
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsapOK = typeof gsap !== 'undefined';

                                                                       
                                                                        
                                                                          
                                                               
  const GALLERY = [
    { src:'images/gallery/g01.jpg', title:'Dusk Departure', tag:'Private Aviation', cat:'Aviation' },
    { src:'images/gallery/g02.jpg', title:'City Transfer', tag:'Chauffeured Mobility', cat:'Ground' },
    { src:'images/gallery/g03.jpg', title:'After-Hours Passage', tag:'Marine Navigation', cat:'Marine' },
    { src:'images/gallery/g04.jpg', title:'The Handoff', tag:'Private Concierge, Discreet Service', cat:'Residences' },
    { src:'images/gallery/g05.jpg', title:'Cabin Prepared', tag:'For Departure', cat:'Aviation' },
    { src:'images/gallery/g06.jpg', title:'Evening Arrival', tag:'Private Residence', cat:'Residences' },
    { src:'images/gallery/g07.jpg', title:'Final Detail', tag:'Evening Formalwear', cat:'Events' },
    { src:'images/gallery/g08.jpg', title:'Night Watch', tag:'Terminal Lounge', cat:'Aviation' },
    { src:'images/gallery/g09.jpg', title:'Discreet Entry', tag:'Private Event', cat:'Events' },
    { src:'images/gallery/g10.jpg', title:'Golden Hour', tag:'Tender Transfer', cat:'Marine' },
    { src:'images/gallery/g11.jpg', title:'Cabin Rest', tag:'In Flight', cat:'Aviation' },
    { src:'images/gallery/g12.jpg', title:'City Lights', tag:'Final Approach', cat:'Aviation' },
    { src:'images/gallery/g13.jpg', title:'The Private Desk', tag:'Every Detail', cat:'Events' },
    { src:'images/gallery/g14.jpg', title:'Coastal Convoy', tag:'Sunset Run', cat:'Ground' },
    { src:'images/gallery/g15.jpg', title:'Night Crossing', tag:'Marine, After Dark', cat:'Marine' },
    { src:'images/gallery/g16.jpg', title:'Good Night', tag:'Residence, Turndown', cat:'Residences' },
	{ src:'images/gallery/g17.jpg', title:'Come Aboard', tag:'Marine, Welcome Aboard', cat:'Marine' },
  ];
  const FEATURED = GALLERY[0];
  const GRID_ITEMS = GALLERY.slice(1);
  const CATEGORIES = ['All', 'Aviation', 'Ground', 'Marine', 'Residences', 'Events'];

  let activeFilter = 'All';

                                                      
  function buildFeatured() {
    const host = document.getElementById('galleryFeatured');
    if (!host) return;
    host.innerHTML = `
      <button class="g-open" type="button" aria-label="Open featured image: ${FEATURED.title}, ${FEATURED.tag}">
        <div class="g-img">
          <img src="${FEATURED.src}" alt="${FEATURED.title} — ${FEATURED.tag}" loading="eager" decoding="async"/>
        </div>
        <figcaption>
          <span class="g-eyebrow">${FEATURED.tag}</span>
          <span class="g-title">${FEATURED.title}</span>
        </figcaption>
      </button>
    `;
    const featuredButton = host.querySelector('.g-open');
    featuredButton.addEventListener('click', () => openLightbox(-1, featuredButton));
    if (isReduced) { host.classList.add('in'); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { host.classList.add('in'); io.disconnect(); } });
    }, { threshold: 0.1 });
    io.observe(host);
  }

                                         
  function buildFilters() {
    const host = document.getElementById('galleryFilters');
    if (!host) return;
    host.innerHTML = CATEGORIES.map((cat) => {
      const count = cat === 'All' ? GRID_ITEMS.length : GRID_ITEMS.filter(g => g.cat === cat).length;
      return `<button class="g-filter${cat === 'All' ? ' active' : ''}" type="button" data-filter="${cat}" aria-pressed="${cat === 'All'}">${cat}<span class="g-count">${String(count).padStart(2,'0')}</span></button>`;
    }).join('');
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('.g-filter');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      host.querySelectorAll('.g-filter').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      applyFilter();
    });
  }

  function applyFilter() {
    const items = document.querySelectorAll('.g-item');
    items.forEach((el) => {
      const idx = parseInt(el.dataset.i, 10);
      const match = activeFilter === 'All' || GRID_ITEMS[idx].cat === activeFilter;
      el.classList.toggle('filtered-out', !match);
      el.setAttribute('aria-hidden', String(!match));
      el.querySelector('.g-open')?.setAttribute('tabindex', match ? '0' : '-1');
      if (match && !el.classList.contains('in')) {
                                                                            
        if (gsapOK && !isReduced) {
          gsap.to(el, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' });
        }
        el.classList.add('in');
      }
    });
  }

                                        
                                                                     
                                                                            
                                                                          
                                                                            
                                                                        
                                                                    
  let currentColCount = 0;
  function colCountForWidth() {
    if (window.innerWidth <= 640) return 1;
    if (window.innerWidth <= 1080) return 2;
    return 3;
  }
  function buildMasonry() {
    const grid = document.getElementById('masonryGrid');
    if (!grid) return;
    const count = colCountForWidth();
    if (count === currentColCount) return;
    currentColCount = count;
    grid.innerHTML = '';

    const cols = [];
    for (let c = 0; c < count; c++) {
      const col = document.createElement('div');
      col.className = 'masonry-col';
      grid.appendChild(col);
      cols.push({ el: col, height: 0 });
    }

    GRID_ITEMS.forEach((item, i) => {
      const isTall = i % 3 === 1;
                                                                            
                                                                            
      const estHeight = (isTall ? 4 / 3 : 3 / 4) * 100 + 44;

      const fig = document.createElement('figure');
      fig.className = 'g-item' + (isTall ? ' g-tall' : '');
      fig.dataset.i = i;
      const match = activeFilter === 'All' || item.cat === activeFilter;
      if (!match) fig.classList.add('filtered-out');
      fig.innerHTML = `
        <button class="g-open" type="button" aria-label="Open image ${i + 2}: ${item.title}, ${item.tag}">
          <div class="g-img">
            <img src="${item.src}" alt="${item.title} — ${item.tag}" loading="lazy" decoding="async"/>
            <div class="g-frame" aria-hidden="true"></div>
          </div>
          <figcaption>
            <span class="g-cap-title">${item.title}</span>
            <span class="g-cap-tag">${item.tag}</span>
          </figcaption>
        </button>
      `;
      const openButton = fig.querySelector('.g-open');
      fig.setAttribute('aria-hidden', String(!match));
      openButton.setAttribute('tabindex', match ? '0' : '-1');
      openButton.addEventListener('click', () => openLightbox(i, openButton));

                                              
      const shortest = cols.reduce((a, b) => (b.height < a.height ? b : a), cols[0]);
      shortest.el.appendChild(fig);
      shortest.height += estHeight;
    });
  }

                                              
  function revealItems() {
    const items = document.querySelectorAll('.g-item:not(.filtered-out)');
    if (!items.length) return;
    if (isReduced) {
      items.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        entry.target.classList.add('in');
        const idx = parseInt(entry.target.dataset.i || 0, 10);
        const delay = (idx % 3) * 0.08;
        if (gsapOK) {
          gsap.to(entry.target, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', delay });
        } else {
          setTimeout(() => entry.target.classList.add('in'), delay * 1000);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -3% 0px' });
    items.forEach(el => io.observe(el));
  }

                                   
                                                                          
                                                                         
  let currentIdx = -1;
  let returnFocus = null;
  function itemAt(i) { return i === -1 ? FEATURED : GRID_ITEMS[i]; }

  function openLightbox(i, trigger) {
    currentIdx = i;
    const item = itemAt(i);
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lbImg');
    const cap = document.getElementById('lbCap');
    const tally = document.getElementById('lbTally');
    const rail = document.getElementById('lbRail');
    if (!lb || !img) return;
    img.src = item.src;
    img.alt = item.title + ' — ' + item.tag;
    if (cap) cap.innerHTML = `<span class="lb-title">${item.title}</span><span class="lb-tag">${item.tag}</span>`;
    const ordinal = i + 2;                                    
    if (tally) tally.innerHTML = '<em>' + String(ordinal).padStart(2,'0') + '</em> / ' + GALLERY.length;
    if (rail) rail.style.width = (ordinal / GALLERY.length * 100) + '%';
    if (trigger) returnFocus = trigger;
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (window.CLenis) window.CLenis.stop();
    requestAnimationFrame(() => document.getElementById('lbClose')?.focus());

                                              
    const stage = document.querySelector('.lightbox-stage');
    if (stage && gsapOK && !isReduced) {
      gsap.fromTo(stage, { scale: 0.92, opacity: 0, y: 14 }, {
        scale: 1, opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
      });
      const figcap = stage.querySelector('figcaption');
      if (figcap) {
        gsap.fromTo(figcap, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', delay: 0.2 });
      }
    }
  }
  function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (window.CLenis) window.CLenis.start();
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  }
  function navLightbox(dir) {
                                                                           
    const total = GALLERY.length;
    let ordinal = currentIdx + 1;                                   
    ordinal = (ordinal + dir + total) % total;
    openLightbox(ordinal - 1);
  }

  function initLightbox() {
    document.getElementById('lbClose')?.addEventListener('click', closeLightbox);
    document.getElementById('lbPrev')?.addEventListener('click', () => navLightbox(-1));
    document.getElementById('lbNext')?.addEventListener('click', () => navLightbox(1));
    document.getElementById('lightbox')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('lightbox')) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      const lb = document.getElementById('lightbox');
      if (!lb?.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navLightbox(-1);
      if (e.key === 'ArrowRight') navLightbox(1);
      if (e.key === 'Tab') {
        const focusable = Array.from(lb.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  window.pageInit = function () {
    buildFeatured();
    buildFilters();
    buildMasonry();
    revealItems();
    initLightbox();
    const images = Array.from(document.querySelectorAll('.g-item img, .g-featured img'));
    Promise.allSettled(images.map((img) => img.decode ? img.decode() : Promise.resolve()))
      .then(() => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); });

                                                                       
                                                                       
                                                                       
                    
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const before = currentColCount;
        buildMasonry();
        if (currentColCount !== before) {
          revealItems();
          if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
        }
      }, 200);
    }, { passive: true });
  };
})();
