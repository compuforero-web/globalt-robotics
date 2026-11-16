// RoboLab Arduino — motor del juego: tablero, programa de bloques y simulación.
import { LEVELS, OPS } from './levels.js';
import { generateSketch, highlight } from './codegen.js';

const $ = (id) => document.getElementById(id);
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const COLORS = { F: 'var(--cyan)', L: 'var(--orange)', R: 'var(--green)' };
const SAVE_KEY = 'robolab_unlocked';
const ROBOT_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="8" width="28" height="24" rx="7" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
  <circle cx="13" cy="17" r="3" fill="#38bdf8"/><circle cx="13" cy="25" r="3" fill="#38bdf8"/>
  <path d="M32 14l6 6-6 6z" fill="#f97316"/><rect x="8" y="3" width="16" height="5" rx="2" fill="#334155"/><rect x="8" y="32" width="16" height="5" rx="2" fill="#334155"/></svg>`;

const state = { level: 0, program: [], robot: null, running: false, cells: [] };

let unlocked = 1;
try { unlocked = Math.max(1, Number(localStorage.getItem(SAVE_KEY)) || 1); } catch { /* sin almacenamiento */ }

function parseLevel(level) {
  const rows = level.map.length;
  const cols = level.map[0].length;
  let start = { x: 0, y: 0 };
  const batteries = new Set();
  level.map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === 'S') start = { x, y };
    if (ch === 'B') batteries.add(`${x},${y}`);
  }));
  return { rows, cols, start, batteries };
}

function buildBoard() {
  const level = LEVELS[state.level];
  const info = parseLevel(level);
  const board = $('board');
  board.style.gridTemplateColumns = `repeat(${info.cols}, 1fr)`;
  board.style.aspectRatio = `${info.cols} / ${info.rows}`;
  board.innerHTML = '';
  state.cells = [];
  level.map.forEach((row, y) => [...row].forEach((ch, x) => {
    const cell = document.createElement('div');
    cell.className = 'cell' + ({ '#': ' cell--wall', G: ' cell--goal', B: ' cell--battery' }[ch] || '');
    board.append(cell);
    state.cells[y * info.cols + x] = cell;
  }));
  const robot = document.createElement('div');
  robot.className = 'robot';
  robot.innerHTML = ROBOT_SVG;
  robot.style.width = `${100 / info.cols}%`;
  robot.style.height = `${100 / info.rows}%`;
  board.append(robot);
  state.info = info;
  state.robotEl = robot;
  resetRobot();

  $('level-name').textContent = `Nivel ${state.level + 1}: ${level.name}`;
  $('hint').textContent = level.hint;
  $('tier').textContent = level.tier;
  $('tier').dataset.tier = level.tier;
}

function resetRobot() {
  const { start, batteries, cols } = state.info;
  state.robot = { x: start.x, y: start.y, dir: 0, batteries: new Set(batteries), turns: 0 };
  state.cells.forEach((cell, i) => {
    cell.classList.remove('cell--trail');
    const key = `${i % cols},${Math.floor(i / cols)}`;
    cell.classList.toggle('cell--battery', batteries.has(key));
  });
  state.robotEl.classList.remove('is-crash');
  drawRobot();
  setStatus('Arma tu programa y presiona ▶ Ejecutar.');
}

function drawRobot() {
  const { x, y, turns } = state.robot;
  const { cols, rows } = state.info;
  state.robotEl.style.left = `${(x * 100) / cols}%`;
  state.robotEl.style.top = `${(y * 100) / rows}%`;
  state.robotEl.style.transform = `rotate(${turns * 90}deg)`;
}

function setStatus(text, type = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status${type ? ` status--${type}` : ''}`;
}

function renderProgram() {
  const list = $('program');
  list.innerHTML = state.program.map((b, i) => `<li style="--c:${COLORS[b.op]}" data-i="${i}">
    <span>${OPS[b.op].icon} ${OPS[b.op].label}</span>
    <button data-act="rep" title="Repetir (ciclo for)" aria-label="Cambiar repeticiones">×${b.n}</button>
    <button data-act="del" aria-label="Quitar bloque">✕</button></li>`).join('');
  const total = state.program.length;
  $('count').textContent = `${total} bloque${total === 1 ? '' : 's'}`;
  const code = generateSketch(state.program, LEVELS[state.level].name);
  $('code').innerHTML = highlight(code);
  $('code').dataset.raw = code;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isWall = (x, y) => {
  const row = LEVELS[state.level].map[y];
  return !row || x < 0 || x >= row.length || row[x] === '#';
};

async function run() {
  if (state.running || !state.program.length) {
    if (!state.program.length) setStatus('Tu programa está vacío: agrega al menos un bloque.', 'fail');
    return;
  }
  resetRobot();
  state.running = true;
  toggleControls(true);
  const delay = 700 - Number($('speed').value) * 110;
  const r = state.robot;
  const map = LEVELS[state.level].map;
  const items = $('program').children;
  let result = 'end';

  outer: for (let i = 0; i < state.program.length; i++) {
    const { op, n } = state.program[i];
    [...items].forEach((li, j) => li.classList.toggle('is-active', j === i));
    for (let k = 0; k < n; k++) {
      if (op === 'L') { r.dir = (r.dir + 3) % 4; r.turns -= 1; }
      if (op === 'R') { r.dir = (r.dir + 1) % 4; r.turns += 1; }
      if (op === 'F') {
        const nx = r.x + DX[r.dir];
        const ny = r.y + DY[r.dir];
        if (isWall(nx, ny)) { result = 'crash'; break outer; }
        state.cells[r.y * state.info.cols + r.x].classList.add('cell--trail');
        r.x = nx; r.y = ny;
        const key = `${nx},${ny}`;
        if (r.batteries.delete(key)) state.cells[ny * state.info.cols + nx].classList.remove('cell--battery');
      }
      drawRobot();
      await wait(delay);
      if (map[r.y][r.x] === 'G' && !r.batteries.size) { result = 'win'; break outer; }
    }
  }
  [...items].forEach((li) => li.classList.remove('is-active'));
  finish(result);
}

function finish(result) {
  state.running = false;
  toggleControls(false);
  if (result === 'win') {
    const count = state.program.length;
    const blocks = `${count} bloque${count === 1 ? '' : 's'}`;
    const next = state.level + 1;
    if (next < LEVELS.length && unlocked < next + 1) {
      unlocked = next + 1;
      try { localStorage.setItem(SAVE_KEY, String(unlocked)); } catch { /* ignorar */ }
      fillLevels();
    }
    setStatus(next < LEVELS.length
      ? `¡Misión cumplida con ${blocks}! 🎉 Nivel ${next + 1} desbloqueado.`
      : `¡Completaste RoboLab con ${blocks}! 🏆 Ya puedes cargar este código a un robot real.`, 'win');
    return;
  }
  if (result === 'crash') {
    state.robotEl.classList.add('is-crash');
    setStatus('💥 ¡Choque! El sensor ultrasónico detectó un obstáculo. Ajusta tu programa.', 'fail');
    return;
  }
  const missing = state.robot.batteries.size;
  setStatus(missing
    ? `Faltan ${missing} batería${missing === 1 ? '' : 's'} por recoger antes de la meta.`
    : 'El robot no llegó a la meta. Revisa la ruta y vuelve a intentar.', 'fail');
}

function toggleControls(disabled) {
  ['run', 'clear', 'reset', 'level-select'].forEach((id) => { $(id).disabled = disabled; });
  document.querySelectorAll('.palette .block, #program button').forEach((b) => { b.disabled = disabled; });
}

function fillLevels() {
  $('level-select').innerHTML = LEVELS.map((l, i) =>
    `<option value="${i}" ${i >= unlocked ? 'disabled' : ''} ${i === state.level ? 'selected' : ''}>
      ${i + 1}. ${l.name}${i >= unlocked ? ' 🔒' : ''}</option>`).join('');
}

function loadLevel(index) {
  state.level = index;
  state.program = [];
  buildBoard();
  renderProgram();
  fillLevels();
}

// Eventos
document.querySelector('.palette').addEventListener('click', (e) => {
  const op = e.target.closest('[data-op]')?.dataset.op;
  if (!op || state.running) return;
  if (state.program.length >= 40) { setStatus('Máximo 40 bloques. Usa repeticiones (×n).', 'fail'); return; }
  state.program.push({ op, n: 1 });
  renderProgram();
});
$('program').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || state.running) return;
  const i = Number(btn.closest('li').dataset.i);
  if (btn.dataset.act === 'del') state.program.splice(i, 1);
  else state.program[i].n = (state.program[i].n % 9) + 1;
  renderProgram();
});
$('run').addEventListener('click', run);
$('reset').addEventListener('click', () => !state.running && resetRobot());
$('clear').addEventListener('click', () => { state.program = []; renderProgram(); resetRobot(); });
$('level-select').addEventListener('change', (e) => loadLevel(Number(e.target.value)));
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code').dataset.raw);
    $('copy').textContent = '¡Copiado!';
  } catch { $('copy').textContent = 'Selecciona y copia manualmente'; }
  setTimeout(() => { $('copy').textContent = 'Copiar código'; }, 1800);
});

loadLevel(Math.min(unlocked - 1, LEVELS.length - 1));
