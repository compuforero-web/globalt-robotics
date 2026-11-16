// Laboratorio de programación Arduino de GLOBALT: lección, editor, compilación, simulación, reto y guía.
import { LESSON, EXAMPLE_CODE, lessonHtml } from './lesson.js';
import { createEditor } from './editor.js';
import { checkCompiler, compileSketch, CompilerUnavailable, usarAula, enAula } from './compiler.js';
import { explainDiagnostic, GENERIC_HELP } from './compiler-help.js';
import { Simulation, recordTrace } from './simulation.js';
import { evaluateChallenge, EVAL_DURATION_MS } from './challenge.js';
import { createCircuit } from './circuit.js';
import { createGuide } from './guide.js';
import * as progress from './progress.js';
import * as cuenta from './cuenta.js';

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

const editor = createEditor($('#editor'), { value: savedCode, onChange: updateDirty, onSave: save });

// ---------- Guardado local ----------
const isDirty = () => editor.value !== savedCode;
function updateDirty() {
  const dirty = isDirty();
  $('#save-state').textContent = dirty ? 'Cambios sin guardar' : (typeof progress.getLesson(LESSON.id).code === 'string' ? 'Guardado en este navegador' : 'Ejemplo original');
  $('#save-state').classList.toggle('is-dirty', dirty);
}
function save() {
  if (!progress.saveCode(LESSON.id, editor.value)) {
    setStatus('Este navegador no permite guardar (modo privado o almacenamiento bloqueado).', 'warn');
    syncAccount(editor.value);
    return false;
  }
  savedCode = editor.value;
  updateDirty();
  syncAccount();
  return true;
}
function restoreExample() {
  const where = account.active ? 'en este navegador y en tu cuenta' : 'en este navegador';
  const message = isDirty()
    ? `Tienes cambios sin guardar. ¿Descartarlos y restaurar el ejemplo original? Tu código guardado ${where} también se reemplazará.`
    : `¿Restaurar el ejemplo original? Se reemplazará el código guardado ${where}.`;
  if (!confirm(message)) return;
  progress.clearCode(LESSON.id);
  savedCode = EXAMPLE_CODE;
  editor.setValue(EXAMPLE_CODE);
  updateDirty();
  showDiagnostics(null);
  syncAccount();
}
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Copia en la cuenta del aula (opcional; el guardado local sigue siendo el respaldo) ----------
const account = { active: false, version: null, choosing: null, failed: false, pendingCode: null, queue: Promise.resolve() };
function accountState(text, kind = '', { retry = false, html = false } = {}) {
  $('#cuenta').hidden = false;
  const el = $('#cuenta-estado');
  if (html) el.innerHTML = text; else el.textContent = text;
  el.dataset.kind = kind;
  $('#btn-cuenta-reintentar').hidden = !retry;
}
const AULA_LINK = '<a href="../../aula/index.html">aula</a>';

function useAccountVersion(remote) {
  const local = progress.getLesson(LESSON.id).code;
  if (typeof local === 'string' && local !== remote.codigo) progress.saveBackup(LESSON.id, local);
  editor.setValue(remote.codigo);
  progress.saveCode(LESSON.id, remote.codigo);
  savedCode = remote.codigo;
  account.version = remote.version;
  updateDirty();
  showDiagnostics(null);
}

function offerChoice(remote) {
  account.choosing = remote;
  const date = new Date(remote.actualizado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  $('#cuenta-eleccion-detalle').textContent = `La de tu cuenta es del ${date}. Elige cuál quieres seguir usando; la otra queda como copia de respaldo en este navegador.`;
  $('#cuenta-eleccion').hidden = false;
  accountState('Elige una versión para seguir guardando en tu cuenta.', 'warn');
}
function closeChoice() { account.choosing = null; $('#cuenta-eleccion').hidden = true; }

$('#btn-usar-cuenta').addEventListener('click', () => {
  const remote = account.choosing;
  if (!remote) return;
  if (isDirty() && !confirm('Tus cambios sin guardar se reemplazarán por la versión de tu cuenta. ¿Continuar?')) return;
  closeChoice();
  useAccountVersion(remote);
  accountState('Usando la versión de tu cuenta.', 'ok');
});
$('#btn-usar-local').addEventListener('click', () => {
  const remote = account.choosing;
  if (!remote) return;
  account.version = remote.version;   // se guardará encima, a sabiendas
  progress.saveBackup(LESSON.id, remote.codigo);
  closeChoice();
  save();                              // guarda aquí y sube a la cuenta
});

/** Sube el código guardado localmente. Encola las llamadas para no cruzar versiones. */
function syncAccount(code = savedCode) {
  if (!account.active) return;
  if (account.choosing) { accountState('Guardado en este navegador. Elige primero qué versión usar en tu cuenta.', 'warn'); return; }
  account.queue = account.queue.then(async () => {
    accountState('Guardando en tu cuenta…', 'busy');
    try {
      const saved = await cuenta.guardar(LESSON.id, code, account.version);
      account.version = saved.version;
      account.failed = false;
      account.pendingCode = null;
      accountState(saved.codigo === editor.value ? 'Guardado en tu cuenta.' : 'Guardado en tu cuenta (hay cambios más nuevos sin guardar).', 'ok');
    } catch (error) {
      if (error.status === 409 && error.borrador) offerChoice(error.borrador);
      else if (error.status === 401) {
        account.active = false;
        accountState(`Tu sesión terminó: el código quedó solo en este navegador. Entra de nuevo en el ${AULA_LINK} y recarga esta página.`, 'warn', { html: true });
      } else if (error.status === 413 || error.status === 422) accountState(error.message, 'warn');
      else if (error.status === 403) {   // la sesión cambió (p. ej., se entró de nuevo en otra pestaña): reconectar
        account.active = false;
        account.failed = true;
        accountState('No se pudo guardar en tu cuenta. Tu código sigue guardado en este navegador.', 'error', { retry: true });
      } else {
        account.pendingCode = code;
        account.failed = true;
        accountState('No se pudo guardar en tu cuenta. Tu código sigue guardado en este navegador.', 'error', { retry: true });
      }
    }
  });
}

async function connectAccount() {
  accountState('Conectando con tu cuenta…', 'busy');
  const result = await cuenta.conectar(LESSON.id);
  account.site = result.estado;
  if (result.estado === 'sin-aula') { $('#cuenta').hidden = true; return; }
  if (result.estado === 'sin-sesion') { accountState(`Entra en el ${AULA_LINK} para guardar tu código también en tu cuenta.`, '', { html: true }); return; }
  if (result.estado === 'sin-inscripcion') { accountState(`${esc(result.mensaje)} Ir al ${AULA_LINK}.`, '', { html: true }); return; }
  if (result.estado === 'error') { account.failed = true; accountState('No se pudo conectar con tu cuenta. Tu código sigue guardado en este navegador.', 'error', { retry: true }); return; }
  account.active = true;
  account.failed = false;
  const remote = result.borrador;
  const hasLocal = typeof progress.getLesson(LESSON.id).code === 'string' || isDirty();
  if (!remote) { accountState('Tu cuenta aún no tiene copia de este código: pulsa Guardar para crearla.'); return; }
  account.version = remote.version;
  if (remote.codigo === editor.value) accountState('Sincronizado con tu cuenta.', 'ok');
  else if (!hasLocal) { useAccountVersion(remote); accountState('Código recuperado de tu cuenta.', 'ok'); }
  else { account.version = null; offerChoice(remote); }
}
const retryAccount = () => (account.active ? syncAccount(account.pendingCode ?? savedCode) : connectAccount());
$('#btn-cuenta-reintentar').addEventListener('click', retryAccount);
addEventListener('online', () => { if (account.failed) retryAccount(); });

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
  $('#btn-compile').disabled = busy;
  $('#btn-run').disabled = busy;
  $('#btn-check').disabled = busy;
  $('#btn-stop').disabled = !simulation.running;
  $('#btn-reset').disabled = busy || !simulation.hex;
}
function setService(ready, info = '') {
  const el = $('#service');
  el.textContent = ready ? `Compilador listo · ${info}` : (enAula() ? 'Compilador no disponible' : 'Servicio de compilación pendiente');
  el.dataset.kind = ready ? 'ok' : 'warn';
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
    if (error instanceof CompilerUnavailable) {
      setService(false);
      setStatus(error.message, 'warn');
      if (!enAula()) guide.notify('service-pending');   // en el aula el mensaje del servidor ya lo explica
    } else setStatus(error.message, 'error');
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
// En el aula privada se compila a través de su API (sesión + inscripción); en el resto, como siempre.
const accountReady = connectAccount().catch(() => {}).then(() => {
  if (account.site && account.site !== 'sin-aula') usarAula(cuenta.tokenCsrf);
});
updateDirty();
renderProgress();
updateButtons();
guide.notify('welcome', { completed: Boolean(stored.completedAt) });
accountReady.then(checkCompiler)
  .then((info) => setService(Boolean(info.ok), info.version?.compilador || 'avr-gcc'))
  .catch((error) => {
    setService(false);
    if (enAula()) setStatus(error.message, 'warn');
  });
