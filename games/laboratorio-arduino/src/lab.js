// Laboratorio de programación Arduino de GLOBALT: lección, editor, compilación, simulación, reto y guía.
// startLab(L) monta una lección del manifiesto (lessons/index.js). Cada lección tiene su propio código guardado
// (navegador y cuenta), su circuito, su evaluación y sus pistas; cambiar de lección recarga la página.
import { createEditor } from './editor.js';
import { checkCompiler, compileSketch, CompilerUnavailable, usarAula, enAula } from './compiler.js';
import { explainDiagnostic, GENERIC_HELP } from './compiler-help.js';
import { Simulation, recordTrace } from './simulation.js';
import { createGuide } from './guide.js';
import * as progress from './progress.js';
import * as cuenta from './cuenta.js';
import { MANIFEST, lessonHref } from './lessons/index.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_MONITOR_CHARS = 20000;

export function startLab(L) {
  renderHeader(L);
  $('#lesson').innerHTML = L.html();
  const guide = createGuide($('#guide'), {
    providers: [L.guide.help], getContext: () => guideContext(), chooseTopic: L.guide.chooseTopic, hintText: L.guide.hintText });
  const circuit = L.circuit($('#circuit'));

  const stored = progress.getLesson(L.id);
  let savedCode = typeof stored.code === 'string' ? stored.code : L.exampleCode;
  let compiled = null;   // { code, result }
  let busy = false;
  let lastCompileError = null; // { code, errorLine, errorHelp } del último intento fallido
  let lastEval = null;         // { code, checks } de la última evaluación
  let evalRepeat = { id: null, count: 0 };
  let servicePending = false; // sin servicio de compilación en este sitio: se desactivan solo sus acciones

  const editor = createEditor($('#editor'), { value: savedCode, onChange: updateDirty, onSave: save });

  // ---------- Guardado local ----------
  const isDirty = () => editor.value !== savedCode;
  function updateDirty() {
    const dirty = isDirty();
    $('#save-state').textContent = dirty ? 'Cambios sin guardar' : (typeof progress.getLesson(L.id).code === 'string' ? 'Guardado en este navegador' : 'Ejemplo original');
    $('#save-state').classList.toggle('is-dirty', dirty);
  }
  function save() {
    if (!progress.saveCode(L.id, editor.value)) {
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
    progress.clearCode(L.id);
    savedCode = L.exampleCode;
    editor.setValue(L.exampleCode);
    updateDirty();
    showDiagnostics(null);
    syncAccount();
  }
  let leaving = false;   // el estudiante ya eligió qué hacer con sus cambios al cambiar de lección
  window.addEventListener('beforeunload', (e) => { if (!leaving && isDirty()) { e.preventDefault(); e.returnValue = ''; } });

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
    const local = progress.getLesson(L.id).code;
    if (typeof local === 'string' && local !== remote.codigo) progress.saveBackup(L.id, local);
    editor.setValue(remote.codigo);
    progress.saveCode(L.id, remote.codigo);
    savedCode = remote.codigo;
    account.version = remote.version;
    updateDirty();
    showDiagnostics(null);
    renderRecover();
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
    progress.saveBackup(L.id, remote.codigo);
    closeChoice();
    renderRecover();
    save();                              // guarda aquí y sube a la cuenta
  });

  /** Sube el código guardado localmente. Encola las llamadas para no cruzar versiones. */
  function syncAccount(code = savedCode) {
    if (!account.active) return;
    if (account.choosing) { accountState('Guardado en este navegador. Elige primero qué versión usar en tu cuenta.', 'warn'); return; }
    account.queue = account.queue.then(async () => {
      accountState('Guardando en tu cuenta…', 'busy');
      try {
        const saved = await cuenta.guardar(L.id, code, account.version);
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
    const result = await cuenta.conectar(L.id);
    account.site = result.estado;
    if (result.estado === 'sin-aula') { $('#cuenta').hidden = true; return; }
    if (result.estado === 'sin-sesion') { accountState(`Entra en el ${AULA_LINK} para guardar tu código también en tu cuenta.`, '', { html: true }); return; }
    if (result.estado === 'sin-inscripcion') { accountState(`${esc(result.mensaje)} Ir al ${AULA_LINK}.`, '', { html: true }); return; }
    // La API del aula aún no admite esta lección (p. ej., antes de actualizarla en el servidor): solo guardado local.
    if (result.estado === 'no-disponible') { accountState('Esta lección todavía no se guarda en tu cuenta: tu código se guarda solo en este navegador.', 'warn'); return; }
    if (result.estado === 'error') { account.failed = true; accountState('No se pudo conectar con tu cuenta. Tu código sigue guardado en este navegador.', 'error', { retry: true }); return; }
    account.active = true;
    account.failed = false;
    const remote = result.borrador;
    const hasLocal = typeof progress.getLesson(L.id).code === 'string' || isDirty();
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
    const lesson = progress.getLesson(L.id);
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
    el.textContent = ready ? `Compilador listo · ${info}`
      : (pending ? 'Compilación próximamente' : (enAula() ? 'Compilador no disponible' : 'Compilador sin respuesta'));
    el.dataset.kind = ready ? 'ok' : 'warn';
    servicePending = !ready && pending;
    updateButtons();
  }
  function serviceUnavailable(error) {
    setService(false, '', Boolean(error?.pending));
    setStatus(error?.message || 'No se pudo contactar con el compilador.', 'warn');
    if (error?.pending) guide.notify('service-pending');   // si el servidor da un motivo, ya se muestra arriba
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
        const first = (result.diagnosticos || []).find((d) => d.tipo === 'error');
        lastCompileError = { code, errorLine: first?.linea || null, errorHelp: (first && explainDiagnostic(first.mensaje)) || GENERIC_HELP };
        setStatus('El compilador encontró errores.', 'error');
        guide.notify('compile-error', { diagnostics: result.diagnosticos || [] });
        return null;
      }
      lastCompileError = null;
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
    watch: L.pins,
    onWindows(windows) {
      for (const w of windows) { circuit.update(w); if (w.level || w.duty > 0) pinsSeen.add(w.pin); }
    },
    onSerial(bytes, baud) {
      if (!baudWarned && Math.abs(baud - L.baud) > L.baud * 0.03) {
        baudWarned = true;
        $('#baud-warning').hidden = false;
        $('#baud-warning').textContent = `El programa transmite a ${Math.round(baud)} baudios y el monitor está a ${L.baud}. En una placa real verías caracteres extraños.`;
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
    circuit.reset();
    pinsSeen = new Set();
    simulation.start(hex);
    $('#sim-state').textContent = 'En ejecución';
    $('#sim-panel').classList.add('is-running');
    updateButtons();
    setTimeout(() => {
      if (!simulation.running || L.pins.some((p) => pinsSeen.has(p))) return;
      const others = [...pinsSeen].filter((p) => p > 1 && !L.pins.includes(p)).map((p) => 'D' + p).join(', ');
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
    setStatus(`Evaluando: ${L.evaluation.durationMs / 1000} s simulados…`, 'busy');
    try {
      const result = L.evaluation.evaluate(await recordTrace(hex, L.evaluation.durationMs, { watch: L.pins }));
      progress.recordAttempt(L.id);
      lastEval = { code, checks: result.checks };
      renderChecks(result);
      if (result.passed) {
        progress.markCompleted(L.id, code);
        if (editor.value === code) save();
        setStatus('Reto superado y guardado en este navegador.', 'ok');
        guide.notify('eval-pass');
      } else {
        setStatus('El reto aún no se cumple.', 'warn');
        const failedId = result.checks.find((c) => !c.ok)?.id;
        evalRepeat = { id: failedId, count: evalRepeat.id === failedId ? evalRepeat.count + 1 : 0 };
        guide.notify('eval-fail', { checks: result.checks, repeat: evalRepeat.count });
      }
      renderProgress();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }));

  // ---------- Lección por pasos (solo orientación: recorrerla nunca aprueba el reto) ----------
  const lessonRoot = $('#lesson');
  let step = Math.min(Math.max(Number(stored.step) || 0, 0), L.steps.length - 1);
  const seen = new Set(Array.isArray(stored.seen) ? stored.seen : []);

  function showStep(index, { focus = false } = {}) {
    step = Math.min(Math.max(index, 0), L.steps.length - 1);
    seen.add(step);
    lessonRoot.querySelectorAll('.step').forEach((el, i) => { el.hidden = i !== step; });
    lessonRoot.querySelectorAll('.steps__btn').forEach((btn, i) => {
      if (i === step) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      btn.querySelector('.steps__seen').hidden = !seen.has(i) || i === step;
    });
    lessonRoot.querySelector('[data-nav="prev"]').disabled = step === 0;
    const next = lessonRoot.querySelector('[data-nav="next"]');
    next.textContent = step === L.steps.length - 1 ? 'Repasar desde el paso 1' : 'Siguiente →';
    progress.saveSteps(L.id, step, [...seen]);
    if (focus) lessonRoot.querySelector(`#step-${L.steps[step].id}-t`).focus();
  }

  const FOCUS_TARGET = { '#editor-zone': '.code-editor__input', '#sim-panel': '#sim-panel', '#btn-compile': '#btn-compile', '#btn-check': '#btn-check' };
  function goTo(selector) {
    const target = $(FOCUS_TARGET[selector] || selector);
    if (!target) return;
    if (target.id === 'sim-panel') target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  // Copia de respaldo: el código que había antes de probar un ejemplo (o de elegir la versión de la cuenta).
  function renderRecover() {
    const lesson = progress.getLesson(L.id);
    const has = typeof lesson.backupCode === 'string' && lesson.backupCode !== editor.value;
    $('#recover').hidden = !has;
    if (has) {
      const date = lesson.backupAt ? new Date(lesson.backupAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';
      $('#recover-text').textContent = `Hay una copia de respaldo de tu código${date ? ` (${date})` : ''} en este navegador.`;
    }
  }
  $('#btn-recover').addEventListener('click', () => {
    const backup = progress.getLesson(L.id).backupCode;
    if (typeof backup !== 'string') return;
    progress.saveBackup(L.id, editor.value);   // intercambia: lo que se ve ahora queda como respaldo
    editor.replaceAll(backup);
    showDiagnostics(null);
    renderRecover();
    setStatus('Tu código anterior volvió al editor. Pulsa Guardar para conservarlo.', 'ok');
  });

  function askReplace() {
    const dialog = $('#example-dialog');
    if (typeof dialog.showModal !== 'function') {
      return Promise.resolve(confirm('El ejemplo reemplazará el código del editor. Tu código actual quedará como copia de respaldo. ¿Continuar?'));
    }
    return new Promise((resolve) => {
      dialog.returnValue = '';
      // El evento «close» llega en una tarea posterior: se ignora uno atrasado si el diálogo ya volvió a abrirse.
      const onClose = () => {
        if (dialog.open) return;
        dialog.removeEventListener('close', onClose);
        resolve(dialog.returnValue === 'replace');
      };
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });
  }

  async function tryExample(id, trigger) {
    const { code, title } = L.examples[id];
    if (editor.value === code) { setStatus('Ese ejemplo ya está en el editor.'); return; }
    if (!(await askReplace())) { trigger.focus(); setStatus('No se cambió nada en el editor.'); return; }
    if (!progress.saveBackup(L.id, editor.value)) {
      setStatus('Este navegador no permite guardar una copia de respaldo; no se cambió el editor. Copia el ejemplo en su lugar.', 'warn');
      trigger.focus();
      return;
    }
    editor.replaceAll(code);
    showDiagnostics(null);
    renderRecover();
    setStatus(`Ejemplo «${title}» en el editor, sin guardar. Pulsa Ejecutar para observarlo.`, 'ok');
  }

  async function copyExample(id) {
    try {
      await navigator.clipboard.writeText(L.examples[id].code);
      setStatus('Ejemplo copiado al portapapeles.', 'ok');
    } catch {
      setStatus('No se pudo copiar automáticamente: selecciona el texto del ejemplo y cópialo.', 'warn');
    }
  }

  lessonRoot.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.step) showStep(Number(btn.dataset.step), { focus: true });
    else if (btn.dataset.nav === 'prev') showStep(step - 1, { focus: true });
    else if (btn.dataset.nav === 'next') showStep(step === L.steps.length - 1 ? 0 : step + 1, { focus: true });
    else if (btn.dataset.goto) goTo(btn.dataset.goto);
    else if (btn.dataset.example && btn.dataset.act === 'try') tryExample(btn.dataset.example, btn);
    else if (btn.dataset.example && btn.dataset.act === 'copy') copyExample(btn.dataset.example);
  });
  // Flechas izquierda/derecha entre los botones de pasos.
  lessonRoot.querySelector('.steps').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = [...lessonRoot.querySelectorAll('.steps__btn')];
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length].focus();
  });

  function guideContext() {
    const code = editor.value;
    return {
      code,
      untouched: code === L.exampleCode,
      step,
      compileError: lastCompileError?.code === code ? lastCompileError : null,
      lastChecks: lastEval?.code === code ? lastEval.checks : null,
      completed: Boolean(progress.getLesson(L.id).completedAt),
    };
  }

  // ---------- Cambio de lección (cada lección guarda su propio código; nunca se mezclan) ----------
  renderPicker(L);
  function askSwitch(target) {
    const dialog = $('#switch-dialog');
    $('#switch-dialog-desc').textContent = `Tienes cambios sin guardar en «${L.titulo}». Cada lección guarda su propio código: si cambias a «${target.titulo}» sin guardar, estos cambios se pierden.`;
    if (typeof dialog.showModal !== 'function') {
      if (confirm('Tienes cambios sin guardar. ¿Guardarlos antes de cambiar de lección?')) return Promise.resolve('save');
      return Promise.resolve(confirm('¿Cambiar de lección y descartar los cambios sin guardar?') ? 'discard' : 'cancel');
    }
    return new Promise((resolve) => {
      dialog.returnValue = '';
      const onClose = () => {
        if (dialog.open) return;
        dialog.removeEventListener('close', onClose);
        resolve(dialog.returnValue || 'cancel');
      };
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });
  }
  async function switchLesson(link) {
    const target = MANIFEST.find((m) => m.id === link.dataset.lesson);
    if (!target || target.id === L.id) return;
    if (isDirty()) {
      const choice = await askSwitch(target);
      if (choice === 'cancel') { link.focus(); setStatus('Sigues en esta lección; no se cambió nada.'); return; }
      if (choice === 'save') {
        if (!save()) { link.focus(); return; }   // sin almacenamiento: no se cambia para no perder el código
        setStatus('Código guardado. Cambiando de lección…', 'busy');
        // Espera (como mucho 8 s) a que termine la copia en la cuenta; la copia local ya está hecha.
        await Promise.race([account.queue, new Promise((r) => setTimeout(r, 8000))]);
      }
    }
    simulation.stop();
    leaving = true;
    location.assign(link.href);
  }
  $('#lesson-picker').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-lesson]');
    if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    switchLesson(link);
  });

  // ---------- Inicio ----------
  // En el aula privada se compila a través de su API (sesión + inscripción); en el resto, como siempre.
  const accountReady = connectAccount().catch(() => {}).then(() => {
    if (account.site && account.site !== 'sin-aula') usarAula(cuenta.tokenCsrf);
  });
  updateDirty();
  renderProgress();
  updateButtons();
  showStep(step);
  renderRecover();
  guide.notify('welcome', { completed: Boolean(stored.completedAt) });
  accountReady.then(checkCompiler)
    .then((info) => setService(Boolean(info.ok), info.version?.compilador || 'avr-gcc'))
    .catch((error) => {
      if (error instanceof CompilerUnavailable && error.pending) serviceUnavailable(error);
      else {
        setService(false);
        if (enAula()) setStatus(error.message, 'warn');   // sin sesión, sin inscripción o compilador detenido
      }
    });
}

const COURSE = 'Electrónica y C++ con Arduino';

/** Cabecera, títulos y texto de la evaluación de la lección activa. */
function renderHeader(L) {
  $('.lab-top__course').textContent = `${COURSE} · Lección ${L.numero}`;
  $('.lab__kicker').textContent = L.kicker;
  $('.lab__lesson-title').textContent = L.titulo;
  if (L.numero !== 1) document.title = `${L.corto} · Laboratorio Arduino · GLOBALT ROBOTICS`;
  $('#eval-result').innerHTML = `<p class="muted">${esc(L.evaluation.note)}</p>`;
}

/**
 * Lista de lecciones con la actual marcada y las previas recomendadas (no bloquean).
 * «Superado» sale solo del registro local de este navegador.
 */
function renderPicker(current) {
  const done = (id) => Boolean(progress.getLesson(id).completedAt);
  const items = MANIFEST.map((m) => {
    const here = current && m.id === current.id;
    return `<li><a href="${lessonHref(m.id)}" data-lesson="${esc(m.id)}"${here ? ' aria-current="page"' : ''}>
      <span class="lesson-picker__n">${m.numero}</span><span class="lesson-picker__t">${esc(m.corto)}<small>${esc(m.tema)}</small></span>
      ${done(m.id) ? '<span class="lesson-picker__ok">Superado<span class="sr-only"> en este navegador</span></span>' : ''}</a></li>`;
  }).join('');
  const pending = current ? current.previas.filter((id) => !done(id)).map((id) => MANIFEST.find((m) => m.id === id)).filter(Boolean) : [];
  const box = $('#lesson-picker');
  box.innerHTML = `<details class="lesson-picker__box"${current ? '' : ' open'}>
      <summary>${current ? `Lección ${current.numero} de ${MANIFEST.length} · cambiar de lección` : 'Lecciones del curso'}</summary>
      <ol class="lesson-picker__list">${items}</ol>
    </details>
    ${pending.length ? `<p class="lesson-picker__prev">Recomendado antes: ${pending.map((m) => `<a href="${lessonHref(m.id)}" data-lesson="${esc(m.id)}">Lección ${m.numero} · ${esc(m.corto)}</a>`).join(', ')}. Puedes empezar igualmente.</p>` : ''}`;
  box.hidden = false;
}

/**
 * Identificador de lección desconocido: no se monta el editor, no se conecta con la cuenta y no se escribe
 * nada en el navegador; solo se ofrece la lista de lecciones.
 */
export function renderUnknown(requested) {
  $('.lab-top__course').textContent = COURSE;
  $('.lab__kicker').textContent = 'Lección no encontrada';
  $('.lab__lesson-title').textContent = 'Esa lección no existe';
  $('.lab__jump').hidden = true;
  $('#service').hidden = true;
  $('.lab__work').hidden = true;
  document.title = 'Lección no encontrada · Laboratorio Arduino · GLOBALT ROBOTICS';
  $('#lesson').innerHTML = '<p class="lesson-goal" id="unknown-lesson"></p><p>No se ha guardado ni cambiado nada. Elige una de las lecciones del curso:</p>';
  $('#unknown-lesson').textContent = `No hay ninguna lección con el identificador «${String(requested).slice(0, 80)}».`;
  renderPicker(null);
}
