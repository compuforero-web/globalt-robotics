import { esc, normalize } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { waLink, waMsg } from '../utils/whatsapp.js';

const TYPE_CLASS = { Presencial: 'lvl-basic', Virtual: 'lvl-mid', 'Híbrido': 'lvl-final' };

function workshopCard(ws) {
  const search = normalize(`${ws.title} ${ws.description} ${ws.audience} ${ws.type}`);
  return `<article class="card workshop-card" data-cat="${esc(ws.type)}" data-search="${esc(search)}">
    <span class="tag ${TYPE_CLASS[ws.type] || ''}">${esc(ws.type)}</span>
    <h3 class="card__title">${esc(ws.title)}</h3>
    <p class="card__text">${esc(ws.description)}</p>
    <ul class="meta-list">
      ${ws.audience ? `<li>${icon('users')}<span>${esc(ws.audience)}</span></li>` : ''}
      ${ws.dates ? `<li>${icon('calendar')}<span>${esc(ws.dates)}</span></li>` : ''}
      ${ws.price ? `<li>${icon('tag')}<span>${esc(ws.price)}</span></li>` : ''}
    </ul>
    <div class="card__actions">
      <a class="btn btn--wa btn--block" href="${waLink(waMsg.workshop(ws.title))}" target="_blank" rel="noopener">Solicitar cotización / Inscribirme</a>
    </div>
  </article>`;
}

export function renderWorkshops(container, workshops) {
  const active = workshops.filter((w) => w.active !== false);
  container.innerHTML = active.map(workshopCard).join('') || '<p class="empty">Nuevos talleres muy pronto.</p>';
}

export function renderBanner(el, settings) {
  if (!settings.banner_active || !settings.banner_text) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="container announce__inner">
    <span>${esc(settings.banner_text)}</span>
    <a class="announce__cta" href="${waLink(waMsg.workshops)}" target="_blank" rel="noopener">${esc(settings.banner_cta || 'Más información')} →</a>
    <button class="announce__close" aria-label="Cerrar anuncio">${icon('close')}</button>
  </div>`;
  el.querySelector('.announce__close').addEventListener('click', () => { el.hidden = true; });
}
