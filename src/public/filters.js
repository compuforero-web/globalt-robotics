// Filtros por categoría (por sección) + buscador global instantáneo.
import { $, $$, esc, normalize } from '../utils/dom.js';

const state = { query: '', raw: '', cats: {} };
let searchStatus;

export function setupChips(chipsEl, gridEl, cards, labelAll = 'Todos') {
  const cats = [...new Set(cards.map((c) => c.dataset.cat).filter(Boolean))];
  if (cats.length < 2) { chipsEl.hidden = true; return; }
  const key = gridEl.id;
  state.cats[key] = '';
  chipsEl.innerHTML = [['', labelAll], ...cats.map((c) => [c, c])]
    .map(([v, l]) => `<button class="chip ${v === '' ? 'is-active' : ''}" data-value="${esc(v)}" aria-pressed="${v === ''}">${esc(l)}</button>`)
    .join('');
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.cats[key] = chip.dataset.value;
    $$('.chip', chipsEl).forEach((c) => {
      c.classList.toggle('is-active', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    apply();
  });
}

function apply() {
  let total = 0;
  $$('[data-filter-grid]').forEach((grid) => {
    const cat = state.cats[grid.id] || '';
    const cards = $$('[data-search]', grid);
    let visible = 0;
    cards.forEach((card) => {
      const ok = (!cat || card.dataset.cat === cat) && (!state.query || card.dataset.search.includes(state.query));
      card.hidden = !ok;
      if (ok) visible += 1;
    });
    total += visible;
    const empty = $('.empty--filter', grid);
    if (!visible && cards.length) {
      if (!empty) grid.insertAdjacentHTML('beforeend', '<p class="empty empty--filter">No hay resultados con este filtro.</p>');
    } else if (empty) {
      empty.hidden = true;
      empty.outerHTML = '';
    }
  });
  if (searchStatus) {
    searchStatus.hidden = !state.query;
    searchStatus.textContent = state.query
      ? `${total} resultado${total === 1 ? '' : 's'} para "${state.raw}"` : '';
  }
}

export function setupSearch(input, statusEl) {
  searchStatus = statusEl;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.raw = input.value.trim();
      state.query = normalize(state.raw);
      apply();
      if (state.query && window.scrollY < 300) $('#juegos')?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); }
  });
}
