import { esc, safeUrl, normalize } from '../utils/dom.js';
import { icon } from '../ui/icons.js';

const LEVEL_CLASS = { 'Básico': 'lvl-basic', 'Intermedio': 'lvl-mid', 'Proyecto Final': 'lvl-final' };

// Vista previa SVG generada cuando el juego aún no tiene imagen propia.
function placeholderPreview(game) {
  const hue = { 'Básico': '#38bdf8', 'Intermedio': '#f97316', 'Proyecto Final': '#22c55e' }[game.level] || '#38bdf8';
  return `<svg viewBox="0 0 320 180" class="card__art" role="img" aria-label="Vista previa de ${esc(game.title)}">
    <defs><pattern id="g-${esc(game.id)}" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M20 0H0v20" fill="none" stroke="${hue}" stroke-opacity=".12"/></pattern></defs>
    <rect width="320" height="180" fill="#0b1220"/><rect width="320" height="180" fill="url(#g-${esc(game.id)})"/>
    <circle cx="160" cy="90" r="46" fill="none" stroke="${hue}" stroke-opacity=".35" stroke-dasharray="6 8"/>
    <rect x="132" y="70" width="56" height="44" rx="10" fill="#131c31" stroke="${hue}" stroke-width="2"/>
    <circle cx="150" cy="92" r="5" fill="${hue}"/><circle cx="170" cy="92" r="5" fill="${hue}"/>
    <path d="M160 70v-12" stroke="${hue}" stroke-width="2"/><circle cx="160" cy="55" r="4" fill="${hue}"/>
  </svg>`;
}

export function gameCard(game) {
  const url = safeUrl(game.url);
  const preview = safeUrl(game.preview);
  const art = preview
    ? `<img class="card__art" src="${esc(preview)}" alt="Vista previa de ${esc(game.title)}" loading="lazy" width="320" height="180">`
    : placeholderPreview(game);
  const action = url
    ? `<button class="btn btn--primary btn--block" data-play="${esc(url)}" data-title="${esc(game.title)}">${icon('play')} Jugar Ahora</button>`
    : `<button class="btn btn--ghost btn--block" disabled>Próximamente</button>`;
  const search = normalize(`${game.title} ${game.description} ${game.category} ${game.level}`);
  return `<article class="card game-card ${game.featured ? 'is-featured' : ''}" data-cat="${esc(game.level)}" data-search="${esc(search)}">
    <div class="card__media">${art}
      ${game.featured ? `<span class="badge badge--star">${icon('star')} Destacado</span>` : ''}
    </div>
    <div class="card__body">
      <div class="card__tags">
        <span class="tag ${LEVEL_CLASS[game.level] || ''}">${esc(game.level)}</span>
        ${game.category ? `<span class="tag tag--soft">${esc(game.category)}</span>` : ''}
      </div>
      <h3 class="card__title">${esc(game.title)}</h3>
      <p class="card__text">${esc(game.description)}</p>
      <div class="card__actions">${action}</div>
    </div>
  </article>`;
}

export function renderGames(container, games) {
  const sorted = [...games].sort((a, b) => Number(b.featured) - Number(a.featured));
  container.innerHTML = sorted.map(gameCard).join('');
}
