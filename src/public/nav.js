// Navegación: menú móvil, sección activa y botón flotante de WhatsApp contextual.
import { $, $$ } from '../utils/dom.js';
import { waLink, waMsg } from '../utils/whatsapp.js';

const SECTION_MSG = {
  inicio: () => waMsg.general, juegos: () => waMsg.games, programacion: () => waMsg.programming,
  ia: () => waMsg.ai, videos: () => waMsg.videos, talleres: () => waMsg.workshops,
};

export function setupNav() {
  const toggle = $('.nav__toggle');
  const menu = $('#nav-menu');
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) { menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
  });

  const header = $('.site-header');
  addEventListener('scroll', () => header.classList.toggle('is-scrolled', scrollY > 10), { passive: true });
}

/** Botón flotante: el mensaje prellenado cambia según la sección visible. */
export function setupWhatsAppFloat() {
  const float = $('#wa-float');
  const links = $$('#nav-menu a[href^="#"]');
  float.href = waLink(waMsg.general);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      float.href = waLink((SECTION_MSG[id] || SECTION_MSG.inicio)());
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section[id]').forEach((s) => observer.observe(s));
}

export function setupStaticWaLinks() {
  $$('[data-wa]').forEach((a) => {
    a.href = waLink(waMsg[a.dataset.wa] || waMsg.general);
    a.target = '_blank';
    a.rel = 'noopener';
  });
}
