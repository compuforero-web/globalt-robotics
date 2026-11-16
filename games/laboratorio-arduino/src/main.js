// Laboratorio de programación Arduino de GLOBALT: lección, editor, compilación, simulación, reto y guía.
import { LESSON, EXAMPLE_CODE, lessonHtml } from './lesson.js';
import { createEditor } from './editor.js';
import { checkCompiler, compileSketch, CompilerUnavailable } from './compiler.js';
import { explainDiagnostic, GENERIC_HELP } from './compiler-help.js';
import { Simulation, recordTrace } from './simulation.js';
import { evaluateChallenge, EVAL_DURATION_MS } from './challenge.js';
import { createCircuit } from './circuit.js';
import { createGuide } from './guide.js';
import * as progress from './progress.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_MONITOR_CHARS = 20000;

$('#lesson').innerHTML = lessonHtml();
const guide = createGuide($('#guide'));
const circuit = createCircuit($('#circuit'));

const stored = progress.getLesson(LESSON.id);
let savedCode = typeof stored.code === 'string' ? stored.code : EXAMPLE_CODE;
let compiled = null;   // { code, result }
let busy = false;
let servicePending = false; // sin servicio de compilación en este sitio: se desactivan solo sus acciones

const editor = createEditor($('#editor'), { value: savedCode, onChange: updateDirty, onSave: save });

// ---------- Guardado local ----------
const isDirty = () => editor.value !== savedCode;
function updateDirty() {
  const dirty = isDirty();
  $('#save-state').textContent = dirty ? 'Cambios sin guardar' : (typeof progress.getLesson(LESSON.id).code === 'string' ? 'Guardado en este navegador' : 'Ejemplo original');
  $('#save-state').classList.toggle('is-dirty', dirty);
}
function save() {
  if (!progress.saveCode(LESSON.id, editor.value)) { setStatus('Este navegador no permite guardar (modo privado o almacenamiento bloqueado).', 'warn'); return false; }
  savedCode = editor.value;
  updateDirty();
  return true;
}
function restoreExample() {
  const message = isDirty()
    ? 'Tienes cambios sin guardar. ¿Descartarlos y restaurar el ejemplo original? Tu código guardado también se reemplazará.'
    : '¿Restaurar el ejemplo original? Se reemplazará el código guardado en este navegador.';
  if (!confirm(message)) return;
  progress.clearCode(LESSON.id);
  savedCode = EXAMPLE_CODE;
  editor.setValue(EXAMPLE_CODE);
  updateDirty();
  showDiagnostics(null);
}
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

function renderProgress() {
  const lesson = progress.getLesson(LESSON.id);
  const box = $('#progress-state');
  if (lesson.completedAt) {
    const date = new Date(lesson.completedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    box.innerHTML = `<strong class="ok">Reto superado</strong> el ${esc(date)}${lesson.attempts ? ` · ${lesson.attempts} intento(s) de evaluación` : ''}.`;
  } else {
    box.innerHTML = lesson.attempts ? `Reto pendiente · ${lesson.attempts} intento(s) de evaluación.` : 'Reto pendiente.';
  }
}

// ---------- Estado y botones ----------
function setStatus(text, kind = '') {
  const el = $('#status');
  el.textContent = text;
  el.dataset.kind = kind;
}
function updateButtons() {
  $('#btn-compile').disabled = busy || servicePending;
  $('#btn-run').disabled = busy || servicePending;
  $('#btn-check').disabled = busy || servicePending;
  $('#btn-stop').disabled = !simulation.running;
  $('#btn-reset').disabled = busy || !simulation.hex;
}
function setService(ready, info = '', pending = false) {
  const el = $('#service');
  el.textContent = ready ? `Compilador listo · ${info}` : (pending ? 'Compilación próximamente' : 'Compilador sin respuesta');
  el.dataset.kind = ready ? 'ok' : 'warn';
  servicePending = !ready && pending;
  updateButtons();
}
function serviceUnavailable(error) {
  setService(false, '', Boolean(error?.pending));
  setStatus(error?.message || 'No se pudo contactar con el compilador.', 'warn');
  guide.notify('service-pending');
}

// ---------- Compilación ----------
function showDiagnostics(result) {
  const list = $('#diagnostics');
  const raw = $('#raw-output');
  if (!result) { list.innerHTML = ''; raw.hidden = true; editor.setMarks([]); return; }
  const items = result.diagnosticos || [];
  editor.setMarks(items.filter((d) => d.linea && d.tipo !== 'note').map((d) => ({ line: d.linea, kind: d.tipo === 'error' ? 'error' : 'warning' })));
  list.innerHTML = items.map((d) => {
    const where = d.linea ? `Línea ${d.linea}${d.columna ? `, columna ${d.columna}` : ''}` : 'Enlazado';
    const help = explainDiagnostic(d.mensaje) || (d.tipo === 'error' ? GENERIC_HELP : '');
    return `<li class="diag diag--${esc(d.tipo)}">
      <button type="button" class="diag__where" ${d.linea ? `data-line="${d.linea}"` : 'disabled'}>${esc(where)} · ${esc({ error: 'error', warning: 'advertencia', note: 'nota' }[d.tipo] || d.tipo)}</button>
      <code class="diag__msg">${esc(d.mensaje)}</code>
      ${help ? `<p class="diag__help">${esc(help)}</p>` : ''}</li>`;
  }).join('');
  raw.hidden = !result.salida;
  raw.querySelector('pre').textContent = result.salida || '';
}
$('#diagnostics').addEventListener('click', (e) => {
  const line = Number(e.target.closest('[data-line]')?.dataset.line);
  if (line) editor.goTo(line);
});

/** Compila si el código cambió. Devuelve el HEX o null. */
async function ensureCompiled() {
  const code = editor.value;
  if (compiled && compiled.code === code && compiled.result.ok) return compiled.result.hex;
  setStatus('Compilando con avr-gcc…', 'busy');
  try {
    const result = await compileSketch(code);
    setService(true, result.version?.compilador || 'avr-gcc');
    compiled = { code, result };
    showDiagnostics(result);
    if (!result.ok) {
      setStatus('El compilador encontró errores.', 'error');
      guide.notify('compile-error', { diagnostics: result.diagnosticos || [] });
      return null;
    }
    const mem = result.memoria;
    setStatus(`Compilado: ${mem.flash} de ${mem.flashMax} bytes de flash, ${mem.ram} de ${mem.ramMax} bytes de RAM.`, 'ok');
    guide.notify('compile-ok', { flash: mem.flash });
    return result.hex;
  } catch (error) {
    compiled = null;
    if (error instanceof CompilerUnavailable) serviceUnavailable(error);
    else setStatus(error.message, 'error');
    return null;
  }
}

async function withBusy(task) {
  if (busy) return;
  busy = true;
  updateButtons();
  try { await task(); } finally { busy = false; updateButtons(); }
}

// ---------- Simulación ----------
let pinsSeen = new Set();
let monitorText = '';
let baudWarned = false;
const simulation = new Simulation({
  onPins(events) {
    for (const e of events) { circuit.setPin(e.pin, e.high); if (e.high) pinsSeen.add(e.pin); }
  },
  onSerial(bytes, baud) {
    if (!baudWarned && Math.abs(baud - LESSON.baud) > LESSON.baud * 0.03) {
      baudWarned = true;
      $('#baud-warning').hidden = false;
      $('#baud-warning').textContent = `El programa transmite a ${Math.round(baud)} baudios y el monitor está a ${LESSON.baud}. En una placa real verías caracteres extraños.`;
    }
    monitorText += new TextDecoder('latin1').decode(new Uint8Array(bytes)).replace(/\r/g, '');
    if (monitorText.length > MAX_MONITOR_CHARS) monitorText = monitorText.slice(-MAX_MONITOR_CHARS);
    const out = $('#monitor');
    const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 30;
    out.textContent = monitorText;
    if (atBottom) out.scrollTop = out.scrollHeight;
  },
  onStatus(simMs) { $('#sim-time').textContent = `t = ${(simMs / 1000).toFixed(1)} s`; },
  onStop(reason) {
    $('#sim-state').textContent = 'Detenida';
    $('#sim-panel').classList.remove('is-running');
    if (reason) setStatus(reason, 'warn');
    updateButtons();
  },
});

function clearMonitor() { monitorText = ''; $('#monitor').textContent = ''; $('#baud-warning').hidden = true; baudWarned = false; }

function startSimulation(hex) {
  clearMonitor();
  circuit.resetPins();
  pinsSeen = new Set();
  simulation.start(hex);
  $('#sim-state').textContent = 'En ejecución';
  $('#sim-panel').classList.add('is-running');
  updateButtons();
  setTimeout(() => {
    if (!simulation.running || pinsSeen.has(LESSON.ledPin)) return;
    const others = [...pinsSeen].filter((p) => p > 1).map((p) => 'D' + p).join(', ');
    if (others) guide.notify('run-started', { otherPins: others });
  }, 2500);
}

$('#btn-compile').addEventListener('click', () => withBusy(async () => { compiled = null; await ensureCompiled(); }));
$('#btn-run').addEventListener('click', () => withBusy(async () => {
  const hex = await ensureCompiled();
  if (hex) { startSimulation(hex); setStatus('Simulación en ejecución.', 'ok'); }
}));
$('#btn-stop').addEventListener('click', () => { simulation.stop(); setStatus('Simulación detenida.'); });
$('#btn-reset').addEventListener('click', () => { if (simulation.hex) { startSimulation(simulation.hex); setStatus('Microcontrolador reiniciado (como pulsar RESET).'); } });
$('#btn-clear').addEventListener('click', clearMonitor);
$('#btn-save').addEventListener('click', () => { if (save()) setStatus('Código guardado en este navegador.', 'ok'); });
$('#btn-restore').addEventListener('click', restoreExample);

// ---------- Evaluación del reto ----------
function renderChecks(result) {
  $('#eval-result').innerHTML = `<p class="eval__title ${result.passed ? 'ok' : ''}">${result.passed ? 'Reto superado' : 'Todavía no: revisa los puntos marcados'}</p>
    <ul class="eval__list">${result.checks.map((c) => `<li class="${c.ok ? 'ok' : 'fail'}"><span aria-hidden="true">${c.ok ? '✓' : '✗'}</span>
      <span><strong>${esc(c.label)}</strong><span class="sr-only">${c.ok ? ' (cumplido)' : ' (no cumplido)'}</span><br><small>${esc(c.detail)}</small></span></li>`).join('')}</ul>`;
}
$('#btn-check').addEventListener('click', () => withBusy(async () => {
  const code = editor.value;
  $('#eval-result').innerHTML = '<p class="muted">Compilando y evaluando…</p>';
  const hex = await ensureCompiled();
  if (!hex) { $('#eval-result').innerHTML = '<p class="muted">La evaluación necesita un programa compilado sin errores.</p>'; return; }
  setStatus(`Evaluando: ${EVAL_DURATION_MS / 1000} s simulados…`, 'busy');
  try {
    const result = evaluateChallenge(await recordTrace(hex, EVAL_DURATION_MS));
    progress.recordAttempt(LESSON.id);
    renderChecks(result);
    if (result.passed) {
      progress.markCompleted(LESSON.id, code);
      if (editor.value === code) save();
      setStatus('Reto superado y guardado en este navegador.', 'ok');
      guide.notify('eval-pass');
    } else {
      setStatus('El reto aún no se cumple.', 'warn');
      guide.notify('eval-fail', { checks: result.checks });
    }
    renderProgress();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}));

// ---------- Inicio ----------
updateDirty();
renderProgress();
updateButtons();
guide.notify('welcome', { completed: Boolean(stored.completedAt) });
checkCompiler()
  .then((info) => setService(Boolean(info.ok), info.version?.compilador || 'avr-gcc'))
  .catch((error) => {
    if (error instanceof CompilerUnavailable && error.pending) serviceUnavailable(error);
    else setService(false);
  });
