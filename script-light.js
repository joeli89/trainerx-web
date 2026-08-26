/* TrainerX — light site interactions */

// ── Scroll reveals ───────────────────────────────────────────────
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ── Header scroll state ──────────────────────────────────────────
// Two things ride the scroll: the "scrolled" thickening, and whether the
// glass is currently sitting over a dark section (it inverts if so, or
// the nav links would be near-invisible against near-black).
const header = document.getElementById('site-header');
const pill   = header.querySelector('.nav-pill');
const darkSections = [...document.querySelectorAll('.section--dark')];

const onScroll = () => {
  header.classList.toggle('scrolled', scrollY > 16);

  const r = pill.getBoundingClientRect();
  const midY = r.top + r.height / 2;
  const overDark = darkSections.some(sec => {
    const s = sec.getBoundingClientRect();
    return midY >= s.top && midY <= s.bottom;
  });
  header.classList.toggle('over-dark', overDark);
};

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

// ── Mobile nav ───────────────────────────────────────────────────
const toggle = document.getElementById('menu-toggle');
const links   = document.getElementById('nav-links');

if (toggle && links) {
  const close = () => {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.querySelectorAll('span').forEach(s => s.removeAttribute('style'));
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    const s = toggle.querySelectorAll('span');
    if (open) {
      s[0].style.transform = 'translateY(5.5px) rotate(45deg)';
      s[1].style.opacity   = '0';
      s[2].style.transform = 'translateY(-5.5px) rotate(-45deg)';
    } else {
      s.forEach(x => x.removeAttribute('style'));
    }
  });

  links.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  document.addEventListener('click', (e) => {
    if (links.classList.contains('open') && !header.contains(e.target)) close();
  });
  window.addEventListener('resize', () => { if (innerWidth > 860) close(); });
}

// ── FAQ accordion ────────────────────────────────────────────────
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const wasOpen = btn.getAttribute('aria-expanded') === 'true';

    document.querySelectorAll('.faq-q').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
      b.nextElementSibling.style.maxHeight = '0px';
    });

    if (!wasOpen) {
      const a = btn.nextElementSibling;
      btn.setAttribute('aria-expanded', 'true');
      a.style.maxHeight = a.scrollHeight + 'px';
    }
  });
});

// Keep an open FAQ answer correctly sized on resize
window.addEventListener('resize', () => {
  const open = document.querySelector('.faq-q[aria-expanded="true"]');
  if (open) open.nextElementSibling.style.maxHeight = open.nextElementSibling.scrollHeight + 'px';
});

// ── Anchor offset for the floating nav ───────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + scrollY - 86;
    scrollTo({ top, behavior: 'smooth' });
  });
});

// ── Rail: centre the second card on load, drag to scroll ─────────
const rail = document.getElementById('rail');
if (rail) {
  const second = rail.children[1];
  if (second) {
    rail.scrollLeft = second.offsetLeft - (rail.clientWidth - second.clientWidth) / 2;
  }

  let down = false, startX = 0, startLeft = 0, moved = false;
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;   // let native touch scrolling handle it
    down = true; moved = false;
    startX = e.clientX;
    startLeft = rail.scrollLeft;
    rail.setPointerCapture(e.pointerId);
    rail.style.cursor = 'grabbing';
  });
  rail.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    rail.scrollLeft = startLeft - dx;
  });
  const up = (e) => {
    if (!down) return;
    down = false;
    rail.style.cursor = '';
    if (moved) rail.addEventListener('click', ev => ev.preventDefault(), { capture: true, once: true });
  };
  rail.addEventListener('pointerup', up);
  rail.addEventListener('pointercancel', up);
}
