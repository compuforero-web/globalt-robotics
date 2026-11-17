// Aula GLOBALT: registro, acceso, cierre de sesión, «Mis cursos» y progreso del curso de Arduino.
// El aula no guarda credenciales en el navegador. El progreso se lee de la cuenta; si el laboratorio dejó avance
// pendiente para la cuenta con sesión (módulo progreso-cuenta.js del laboratorio), se envía y se borra al confirmarse.
// El progreso es DECLARATIVO: el reto se evalúa en el navegador; no es un resultado verificado por el servidor.
import * as api from './api.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vistas = { acceso: $('#vista-acceso'), cursos: $('#vista-cursos') };
let laboratorioDisponible = null;
let usuarioActual = null;
const LAB_SRC = '../../games/laboratorio-arduino/src/';
let modulosLab = null;   // { MANIFEST, pc } cuando el laboratorio está publicado en este servidor; false si no

// El manifiesto y la cola pendiente son los del laboratorio: se cargan solo si existe en este servidor.
async function cargarModulosLab() {
  if (modulosLab !== null) return modulosLab;
  try {
    const [lecciones, pc] = await Promise.all([import(LAB_SRC + 'lessons/index.js'), import(LAB_SRC + 'progreso-cuenta.js')]);
    modulosLab = { MANIFEST: lecciones.MANIFEST, pc };
  } catch {
    modulosLab = false;
  }
  return modulosLab;
}
const ESTADOS = { 'sin-comenzar': 'Sin comenzar', 'en-curso': 'En curso', completada: 'Completada' };

function estado(texto = '', tipo = '') {
  $('#estado').textContent = texto;
  $('#estado').dataset.tipo = tipo;
  $('#estado').hidden = !texto;
}

function mostrar(nombre, usuario = null) {
  for (const [clave, vista] of Object.entries(vistas)) vista.hidden = clave !== nombre;
  $('#quien').hidden = !usuario;
  $('#quien').textContent = usuario ? usuario.nombre : '';
}

function pestana(cual) {
  const registro = cual === 'registro';
  $('#form-entrar').hidden = registro;
  $('#form-registro').hidden = !registro;
  $('#tab-entrar').setAttribute('aria-selected', String(!registro));
  $('#tab-registro').setAttribute('aria-selected', String(registro));
  $('#error-form').textContent = '';
}

// El laboratorio llega con la PR #1; solo se enlaza si el archivo existe en este servidor.
async function comprobarLaboratorio(ruta) {
  if (laboratorioDisponible !== null) return laboratorioDisponible;
  try {
    const r = await fetch('../' + ruta, { method: 'HEAD', cache: 'no-store' });
    laboratorioDisponible = r.ok && (r.headers.get('content-type') || '').includes('text/html');
  } catch {
    laboratorioDisponible = false;
  }
  return laboratorioDisponible;
}

async function tarjetaCurso(curso) {
  const lab = curso.laboratorio && await comprobarLaboratorio(curso.laboratorio);
  const acceso = lab
    ? `<a class="btn btn--primary btn--sm" href="../${esc(curso.laboratorio)}">Abrir laboratorio</a>`
    : '<span class="pendiente">Laboratorio pendiente de publicación en este servidor</span>';
  return `<article class="curso"><h3>${esc(curso.titulo)}</h3>
    <p class="muted">Inscrito el ${esc(new Date(curso.inscrito_en).toLocaleDateString('es-CO', { dateStyle: 'long' }))}</p>${acceso}</article>`;
}

/** Panel de las lecciones del manifiesto con su estado y «Continuar». Solo con laboratorio publicado y API con progreso. */
async function panelProgreso(curso, clave) {
  const lab = curso.laboratorio && await comprobarLaboratorio(curso.laboratorio);
  const mods = lab && curso.progreso && await cargarModulosLab();
  if (!mods) return null;
  const { MANIFEST, pc } = mods;
  const mapa = pc.combinar(curso.progreso, pc.pendientes(clave));
  const href = (id) => `../${esc(curso.laboratorio)}?leccion=${encodeURIComponent(id)}`;
  const estadoDe = (id) => mapa.get(id)?.estado || 'sin-comenzar';
  const hechas = MANIFEST.filter((m) => estadoDe(m.id) === 'completada').length;
  const siguiente = MANIFEST.find((m) => m.id === pc.continuarCon(MANIFEST, mapa));
  const pendientes = MANIFEST.filter((m) => mapa.get(m.id)?.pendiente).length;
  const filas = MANIFEST.map((m) => {
    const e = estadoDe(m.id);
    const info = mapa.get(m.id);
    const paso = e === 'en-curso' ? `<small class="leccion__paso">Paso ${info.paso + 1}</small>` : '';
    return `<li class="leccion" data-leccion="${esc(m.id)}" data-estado="${e}">
      <a href="${href(m.id)}"><span class="leccion__n">${m.numero}</span>
        <span class="leccion__t">${esc(m.corto)}<small>${esc(m.tema)}</small></span>
        <span class="leccion__e"><span class="chip chip--${e}">${ESTADOS[e]}</span>${paso}${info?.pendiente ? '<small class="leccion__pend">Sin enviar</small>' : ''}</span></a></li>`;
  }).join('');
  return `<article class="curso curso--progreso" data-curso="${esc(curso.id)}">
    <h3>${esc(curso.titulo)}</h3>
    <p class="muted">Inscrito el ${esc(new Date(curso.inscrito_en).toLocaleDateString('es-CO', { dateStyle: 'long' }))}</p>
    <div class="progreso">
      <p class="progreso__resumen"><strong>${hechas} de ${MANIFEST.length}</strong> lecciones completadas</p>
      <progress max="${MANIFEST.length}" value="${hechas}" aria-label="Lecciones completadas">${hechas} de ${MANIFEST.length}</progress>
    </div>
    <div class="continuar">
      <a class="btn btn--primary" id="btn-continuar" href="${href(siguiente.id)}">Continuar</a>
      <span class="continuar__dest">Lección ${siguiente.numero} · ${esc(siguiente.corto)}</span>
    </div>
    <details class="lecciones-box" open><summary>Las ${MANIFEST.length} lecciones</summary><ol class="lecciones">${filas}</ol></details>
    <p class="sincro"${pendientes ? '' : ' hidden'}><span id="sincro-texto">${pendientes} lección(es) con avance sin enviar a tu cuenta (guardado en este navegador solo para tu cuenta).</span>
      <button type="button" class="btn btn--ghost btn--sm" id="btn-sincronizar">Reintentar</button></p>
    <p class="nota nota--progreso">El estado de cada lección lo declara el laboratorio de tu navegador al superar su comprobación: no es una evaluación verificada por el servidor ni sirve como certificado, nota o requisito. Leer, guardar código o pedir pistas no completa lecciones.</p>
  </article>`;
}

/** Envía el avance pendiente de la cuenta con sesión (solo el suyo; si la sesión es de otra cuenta no envía nada). */
async function enviarPendiente(clave) {
  const mods = await cargarModulosLab();
  if (!mods || !clave || !Object.keys(mods.pc.pendientes(clave)).length) return null;
  return mods.pc.enviar(clave, { sesion: api.sesion, registrar: api.registrarProgreso });
}

async function claveDe(usuario) {
  const mods = await cargarModulosLab();
  return mods && usuario ? mods.pc.claveCuenta(usuario.correo) : null;
}

async function cargarCursos(usuario) {
  usuarioActual = usuario;
  mostrar('cursos', usuario);
  estado('Cargando tus cursos…');
  const clave = await claveDe(usuario);
  const envio = await enviarPendiente(clave).catch(() => null);
  const [{ cursos: mios }, { cursos: todos }] = await Promise.all([api.misCursos(), api.catalogo()]);
  if (usuarioActual !== usuario) return;   // la sesión cambió mientras se cargaba
  const inscritos = new Set(mios.map((c) => c.id));
  $('#mis-cursos').innerHTML = mios.length
    ? (await Promise.all(mios.map(async (c) => (await panelProgreso(c, clave)) || tarjetaCurso(c)))).join('')
    : '<p class="muted">Todavía no te has inscrito en ningún curso.</p>';
  if (envio && envio.estado !== 'al-dia' && $('#sincro-texto')) {
    const motivo = { 'otra-cuenta': 'La sesión cambió: no se envió nada.', 'no-disponible': 'Este servidor aún no guarda el progreso.' }[envio.estado]
      || 'No se pudo enviar ahora; pulsa Reintentar.';
    $('#sincro-texto').textContent += ' ' + motivo;
  }
  const libres = todos.filter((c) => !inscritos.has(c.id));
  $('#catalogo').innerHTML = libres.length
    ? libres.map((c) => `<article class="curso"><h3>${esc(c.titulo)}</h3>
        <button type="button" class="btn btn--orange btn--sm" data-inscribir="${esc(c.id)}">Inscribirme</button></article>`).join('')
    : '<p class="muted">Ya estás inscrito en todos los cursos disponibles.</p>';
  estado('');
}

function tratarError(error, destino) {
  if (error.status === 401) {
    api.olvidarCsrf();
    usuarioActual = null;
    $('#mis-cursos').innerHTML = '';   // no dejar el progreso de esta cuenta en la página (navegador compartido)
    mostrar('acceso');
    estado('Tu sesión terminó. Inicia sesión de nuevo.', 'aviso');
    return;
  }
  if (error.status === 0) { estado(error.message, 'error'); return; }
  $(destino).textContent = error.message;
}

async function enviar(formulario, accion) {
  const boton = formulario.querySelector('button[type="submit"]');
  $('#error-form').textContent = '';
  if (!formulario.checkValidity()) { formulario.reportValidity(); return; }
  boton.disabled = true;
  try {
    const { usuario } = await accion(new FormData(formulario));
    formulario.reset();
    const mods = await cargarModulosLab();
    if (mods) mods.pc.avisarSesion('sesion-iniciada');   // otra cuenta pudo entrar en este navegador
    await cargarCursos(usuario);
  } catch (error) {
    // En el formulario, un 401 significa credenciales incorrectas, no sesión caducada.
    if (error.status === 0) estado(error.message, 'error');
    else $('#error-form').textContent = error.message;
  } finally {
    boton.disabled = false;
  }
}

$('#tab-entrar').addEventListener('click', () => pestana('entrar'));
$('#tab-registro').addEventListener('click', () => pestana('registro'));
$('#form-entrar').addEventListener('submit', (e) => {
  e.preventDefault();
  enviar(e.target, (d) => api.entrar(d.get('correo').trim(), d.get('clave')));
});
$('#form-registro').addEventListener('submit', (e) => {
  e.preventDefault();
  enviar(e.target, (d) => api.registrar(d.get('nombre').trim(), d.get('correo').trim(), d.get('clave')));
});
$('#btn-salir').addEventListener('click', async () => {
  const boton = $('#btn-salir');
  boton.disabled = true;
  // Último intento de enviar el avance pendiente de ESTA cuenta (máx. 5 s); lo que no salga queda en su cola.
  const clave = await claveDe(usuarioActual);
  await Promise.race([enviarPendiente(clave).catch(() => null), new Promise((r) => setTimeout(r, 5000))]);
  try {
    await api.salir();
  } catch (error) {
    if (error.status !== 401) { boton.disabled = false; estado(error.message, 'error'); return; }
  }
  boton.disabled = false;
  const mods = await cargarModulosLab();
  if (mods) mods.pc.avisarSesion('sesion-cerrada');   // las pestañas del laboratorio dejan de registrar para esta cuenta
  usuarioActual = null;
  $('#mis-cursos').innerHTML = '';
  $('#catalogo').innerHTML = '';
  mostrar('acceso');
  pestana('entrar');
  const quedan = mods && clave ? Object.keys(mods.pc.pendientes(clave)).length : 0;
  estado(quedan ? `Sesión cerrada. ${quedan} lección(es) con avance sin enviar quedan en este navegador solo para tu cuenta; se enviarán cuando vuelvas a entrar.`
    : 'Sesión cerrada.', quedan ? 'aviso' : 'ok');
});
$('#mis-cursos').addEventListener('click', async (e) => {
  const boton = e.target.closest('#btn-sincronizar');
  if (!boton) return;
  boton.disabled = true;
  try {
    const { usuario } = await api.sesion();
    await cargarCursos(usuario);
    const queda = $('.sincro') && !$('.sincro').hidden;
    estado(queda ? 'Todavía hay avance sin enviar a tu cuenta.' : 'Avance enviado a tu cuenta.', queda ? 'aviso' : 'ok');
  } catch (error) {
    boton.disabled = false;
    tratarError(error, '#estado');
  }
});
$('#catalogo').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-inscribir]')?.dataset.inscribir;
  if (!id) return;
  e.target.disabled = true;
  try {
    await api.inscribir(id);
    const { usuario } = await api.sesion();
    await cargarCursos(usuario);
    estado('Inscripción registrada.', 'ok');
  } catch (error) {
    e.target.disabled = false;
    tratarError(error, '#estado');
  }
});

(async () => {
  // Registro público: solo si el servidor lo permite explícitamente.
  try {
    const { registro_abierto: abierto } = await api.configuracion();
    $('#tab-registro').hidden = !abierto;
    $('#registro-cerrado').hidden = abierto;
  } catch {
    $('#tab-registro').hidden = true;
  }
  try {
    const { usuario } = await api.sesion();
    await cargarCursos(usuario);
  } catch (error) {
    if (error.status === 401) { mostrar('acceso'); estado(''); }
    else { mostrar(null); estado(error.message + ' Inténtalo más tarde.', 'error'); }
  }
})();
