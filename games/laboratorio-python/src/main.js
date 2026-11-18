// Laboratorio «Python desde Cero»: práctica de la URL (?practica=<id>), editor con archivos, entrada, consola,
// errores con línea y pista, comprobación del reto por casos y borradores en este navegador.
import { PRACTICAS, resolverPractica, evaluarCaso } from './practicas.js';
import { Interprete } from './interprete.js';
import { crearEditor } from './editor.js';
import { pistaError } from './errores.js';
import * as guardado from './guardado.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LIMITE_EJECUCION_MS = 10000;
const LIMITE_CASO_MS = 6000;
const MAX_CONSOLA = 40000;

const { practica: P, pedida } = resolverPractica(location.search);
// Cuenta del aula (progreso de course-python). Sin aula, sin sesión o si falla: modo invitado como siempre.
// El historial de invitado (borradores y retos marcados sin cuenta) nunca se atribuye a la cuenta.
let refrescarCuenta = () => {};
const cuenta = await import('../../laboratorio-web/progreso-cuenta.js')
  .then((m) => m.conectarLaboratorio('course-python', { alCambiar: () => refrescarCuenta() }))
  .catch(() => null);
const conCuenta = () => Boolean(cuenta && cuenta.modo !== 'invitado');
guardado.configurar(conCuenta() ? cuenta.espacio : '');
const hecho = (id) => (conCuenta() ? cuenta.estado(id) === 'completada' : guardado.superado(id));
pintarNavegacion(P);
pintarCuenta();
refrescarCuenta = () => { pintarNavegacion(P); pintarCuenta(); if (P) pintarEstadoReto(); };

function pintarCuenta() {
  if (!cuenta || cuenta.inicio === 'sin-aula') return;
  const a = cuenta.aviso();
  $('#cuenta').hidden = false;
  $('#cuenta').dataset.tipo = a.tipo;
  $('#cuenta-borrador').textContent = a.borrador;
  $('#cuenta-avance').textContent = a.avance;
  $('#cuenta-reintentar').hidden = !a.reintentar || Boolean(a.recargar);
  $('#cuenta-recargar').hidden = !a.recargar;
  if (conCuenta()) $('.nota-guardado').textContent = 'Tu código y tu entrada se guardan automáticamente solo en este navegador, en un espacio separado para tu cuenta, por separado en cada práctica. No se envían al servidor: en otro navegador no aparecerán. Tu avance (práctica visitada y reto superado) sí se guarda en tu cuenta.';
}
$('#cuenta-reintentar').addEventListener('click', () => cuenta?.sincronizar());
$('#cuenta-recargar').addEventListener('click', () => location.reload());

function pintarEstadoReto() {
  if (conCuenta()) {
    const e = cuenta.estado(P.id);
    const pendiente = cuenta.mapa().get(P.id)?.pendiente;
    $('#estado-reto').innerHTML = e === 'completada'
      ? `<strong class="ok">Reto superado</strong> · ${pendiente ? 'pendiente de enviar a tu cuenta (guardado en este navegador solo para tu cuenta).' : 'guardado en tu cuenta.'}`
      : cuenta.modo === 'detenido' ? 'Reto pendiente. Esta página ya no registra avance en ninguna cuenta.'
        : 'Reto pendiente (al superarlo se guardará en tu cuenta).';
    return;
  }
  const s = guardado.leer(P.id).superado_en;
  $('#estado-reto').innerHTML = s
    ? `<strong class="ok">Reto superado</strong> el ${esc(new Date(s).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }))} · registrado solo en este navegador.`
    : 'Reto pendiente (el resultado se registra solo en este navegador).';
}
if (!P) desconocida(pedida);
else iniciar(P);

function pintarNavegacion(actual) {
  $('#practicas').innerHTML = `<ol>${PRACTICAS.map((p) => `<li><a href="?practica=${esc(p.id)}"${actual?.id === p.id ? ' aria-current="page"' : ''}>
    <span class="practicas__n">${p.numero}</span><span class="practicas__t">${esc(p.corto)}</span>
    ${hecho(p.id) ? (conCuenta() ? '<span class="practicas__ok" title="Reto superado (tu cuenta)">✓<span class="sr-only"> superado en tu cuenta</span></span>'
      : '<span class="practicas__ok" title="Reto superado en este navegador">✓<span class="sr-only"> superado en este navegador</span></span>') : ''}</a></li>`).join('')}</ol>`;
  for (const [i, li] of [...$('#practicas').querySelectorAll('li')].entries()) {
    li.dataset.estado = conCuenta() ? cuenta.estado(PRACTICAS[i].id) : (hecho(PRACTICAS[i].id) ? 'completada' : 'sin-comenzar');
  }
}

function desconocida(id) {
  document.title = 'Práctica no encontrada · Laboratorio Python · GLOBALT ROBOTICS';
  $('#kicker').textContent = 'Práctica no encontrada';
  $('#titulo-practica').textContent = 'Esa práctica no existe';
  $('#objetivo').textContent = `No hay ninguna práctica con el identificador «${String(id).slice(0, 80)}». Elige una de la lista. No se guardó ni cambió nada.`;
  for (const s of ['.ejemplo', '.reto', '.py__trabajo']) $(s).hidden = true;
  $('#interprete').hidden = true;
}

function iniciar(P) {
  // ---------- Contenido ----------
  document.title = `${P.corto} · Python desde Cero · GLOBALT ROBOTICS`;
  $('#curso-practica').textContent = `Python desde Cero · Práctica ${P.numero} de ${PRACTICAS.length}`;
  $('#kicker').textContent = `Práctica ${P.numero} · ${P.corto}`;
  $('#titulo-practica').textContent = P.titulo;
  $('#objetivo').textContent = P.objetivo;
  $('#secciones').innerHTML = P.secciones.map((s) => `<section class="seccion"><h3>${esc(s.titulo)}</h3>${s.html}</section>`).join('');
  $('#titulo-ejemplo').textContent = `Ejemplo: ${P.ejemplo.titulo}`;
  $('#codigo-ejemplo').textContent = P.ejemplo.codigo;
  $('#enunciado').innerHTML = P.reto.enunciado;

  cuenta?.visitar(P.id);   // con cuenta: registra la visita (no completa)

  // ---------- Archivos y borrador (solo este navegador; con cuenta, en el espacio de la cuenta) ----------
  const borrador = guardado.leer(P.id);
  const invitado = conCuenta() && !borrador.guardado_en ? guardado.leerInvitado(P.id) : {};
  if (invitado.archivos && P.archivos.some((a) => typeof invitado.archivos[a.nombre] === 'string' && invitado.archivos[a.nombre] !== a.inicial)) {
    $('#copiar-invitado').hidden = false;
    $('#copiar-invitado').addEventListener('click', () => {
      if (!confirm('¿Copiar al espacio de tu cuenta el código que se escribió en este navegador sin cuenta? Solo se copia el código y la entrada: los retos de invitado no se suman a tu cuenta.')) return;
      const copia = {};
      for (const a of P.archivos) copia[a.nombre] = typeof invitado.archivos[a.nombre] === 'string' ? invitado.archivos[a.nombre] : a.inicial;
      guardado.guardar(P.id, copia, typeof invitado.entrada === 'string' ? invitado.entrada : P.entrada);
      location.reload();
    });
  }
  const archivos = {};
  for (const a of P.archivos) archivos[a.nombre] = typeof borrador.archivos?.[a.nombre] === 'string' ? borrador.archivos[a.nombre] : a.inicial;
  let activo = P.principal;
  $('#entrada').value = typeof borrador.entrada === 'string' ? borrador.entrada : P.entrada;
  const editor = crearEditor($('#editor'), { valor: archivos[activo], etiqueta: `Código de ${activo}`, alCambiar: (v) => { archivos[activo] = v; programarGuardado(); } });

  function pintarPestanas() {
    $('#pestanas').innerHTML = P.archivos.map((a) => `<button type="button" role="tab" data-archivo="${esc(a.nombre)}"
      aria-selected="${a.nombre === activo}">${esc(a.nombre)}</button>`).join('');
  }
  function abrir(nombre) {
    if (!(nombre in archivos)) return;
    activo = nombre;
    editor.setValue(archivos[nombre]);
    editor.elemento.setAttribute('aria-label', `Código de ${nombre}`);
    pintarPestanas();
  }
  $('#pestanas').addEventListener('click', (e) => { const b = e.target.closest('[data-archivo]'); if (b) abrir(b.dataset.archivo); });
  pintarPestanas();

  let temporizador = 0;
  function programarGuardado() {
    $('#guardado').textContent = 'Guardando…';
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarAhora, 500);
  }
  function guardarAhora() {
    clearTimeout(temporizador);
    const ok = guardado.guardar(P.id, archivos, $('#entrada').value);
    $('#guardado').textContent = ok ? 'Guardado en este navegador' : 'Este navegador no permite guardar (modo privado o almacenamiento bloqueado)';
    $('#guardado').dataset.tipo = ok ? 'ok' : 'aviso';
  }
  $('#entrada').addEventListener('input', programarGuardado);
  addEventListener('pagehide', guardarAhora);
  $('#guardado').textContent = borrador.guardado_en ? 'Borrador recuperado de este navegador' : 'Código inicial';

  $('#btn-restaurar').addEventListener('click', () => {
    if (!confirm('¿Restaurar el código inicial de esta práctica? Se reemplazarán tus archivos y tu entrada guardados en este navegador.')) return;
    guardado.borrar(P.id);
    for (const a of P.archivos) archivos[a.nombre] = a.inicial;
    $('#entrada').value = P.entrada;
    abrir(activo);
    $('#guardado').textContent = 'Código inicial restaurado';
    limpiarError();
  });

  // ---------- Intérprete ----------
  const pill = $('#interprete');
  const interprete = new Interprete({
    onEstado(estado, info) {
      pill.dataset.tipo = estado;
      if (estado === 'cargando') pill.textContent = 'Cargando Python…';
      else if (estado === 'listo') pill.textContent = `Python ${info.python} listo`;
      else {
        pill.textContent = 'Python no disponible';
        mostrarFalloCarga(info?.mensaje);
      }
      actualizarBotones();
    },
  });
  let ocupado = false;
  function actualizarBotones() {
    const listo = interprete.estado === 'listo';
    $('#btn-ejecutar').disabled = !listo || ocupado;
    $('#btn-comprobar').disabled = !listo || ocupado;
    $('#btn-ejemplo').disabled = !listo || ocupado;
    $('#btn-detener').disabled = !ocupado;
  }
  function mostrarFalloCarga(mensaje) {
    const caja = $('#error');
    caja.hidden = false;
    caja.dataset.tipo = 'carga';
    caja.innerHTML = `<p><strong>No se pudo cargar el intérprete de Python.</strong> Puede ser la conexión (la primera carga descarga unos 13,5 MB) o un bloqueo del navegador. Tu código sigue guardado en este navegador.</p>
      <p class="muted"><small>${esc(mensaje || '')}</small></p>
      <button type="button" class="btn btn--primary btn--sm" id="btn-reintentar-carga">Reintentar</button>`;
    $('#btn-reintentar-carga').addEventListener('click', () => { caja.hidden = true; interprete.iniciar(); });
  }
  interprete.iniciar();

  // ---------- Consola ----------
  const consola = $('#consola');
  let caracteres = 0;
  function escribir(clase, texto) {
    if (caracteres >= MAX_CONSOLA) return;
    texto = texto.slice(0, MAX_CONSOLA - caracteres);
    caracteres += texto.length;
    const abajo = consola.scrollHeight - consola.scrollTop - consola.clientHeight < 30;
    const ultimo = consola.lastElementChild;
    if (ultimo && ultimo.dataset.clase === clase) ultimo.textContent += texto;
    else {
      const s = document.createElement('span');
      s.className = `c-${clase}`;
      s.dataset.clase = clase;
      s.textContent = texto;
      consola.append(s);
    }
    if (abajo) consola.scrollTop = consola.scrollHeight;
  }
  function limpiarConsola() { consola.textContent = ''; caracteres = 0; }
  function limpiarError() { if ($('#error').dataset.tipo !== 'carga') $('#error').hidden = true; editor.marcar(null); $('#archivos-virtuales').hidden = true; }
  $('#btn-limpiar').addEventListener('click', () => { limpiarConsola(); limpiarError(); });

  const lineasEntrada = (texto) => {
    if (texto === '') return [];
    const l = texto.replace(/\r\n?/g, '\n').split('\n');
    if (l.length > 1 && l.at(-1) === '') l.pop();   // un salto final no es una línea más
    return l;
  };

  function mostrarError(error, nombresPractica) {
    const caja = $('#error');
    caja.dataset.tipo = 'programa';
    const enPractica = error.archivo && nombresPractica.includes(error.archivo);
    const donde = error.linea ? `${error.archivo || 'tu programa'}, línea ${error.linea}` : (error.archivo || '');
    caja.innerHTML = `<p class="error-py__tipo"><strong>${esc(error.tipo)}</strong>${donde ? ` en ${esc(donde)}` : ''}</p>
      ${error.texto ? `<pre class="error-py__linea">${error.linea ? `${error.linea} │ ` : ''}${esc(error.texto)}</pre>` : ''}
      <p class="error-py__msg"><code>${esc(error.mensaje)}</code></p>
      <p class="error-py__pista"><strong>Pista:</strong> ${esc(pistaError(error))}</p>
      ${enPractica && error.linea ? `<button type="button" class="btn btn--ghost btn--sm" id="btn-ir-linea">Ir a la línea ${error.linea}</button>` : ''}`;
    caja.hidden = false;
    if (enPractica && error.linea) {
      const ir = () => { if (activo !== error.archivo) abrir(error.archivo); editor.marcar(error.linea, { ir: true }); };
      if (activo === error.archivo) editor.marcar(error.linea);
      $('#btn-ir-linea').addEventListener('click', ir);
    }
  }

  function mostrarFin(resultado, segundos) {
    if (resultado.estado === 'tiempo') escribir('aviso', `\n⏹ El programa superó ${segundos} s y se detuvo. ¿Un ciclo que no termina? El intérprete se está recargando.\n`);
    else if (resultado.estado === 'detenido') escribir('aviso', '\n⏹ Ejecución detenida. El intérprete se está recargando.\n');
    else if (resultado.estado === 'salida-excedida') escribir('aviso', '\n⏹ El programa imprimió demasiado texto y se cortó (¿un print dentro de un ciclo que no termina?).\n');
    else if (resultado.estado === 'fallo-interno') escribir('aviso', `\nError interno del intérprete: ${resultado.mensaje}\n`);
    else if (resultado.estado === 'ok') escribir('aviso', '\n— Programa terminado —\n');
  }

  function mostrarArchivos(resultado, originales) {
    const caja = $('#archivos-virtuales');
    const cambiados = Object.entries(resultado.archivos || {}).filter(([n, t]) => !n.endsWith('.py') && originales[n] !== t);
    caja.hidden = !cambiados.length;
    caja.innerHTML = cambiados.length ? `<h4>Archivos virtuales creados o modificados</h4>${cambiados.map(([n, t]) => `<details open><summary>${esc(n)}</summary>
      <pre>${t === null ? '(contenido no textual)' : esc(t || '(vacío)')}</pre></details>`).join('')}
      <p class="muted"><small>Solo existen durante la ejecución, en la memoria del navegador. No se guardan en tu equipo.</small></p>` : '';
  }

  async function correr(datos, { titulo } = {}) {
    if (ocupado) return null;
    ocupado = true;
    actualizarBotones();
    limpiarConsola();
    limpiarError();
    if (titulo) escribir('aviso', `— ${titulo} —\n`);
    const resultado = await interprete.ejecutar(datos, { onSalida: escribir, limiteMs: LIMITE_EJECUCION_MS });
    ocupado = false;
    actualizarBotones();
    mostrarFin(resultado, LIMITE_EJECUCION_MS / 1000);
    if (resultado.estado === 'error') mostrarError(resultado.error, Object.keys(datos.archivos));
    return resultado;
  }

  $('#btn-ejecutar').addEventListener('click', async () => {
    guardarAhora();
    const r = await correr({ archivos: { ...archivos }, principal: P.principal, entrada: lineasEntrada($('#entrada').value) });
    if (r?.archivos) mostrarArchivos(r, archivos);
  });
  $('#btn-ejemplo').addEventListener('click', () => correr({ archivos: { 'ejemplo.py': P.ejemplo.codigo }, principal: 'ejemplo.py',
    entrada: lineasEntrada(P.ejemplo.entrada) }, { titulo: `Ejemplo: ${P.ejemplo.titulo}${P.ejemplo.entrada ? ` (entrada: ${P.ejemplo.entrada.replace(/\n/g, ', ')})` : ''}` }));
  $('#btn-detener').addEventListener('click', () => interprete.detener());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !$('#btn-ejecutar').disabled) { e.preventDefault(); $('#btn-ejecutar').click(); }
  });

  // ---------- Pistas del reto (no dan la solución completa) ----------
  let pistasVistas = 0;
  $('#btn-pista').addEventListener('click', () => {
    if (pistasVistas >= P.pistas.length) return;
    const li = document.createElement('li');
    li.textContent = P.pistas[pistasVistas++];
    $('#lista-pistas').append(li);
    if (pistasVistas >= P.pistas.length) { $('#btn-pista').disabled = true; $('#btn-pista').textContent = 'No hay más pistas'; }
    else $('#btn-pista').textContent = `Otra pista (${pistasVistas}/${P.pistas.length})`;
  });

  // ---------- Comprobación del reto ----------
  pintarEstadoReto();

  $('#btn-comprobar').addEventListener('click', async () => {
    if (ocupado) return;
    guardarAhora();
    ocupado = true;
    actualizarBotones();
    limpiarError();
    const caja = $('#resultado');
    const filas = [];
    const pintar = (pie = '') => {
      caja.innerHTML = `<ul class="casos">${filas.map((f) => `<li class="${f.ok ? 'ok' : 'fallo'}"><span aria-hidden="true">${f.ok ? '✓' : '✗'}</span>
        <span><strong>${esc(f.nombre)}</strong><span class="sr-only">${f.ok ? ' (correcto)' : ' (no superado)'}</span><br><small>${esc(f.detalle)}</small></span></li>`).join('')}</ul>${pie}`;
    };
    const copia = { ...archivos };
    let errorMostrado = false;
    for (const [i, caso] of P.casos.entries()) {
      pintar(`<p class="muted">Comprobando caso ${i + 1} de ${P.casos.length}…</p>`);
      let resultado = { estado: 'ok' };
      if (!caso.requiere) {
        const datos = { ...copia };
        for (const [n, t] of Object.entries(caso.archivos || {})) { if (t === null) delete datos[n]; else datos[n] = t; }
        resultado = await interprete.ejecutar({ archivos: datos, principal: P.principal, entrada: caso.entrada || [],
          llamadas: (caso.llamadas || []).map((l) => l.expr) }, { limiteMs: LIMITE_CASO_MS });
        if (resultado.estado === 'tiempo') await interprete.listo();   // el Worker se recarga tras cortar el bucle
        if (resultado.estado === 'no-listo') { filas.push({ nombre: caso.nombre, ok: false, detalle: 'El intérprete no está disponible.' }); break; }
        if (resultado.estado === 'detenido') { filas.push({ nombre: caso.nombre, ok: false, detalle: 'Comprobación detenida.' }); await interprete.listo(); break; }
      }
      const { ok, detalle } = evaluarCaso(caso, resultado, copia);
      filas.push({ nombre: caso.nombre, ok, detalle });
      if (!ok && resultado.estado === 'error' && !errorMostrado) { errorMostrado = true; mostrarError(resultado.error, Object.keys(copia)); }
    }
    const superado = filas.length === P.casos.length && filas.every((f) => f.ok);
    pintar(superado
      ? '<p class="casos__fin ok"><strong>¡Reto superado!</strong> Todos los casos son correctos.</p>'
      : `<p class="casos__fin">${filas.filter((f) => f.ok).length} de ${P.casos.length} casos correctos. Revisa los marcados con ✗.</p>`);
    if (superado && !conCuenta()) { guardado.marcarSuperado(P.id); pintarEstadoReto(); pintarNavegacion(P); }
    else if (superado) {
      // Con cuenta: SOLO aquí (todos los casos aprobados) se registra la finalización, comprobando la sesión.
      const r = await cuenta.completar(P.id);
      if (r === 'no-registrado') caja.insertAdjacentHTML('beforeend', '<p class="casos__fin">La sesión del aula cambió: este reto no se guardó en ninguna cuenta.</p>');
      refrescarCuenta();
    }
    ocupado = false;
    actualizarBotones();
  });
}
