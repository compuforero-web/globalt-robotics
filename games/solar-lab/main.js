// SolarLab · main.js — controlador de UI, validación y progreso
import { LEVELS, hhmm, fmt } from './levels.js';
import { draw, drawChart, sfx, audio, ficha, arduino } from './sim.js';

const $ = s => document.querySelector(s), KEY = 'solarlab.progress.v1', DUR = 7000;
const cv = $('#scene'), cx = cv.getContext('2d'), ch = $('#chart'), chx = ch.getContext('2d');
let st = load(), L, P = {}, res, idx = 0, playing = false, t0 = 0, done = false;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.u) return s; } catch (e) { /* sin almacenamiento */ }
  return { u: 1, done: [], snd: true, last: 1 };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* iframe sin storage */ } }

function renderTop() {
  $('#level').innerHTML = LEVELS.map(l => `<option value="${l.id}" ${l.id > st.u ? 'disabled' : ''}>${l.id > st.u ? '🔒' : st.done.includes(l.id) ? '✅' : '☀️'} ${l.id}. ${l.name}</option>`).join('');
  $('#level').value = L ? L.id : 1;
  const n = st.done.length; $('#progBar').style.width = n * 20 + '%'; $('#progTxt').textContent = `${n}/5`;
  audio.on = st.snd; $('#snd').textContent = st.snd ? '🔊' : '🔇'; $('#snd').setAttribute('aria-pressed', st.snd);
}

function setLevel(id) {
  L = LEVELS.find(l => l.id === +id); st.last = L.id; save(); P = {};
  $('#ltitle').textContent = L.title; $('#brief').textContent = L.brief; $('#next').hidden = true;
  $('#controls').innerHTML = L.controls.map(c => c.type === 'range'
    ? `<label class="ctl"><span>${c.label}<b id="v_${c.id}">${c.v}${c.unit}</b></span><input type="range" id="c_${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.v}"></label>`
    : `<label class="ctl"><span>${c.label}</span><select id="c_${c.id}">${c.opts.map(([v, t]) => `<option value="${v}" ${v === c.v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('');
  L.controls.forEach(c => {
    P[c.id] = c.type === 'range' ? +c.v : c.v;
    $('#c_' + c.id).addEventListener('input', e => {
      P[c.id] = c.type === 'range' ? +e.target.value : e.target.value;
      if (c.type === 'range') $('#v_' + c.id).textContent = e.target.value + c.unit;
      recompute();
    });
  });
  $('#specT').textContent = L.kind === 'track' ? 'Código C++ · Arduino Nano' : 'Ficha técnica';
  renderTop(); recompute();
}

function recompute() {
  res = L.simulate(P); playing = false; done = false;
  idx = L.kind === 'array' ? Math.floor(res.fr.length * 0.6) : Math.floor(res.fr.length / 2);
  $('#scrub').max = res.fr.length - 1; $('#scrub').value = idx;
  setMsg('Ajusta los parámetros y pulsa ▶ Simular para validar el reto.', '');
  badge('Diseño', ''); $('#play').textContent = '▶ Simular';
  $('#spec').textContent = L.kind === 'track' ? arduino(P) : ficha(L, res).replace(/Veredicto:.*/, 'Veredicto: sin simular');
}

const setMsg = (t, cls) => { const m = $('#msg'); m.textContent = t; m.className = 'msg ' + cls; };
const badge = (t, cls) => { const b = $('#badge'); b.textContent = t; b.className = 'badge ' + cls; };

function play() {
  sfx('click');
  if (playing) { playing = false; $('#play').textContent = '▶ Simular'; return; }
  if (done || idx >= res.fr.length - 1) idx = 0;
  playing = true; done = false; t0 = performance.now() - idx / res.fr.length * DUR;
  $('#play').textContent = '⏸ Pausa'; badge('Simulando…', 'run'); setMsg('Simulación en curso…', '');
}

function finish() {
  playing = false; done = true; $('#play').textContent = '↻ Repetir';
  setMsg(res.msg, res.ok ? 'ok' : 'bad'); badge(res.ok ? 'Aprobado' : 'Revisar', res.ok ? 'ok' : 'bad');
  if (L.kind !== 'track') $('#spec').textContent = ficha(L, res);
  else $('#spec').textContent = arduino(P) + `\n\n/* ${ficha(L, res)} */`;
  sfx(res.ok ? 'full' : 'alert');
  if (res.ok) {
    if (!st.done.includes(L.id)) st.done.push(L.id);
    st.u = Math.max(st.u, Math.min(5, L.id + 1)); save(); renderTop();
    $('#next').hidden = L.id >= 5;
    if (L.id === 5) setMsg(res.msg + ' 🏆 ¡Certificado SolarLab completado!', 'ok');
  }
}

let lastLive = '';
function frame(now) {
  if (playing) {
    idx = Math.min(res.fr.length - 1, Math.floor((now - t0) / DUR * res.fr.length));
    $('#scrub').value = idx; if (idx >= res.fr.length - 1) finish();
  }
  const f = res.fr[idx];
  draw(cx, L, f, now / 1000, done || playing);
  drawChart(chx, res.fr, idx, L.chart);
  $('#clock').textContent = f.h !== undefined ? hhmm(f.h) : `${fmt(f.V, 1)} V`;
  const live = L.live(f).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (live !== lastLive) { $('#live').innerHTML = live; lastLive = live; }
  requestAnimationFrame(frame);
}

$('#level').addEventListener('change', e => setLevel(e.target.value));
$('#play').addEventListener('click', play);
$('#scrub').addEventListener('input', e => { playing = false; done = false; idx = +e.target.value; $('#play').textContent = '▶ Simular'; });
$('#next').addEventListener('click', () => setLevel(Math.min(5, L.id + 1)));
$('#snd').addEventListener('click', () => { st.snd = !st.snd; save(); renderTop(); sfx('click'); });
$('#reset').addEventListener('click', () => {
  if (!confirm('¿Reiniciar todo el progreso de SolarLab?')) return;
  st = { u: 1, done: [], snd: st.snd, last: 1 }; save(); setLevel(1);
});
$('#copy').addEventListener('click', () => {
  const txt = $('#spec').textContent;
  (navigator.clipboard?.writeText(txt) ?? Promise.reject()).then(() => { $('#copy').textContent = '✔ Copiado'; }, () => {
    const r = document.createRange(); r.selectNodeContents($('#spec')); getSelection().removeAllRanges(); getSelection().addRange(r); $('#copy').textContent = 'Seleccionado';
  }).finally(() => setTimeout(() => { $('#copy').textContent = 'Copiar'; }, 1500));
});

setLevel(Math.min(st.last || 1, st.u));
requestAnimationFrame(frame);
