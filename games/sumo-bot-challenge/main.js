// Controlador de UI · Sumo Bot Challenge
import { LEVELS, PARAMS, levelParams } from './levels.js';
import { createWorld, step, draw, genCode, sfx } from './sim.js';

const $ = s => document.querySelector(s);
const KEY = 'sumoBotChallenge.v1', DT = 1 / 120;
const store = {
  load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  save() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch { /* iframe sin storage */ } },
};
let prog = { unlocked: 1, done: [], params: {}, sound: true, level: 1, ...store.load() };
let lv, params, world, running = false, last = 0, acc = 0, lastHit = 0;
const cv = $('#arena'), ctx = cv.getContext('2d');

/* ---------- Niveles y progreso ---------- */
function renderLevels() {
  $('#level').innerHTML = LEVELS.map(l => {
    const locked = l.id > prog.unlocked, done = prog.done.includes(l.id);
    return `<option value="${l.id}" ${locked ? 'disabled' : ''}>${locked ? '🔒' : done ? '✅' : '▶'} Nivel ${l.id} · ${l.title}</option>`;
  }).join('');
  $('#level').value = lv?.id ?? prog.level;
  $('#progTxt').textContent = `${prog.done.length}/${LEVELS.length}`;
  $('#progBar').style.width = `${prog.done.length / LEVELS.length * 100}%`;
}

function loadLevel(id) {
  lv = LEVELS[Math.min(id, prog.unlocked) - 1];
  prog.level = lv.id; store.save();
  params = levelParams(lv, prog.params[lv.id]);
  $('#lvTag').textContent = `Nivel ${lv.id} de ${LEVELS.length}`;
  $('#lvTitle').textContent = lv.title;
  $('#lvBrief').textContent = lv.brief;
  $('#lvGoal').textContent = lv.goal;
  $('#lvTip').textContent = '💡 ' + lv.tip;
  renderRules(); renderLevels(); updateCode(); resetFight();
}

/* ---------- Formulario de reglas ---------- */
const fmt = (k, v) => PARAMS[k].type === 'select' ? '' : `${v}${PARAMS[k].unit ? ' ' + PARAMS[k].unit : ''}`;
function renderRules() {
  $('#rules').innerHTML = lv.editable.map(k => {
    const d = PARAMS[k], v = params[k];
    const ctrl = d.type === 'select'
      ? `<select id="p-${k}" data-k="${k}">${d.options.map(([val, txt]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${txt}</option>`).join('')}</select>`
      : `<input type="range" id="p-${k}" data-k="${k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}">`;
    return `<div class="field"><label for="p-${k}">${d.label}<output id="o-${k}">${fmt(k, v)}</output></label>${ctrl}</div>`;
  }).join('');
}
$('#rules').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  params[k] = PARAMS[k].type === 'range' ? +e.target.value : e.target.value;
  $('#o-' + k).textContent = fmt(k, params[k]);
  prog.params[lv.id] = Object.fromEntries(lv.editable.map(x => [x, params[x]])); store.save();
  updateCode();
  if (!running) resetFight();
});

/* ---------- Código C++ ---------- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function updateCode() {
  $('#code').innerHTML = esc(genCode(lv, params)).replace(
    /(\/\/.*$)|(#define|\b(?:void|int|long|bool|const|if|else|return|for)\b)|(\b\d+\b)/gm,
    (m, c, k, n) => c ? `<span class="c">${c}</span>` : k ? `<span class="k">${k}</span>` : `<span class="n">${n}</span>`);
}
$('#copy').addEventListener('click', async () => {
  const txt = genCode(lv, params);
  try { await navigator.clipboard.writeText(txt); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: txt });
    document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch { /* sin portapapeles */ } ta.remove();
  }
  $('#copy').textContent = '¡Copiado!'; setTimeout(() => ($('#copy').textContent = 'Copiar'), 1400);
});

/* ---------- Combate ---------- */
function resetFight() {
  running = false; world = createWorld(lv, params);
  $('#run').textContent = '▶ Combatir'; $('#result').hidden = true;
  hud(); render();
}
function toggleRun() {
  if (world.over) resetFight();
  running = !running;
  $('#run').textContent = running ? '❚❚ Pausa' : '▶ Continuar';
  if (running) { if (world.t === 0) sfx.start(); last = performance.now(); acc = 0; requestAnimationFrame(loop); }
}
function loop(now) {
  if (!running) return;
  acc += Math.min(0.1, (now - last) / 1000) * ($('#fast').checked ? 2 : 1); last = now;
  while (acc >= DT && !world.over) { step(world, DT); acc -= DT; }
  for (const v of world.hits) if (now - lastHit > 90) { sfx.hit(v); lastHit = now; }
  world.hits.length = 0;
  hud(); render();
  if (world.over) return finish();
  requestAnimationFrame(loop);
}
function finish() {
  running = false; const { win, msg } = world.over;
  $('#run').textContent = '▶ Combatir';
  $('#result').className = 'result ' + (win ? 'win' : 'lose'); $('#result').hidden = false;
  $('#resTitle').textContent = win ? (lv.id === LEVELS.length ? '🏆 ¡Campeón del torneo!' : '¡Victoria!') : 'Derrota';
  $('#resMsg').textContent = msg + (win ? '' : ' Ajusta las reglas y vuelve a intentarlo.');
  $('#next').hidden = !win || lv.id === LEVELS.length;
  if (win) {
    if (!prog.done.includes(lv.id)) prog.done.push(lv.id);
    prog.unlocked = Math.max(prog.unlocked, Math.min(LEVELS.length, lv.id + 1)); store.save(); renderLevels();
    sfx.win();
  } else sfx.lose();
}
function hud() {
  const m = world.me, st = m.st;
  $('#hTime').textContent = `${world.t.toFixed(1)} / ${lv.time} s`;
  $('#hState').textContent = world.t ? st.label : 'LISTO';
  $('#hState').className = st.label === 'BUSCAR' || !world.t ? '' : 'warn';
  $('#hIR').textContent = m.ir.map(x => (x ? 'LOW' : 'HIGH')).join(' · ');
  $('#hIR').className = m.ir.some(Boolean) ? 'warn' : '';
  $('#hUS').textContent = !lv.radar ? 'no usado' : m.us < 999 ? `${m.us} cm` : 'sin eco';
  $('#hUS').className = m.us < params.range && lv.radar ? 'warn' : '';
}

/* ---------- Canvas responsivo ---------- */
function render() { draw(ctx, world, cv.width); }
function resize() {
  const s = Math.round(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1));
  if (s && s !== cv.width) { cv.width = cv.height = s; if (world) render(); }
}
new ResizeObserver(resize).observe($('#wrap'));

/* ---------- Eventos ---------- */
$('#run').addEventListener('click', toggleRun);
$('#reset').addEventListener('click', resetFight);
$('#retry').addEventListener('click', resetFight);
$('#next').addEventListener('click', () => loadLevel(lv.id + 1));
$('#level').addEventListener('change', e => loadLevel(+e.target.value));
$('#sound').addEventListener('click', () => {
  sfx.on = prog.sound = !prog.sound; store.save(); syncSound(); if (sfx.on) sfx.tone(660, 0.1);
});
$('#resetProgress').addEventListener('click', () => {
  prog = { unlocked: 1, done: [], params: {}, sound: prog.sound, level: 1 }; store.save(); loadLevel(1);
});
function syncSound() {
  $('#sound').textContent = prog.sound ? '🔊' : '🔇'; $('#sound').setAttribute('aria-pressed', prog.sound);
}

sfx.on = prog.sound; syncSound(); resize();
loadLevel(prog.level || 1);
