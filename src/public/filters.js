// Filtros por sección y búsqueda por palabras, sin cambiar el catálogo.
import { $, $$, esc, normalize } from '../utils/dom.js';

const state = { query: '', raw: '', cats: {} };
let searchStatus;
let searchInput;

export function matchesQuery(text, query) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const haystack = normalize(text);
  return words.every((word) => haystack.includes(word));
}

function clearFilters() {
  state.query = '';
  state.raw = '';
  state.cats = {};
  if (searchInput) searchInput.value = '';
  $$('[data-chips-for] .chip').forEach((chip) => {
    const active = chip.dataset.value === '';
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
  apply();
  searchInput?.focus({ preventScroll: true });
}

export function setupChips(chipsEl, gridEl, cards, labelAll = 'Todos') {
  const cats = [...new Set(cards.map((c) => c.dataset.cat).filter(Boolean))];
  const key = gridEl.id;
  state.cats[key] = '';
  if (cats.length < 2) { chipsEl.hidden = true; apply(); return; }
  chipsEl.hidden = false;
  chipsEl.innerHTML = [['', labelAll], ...cats.map((c) => [c, c])]
    .map(([v, l]) => `<button type="button" class="chip ${v === '' ? 'is-active' : ''}" data-value="${esc(v)}" aria-pressed="${v === ''}">${esc(l)}</button>`)
    .join('');
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || !chipsEl.contains(chip)) return;
    state.cats[key] = chip.dataset.value;
    $$('.chip', chipsEl).forEach((c) => {
      c.classList.toggle('is-active', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    apply();
  });
  apply();
}

function apply() {
  let total = 0;
  $$('[data-filter-grid]').forEach((grid) => {
    // No contar contenido de secciones todavía ocultas, como Videos.
    if (grid.closest('[hidden]')) return;
    const cat = state.cats[grid.id] || '';
    const cards = $$('[data-search]', grid);
    let visible = 0;
    cards.forEach((card) => {
      const ok = (!cat || card.dataset.cat === cat) && matchesQuery(card.dataset.search, state.query);
      card.hidden = !ok;
      if (ok) visible += 1;
    });
    total += visible;
    let empty = $('.empty--filter', grid);
    if (!visible && cards.length) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty empty--filter';
        const message = document.createElement('p');
        message.textContent = 'No hay coincidencias en esta sección. Prueba otras palabras o restablece los filtros.';
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'btn btn--outline btn--sm';
        reset.textContent = 'Ver todo el catálogo';
        reset.addEventListener('click', clearFilters);
        empty.append(message, reset);
        grid.append(empty);
      }
    } else {
      empty?.remove();
    }
  });
  if (searchStatus) {
    const filtered = Boolean(state.query || Object.values(state.cats).some(Boolean));
    searchStatus.hidden = !filtered;
    const message = document.createElement('span');
    message.textContent = state.query
      ? `${total} resultado${total === 1 ? '' : 's'} para “${state.raw}”`
      : `${total} resultado${total === 1 ? '' : 's'} con los filtros seleccionados`;
    searchStatus.replaceChildren(message);
    if (filtered) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'search-status__reset';
      reset.textContent = 'Restablecer filtros';
      reset.addEventListener('click', clearFilters);
      searchStatus.append(reset);
    }
  }
}

export function setupSearch(input, statusEl) {
  if (!input) return;
  searchInput = input;
  searchStatus = statusEl;
  if (statusEl?.id) input.setAttribute('aria-describedby', statusEl.id);
  let timer;
  function update() {
    clearTimeout(timer);
    state.raw = input.value.trim();
    state.query = normalize(state.raw);
    apply();
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(update, 120);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearTimeout(timer);
      clearFilters();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      update();
      const grid = $$('[data-filter-grid]').find((item) =>
        !item.closest('[hidden]') && $$('[data-search]', item).some((card) => !card.hidden));
      const section = grid?.closest('section');
      if (section) {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    }
  });
}
