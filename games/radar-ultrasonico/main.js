// Radar Ultrasónico · controlador de UI, eventos, validación y progreso
import { LEVELS } from './levels.js';
import { W, H, audio, genCode } from './sim.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const KEY = 'radarUltrasonico.v1';
let prog = load(), cur = 0, lvl, s, last = 0, shownMsg = null, codeTxt = '', codeT = 0;

function load() {
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && Array.isArray(p.done)) return p; } catch { /* sin storage */ }
  return { done: [], sound: true };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch { /* iframe sin storage */ } }
const unlocked = i => i === 0 || prog.done.includes(i - 1);

function renderNav() {
  $('levels').innerHTML = LEVELS.map((l, i) => `<button class="lv${i === cur ? ' on' : ''}${prog.done.includes(i) ? ' done' : ''}"
    data-i="${i}" ${unlocked(i) ? '' : 'disabled'} title="Nivel ${i + 1} · ${l.title}" aria-label="Nivel ${i + 1}${unlocked(i) ? '' : ' (bloqueado)'}">${unlocked(i) ? i + 1 : '🔒'}</button>`).join('');
  const n = prog.done.length;
  $('bar').style.width = `${n * 20}%`; $('prog').textContent = `${n}/5`;
}

function renderControls() {
  const box = $('controls');
  box.innerHTML = lvl.controls.map(c => {
    const v = s.p[c.id];
    if (c.type === 'range') return `<label class="ctl"><span>${c.label}<b id="v_${c.id}">${v} ${c.unit || ''}</b></span>
      <input type="range" id="c_${c.id}" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${v}"></label>`;
    if (c.type === 'check') return `<label class="ctl chk"><input type="checkbox" id="c_${c.id}" ${v ? 'checked' : ''}><span>${c.label}</span></label>`;
    return `<label class="ctl sel"><code>${c.label}</code><select id="c_${c.id}">${c.opts.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
  }).join('') || '<p class="hint">👆 Interactúa directamente con el lienzo: arrastra el obstáculo.</p>';
  for (const c of lvl.controls) $('c_' + c.id).addEventListener('input', e => {
    const t = e.target;
    s.p[c.id] = c.type === 'range' ? +t.value : c.type === 'check' ? t.checked : t.value;
    if (c.type === 'range') $('v_' + c.id).textContent = `${t.value} ${c.unit || ''}`;
    codeT = 0;
  });
}

function loadLevel(i) {
  cur = i; lvl = LEVELS[i];
  s = { t: 0, p: {}, msg: '', tone: '' };
  for (const c of lvl.controls) s.p[c.id] = c.val;
  lvl.init(s);
  $('ltitle').textContent = `Nivel ${i + 1} · ${lvl.title}`;
  $('goal').textContent = lvl.goal;
  $('act').textContent = lvl.act;
  $('next').hidden = true; shownMsg = null; codeTxt = ''; codeT = 0;
  renderNav(); renderControls();
  try { localStorage.setItem(KEY + '.cur', i); } catch { /* */ }
}

function onWin() {
  if (!prog.done.includes(cur)) { prog.done.push(cur); prog.done.sort(); save(); }
  [880, 1175, 1568].forEach((f, k) => setTimeout(() => audio.beep(f, .12, .05), k * 120));
  $('next').hidden = cur >= LEVELS.length - 1;
  if (cur === LEVELS.length - 1) s.msg += ' 🏆 ¡Completaste el simulador Radar Ultrasónico!';
  renderNav();
}

const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = t => esc(t).replace(/(\/\/.*$)|("[^"\n]*")|(#\w+|\b(?:const|int|long|float|bool|void|if|else|return|for|true|false|unsigned)\b)|(\b\d+(?:\.\d+)?\b)/gm,
  (m, cm, st, kw, nu) => `<span class="${cm ? 'c' : st ? 's' : kw ? 'k' : 'n'}">${m}</span>`);

function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; s.t += dt;
  lvl.update?.(s, dt);
  lvl.draw(ctx, s);
  if (s.won && !s.wonSeen) { s.wonSeen = true; onWin(); }
  if (s.msg !== shownMsg) { shownMsg = s.msg; const m = $('msg'); m.textContent = s.msg; m.className = `msg ${s.tone || ''}`; m.hidden = !s.msg; }
  if ((codeT -= dt) <= 0) {
    codeT = 0.25;
    const t = genCode(cur + 1, lvl.code(s));
    if (t !== codeTxt) { codeTxt = t; $('code').innerHTML = hl(t); }
  }
  requestAnimationFrame(frame);
}

// --- Lienzo HiDPI (coordenadas lógicas 640×400) ---
function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
cv.addEventListener('pointerdown', e => { cv.setPointerCapture?.(e.pointerId); lvl.down?.(s, ...pt(e)); });
cv.addEventListener('pointermove', e => lvl.move?.(s, ...pt(e)));
['pointerup', 'pointercancel'].forEach(n => cv.addEventListener(n, () => lvl.up?.(s)));

// --- Barra superior y acciones ---
$('levels').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) loadLevel(+b.dataset.i); });
$('act').addEventListener('click', () => { audio.beep(660, .04, .02); lvl.action?.(s); });
$('reset').addEventListener('click', () => loadLevel(cur));
$('next').addEventListener('click', () => loadLevel(cur + 1));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(codeTxt); $('copy').textContent = '¡Copiado!'; }
  catch { $('copy').textContent = 'No disponible'; }
  setTimeout(() => { $('copy').textContent = 'Copiar'; }, 1400);
});
const sndUI = () => { const b = $('snd'); b.textContent = audio.on ? '🔊' : '🔇'; b.setAttribute('aria-pressed', audio.on); b.title = audio.on ? 'Sonido activado' : 'Sonido desactivado'; };
$('snd').addEventListener('click', () => { audio.on = !audio.on; prog.sound = audio.on; save(); sndUI(); if (audio.on) audio.beep(1000); });
$('resetProg').addEventListener('click', () => { if (confirm('¿Borrar todo el progreso?')) { prog = { done: [], sound: audio.on }; save(); loadLevel(0); } });

audio.on = prog.sound !== false; sndUI();
fitCanvas(); window.addEventListener('resize', fitCanvas);
let start = 0;
try { start = +localStorage.getItem(KEY + '.cur') || 0; } catch { /* */ }
loadLevel(unlocked(start) && start < LEVELS.length ? start : 0);
requestAnimationFrame(frame);
