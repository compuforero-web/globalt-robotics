// Comprueba el módulo real con un DOM mínimo, sin dependencias de navegador.
import * as api from '../src/public/filters.js';

class Element {
  constructor(tag = 'div', props = {}) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.hidden = false;
    this.className = ''; this.attrs = {}; this.listeners = {}; this.value = ''; Object.assign(this, props);
    this.classList = { toggle: (name, on) => {
      const classes = new Set(this.className.split(/\s+/).filter(Boolean));
      if (on) classes.add(name); else classes.delete(name); this.className = [...classes].join(' ');
    } };
  }
  get textContent() { return this._text ?? this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...children) { for (const c of children) { c.parent = this; this.children.push(c); } }
  replaceChildren(...children) { this._text = undefined; this.children = []; this.append(...children); }
  addEventListener(name, cb) { (this.listeners[name] ??= []).push(cb); }
  emit(name, extra = {}) { const e = { target: this, preventDefault() {}, ...extra }; for (const cb of this.listeners[name] || []) cb(e); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  focus() { focused = this; }
  scrollIntoView(options) { scrolled = { id: this.id, ...options }; }
  contains(el) { return el === this || this.children.some(c => c.contains(el)); }
  closest(selector) {
    for (let el = this; el; el = el.parent) {
      if (selector === '[hidden]' && el.hidden) return el;
      if (selector === 'section' && el.tagName === 'section') return el;
      if (selector === '.chip' && el.className.split(' ').includes('chip')) return el;
    } return null;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  set innerHTML(value) {
    this.replaceChildren();
    for (const match of value.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-value="([^"]*)"[^>]*aria-pressed="([^"]*)"[^>]*>([^<]*)<\/button>/g)) {
      const button = new Element('button', { className: match[1], dataset: { value: match[2] } });
      button.textContent = match[4]; button.setAttribute('aria-pressed', match[3]); this.append(button);
    }
  }
}
let focused, scrolled, seq = 0;
const jobs = new Map();
const later = (cb) => { jobs.set(++seq, cb); return seq; };
const cancel = (id) => jobs.delete(id);
const flush = () => { const all = [...jobs.values()]; jobs.clear(); all.forEach(cb => cb()); };
const gamesSection = new Element('section', { id: 'juegos' });
const coursesSection = new Element('section', { id: 'programacion' });
const hiddenSection = new Element('section', { hidden: true });
const games = new Element('div', { id: 'games-grid' });
const courses = new Element('div', { id: 'prog-grid' });
const videos = new Element('div', { id: 'videos-grid' });
gamesSection.append(games); coursesSection.append(courses); hiddenSection.append(videos);
const card = (cat, search) => new Element('article', { dataset: { cat, search } });
const solar = card('Intermedio', 'SolarLab energía solar panel fotovoltaico');
const radar = card('Básico', 'Radar Arduino sensor ultrasónico');
const python = card('Web', 'Python desde cero variables y funciones');
games.append(solar, radar); courses.append(python);
videos.append(card('Web', 'Python oculto'));
const grids = [games, courses, videos];
const gameChips = new Element('div');
const courseChips = new Element('div');
const chips = [gameChips, courseChips];
const input = new Element('input');
const status = new Element('p', { id: 'search-status' });
const queryAll = (selector, root) => {
  if (selector === '[data-filter-grid]') return grids;
  if (selector === '[data-chips-for] .chip') return chips.flatMap(c => c.children);
  if (selector === '[data-search]') return root.children.filter(c => c.dataset.search);
  if (selector === '.chip') return root.children;
  return [];
};
const queryOne = (selector, root) => selector === '.empty--filter'
  ? root.children.find(c => c.className.includes('empty--filter')) ?? null : null;
const doc = { createElement: tag => new Element(tag) };
const win = { matchMedia: () => ({ matches: true }) };

for (const root of [doc, ...grids, ...chips]) {
  root.querySelectorAll = selector => queryAll(selector, root);
  root.querySelector = selector => queryOne(selector, root);
}

const previous = { document: globalThis.document, window: globalThis.window,
  setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
Object.assign(globalThis, { document: doc, window: win, setTimeout: later, clearTimeout: cancel });
try {

const assert = (value, message) => { if (!value) throw new Error(message); };
const { matchesQuery, setupChips, setupSearch } = api;
assert(matchesQuery('Arduino y sensor ultrasónico', 'ULTRASONICO arduino'), 'tildes y orden');
assert(matchesQuery('Energía solar', '  solar   energia '), 'espacios');
assert(matchesQuery('C++ Arduino', 'c++'), 'C++');
assert(!matchesQuery('Arduino', 'arduino python'), 'todas las palabras');
setupSearch(input, status);
setupChips(gameChips, games, [solar, radar]);
setupChips(courseChips, courses, [python]);
input.value = 'python'; input.emit('input'); flush();
assert(!python.hidden && solar.hidden && radar.hidden, 'filtra por sección');
assert(status.textContent.startsWith('1 resultado'), 'excluye videos ocultos');
assert(scrolled === undefined, 'no mueve al escribir');
input.emit('keydown', { key: 'Enter' });
assert(scrolled.id === 'programacion' && scrolled.behavior === 'auto', 'Enter lleva al resultado y respeta movimiento reducido');
input.value = 'solar'; input.emit('input'); flush();
const basic = gameChips.children.find(c => c.dataset.value === 'Básico');
gameChips.emit('click', { target: basic });
assert(solar.hidden && radar.hidden && games.children.some(c => c.className.includes('empty--filter')), 'búsqueda y filtro combinados');
const empty = queryOne('.empty--filter', games);
empty.children[1].emit('click');
assert(!solar.hidden && !radar.hidden && !python.hidden && input.value === '' && status.hidden, 'restablecer todo');
assert(focused === input && gameChips.children[0].attrs['aria-pressed'] === 'true', 'foco y chips restablecidos');
input.value = '<img src=x onerror=alert(1)>'; input.emit('input'); flush();
assert(status.children[0].textContent.includes('<img'), 'texto de consulta seguro');
input.emit('keydown', { key: 'Escape' });
assert(input.value === '' && !solar.hidden && !python.hidden, 'Escape restaura');
input.value = 'solar'; input.emit('input'); flush();
status.children[1].emit('click');
assert(input.value === '' && status.hidden, 'botón de barra limpia');
input.value = 'python'; input.emit('input'); flush();
setupChips(gameChips, games, [solar, radar]);
assert(solar.hidden && !python.hidden, 'respeta búsqueda al terminar de cargar catálogo');

console.log('OK: búsqueda por palabras, tildes, filtros, teclado y conservación de tarjetas.');
} finally {
  Object.assign(globalThis, previous);
}
