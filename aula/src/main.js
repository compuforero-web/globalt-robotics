// Aula GLOBALT: registro de adultos (edad, documentos, enlace por correo), acceso, recuperación de contraseña,
// cierre de sesión, «Mis cursos» y progreso. El curso elegido (?curso=) se conserva en todo el recorrido.
// Los tokens de los enlaces llegan en el fragmento (#verificar=… / #restablecer=…): se leen, se quitan de la barra
// y del historial y solo se envían en el cuerpo de una petición POST.
// El aula no guarda credenciales en el navegador. El progreso se lee de la cuenta; si el laboratorio dejó avance
// pendiente para la cuenta con sesión (módulo progreso-cuenta.js del laboratorio), se envía y se borra al confirmarse.
// El progreso es DECLARATIVO: el reto se evalúa en el navegador; no es un resultado verificado por el servidor.
import { tienePanel, panelPracticas, enviarPendientesPracticas, pendientesPracticas } from './progreso-practicas.js';
import * as api from './api.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vistas = { acceso: $('#vista-acceso'), cursos: $('#vista-cursos'), correo: $('#vista-correo'),
  enlace: $('#vista-enlace'), autorizacion: $('#vista-autorizacion') };
const cursoElegido = new URLSearchParams(location.search).get('curso');
const cursoValido = /^[a-z0-9-]{3,60}$/.test(cursoElegido || '') ? cursoElegido : null;
function leerEnlace() {
  const fragmento = new URLSearchParams(location.hash.slice(1));
  const enlace = ['verificar', 'restablecer'].map((accion) => ({ accion, token: fragmento.get(accion) })).find((e) => e.token) || null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);   // el token no queda a la vista
  return enlace;
}
let enlaceCorreo = leerEnlace();
// Otro enlace abierto en esta misma pestaña (solo cambia el fragmento): se atiende sin recargar.
addEventListener('hashchange', () => { const nuevo = leerEnlace(); if (nuevo) { enlaceCorreo = nuevo; mostrarEnlace(); } });
let ajustes = { registro_abierto: false, recuperacion: false, documentos: {} };
let correoPendiente = '';
let pendientesActuales = [];
const laboratorios = new Map();
function indicarCurso(curso, inscrito = false) {
  const aviso = $('#eleccion');
  aviso.hidden = !cursoElegido;
  aviso.textContent = curso ? (inscrito ? 'Ya estás inscrito en ' : 'Curso elegido: ') + curso.titulo
    : 'Este curso no está disponible. Puedes elegir otro en el catálogo del Aula.';
}
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
  ocultarClaves();
  const registro = cual === 'registro';
  $('#form-entrar').hidden = cual !== 'entrar';
  $('#form-recuperar').hidden = cual !== 'recuperar';
  $('#panel-registro').hidden = !registro;
  $('#tab-entrar').setAttribute('aria-selected', String(!registro));
  $('#tab-registro').setAttribute('aria-selected', String(registro));
  $('#error-form').textContent = '';
  if (registro) pasoEdad('pregunta');
}

// Registro en dos pasos: primero la edad. Quien indica ser menor vuelve a la práctica sin cuenta sin haber
// escrito ni enviado ningún dato (este paso no hace ninguna petición).
function pasoEdad(paso) {
  $('#paso-edad').hidden = paso !== 'pregunta';
  $('#aviso-menor').hidden = paso !== 'menor';
  $('#form-registro').hidden = paso !== 'adulto';
  if (paso !== 'adulto') $('#form-registro').reset();
  $('#error-form').textContent = '';
}

const enlaceDocumento = (doc) => `documento.html?tipo=${encodeURIComponent(doc.tipo)}&version=${encodeURIComponent(doc.version)}`
  + (cursoValido ? '&curso=' + encodeURIComponent(cursoValido) : '');

function aplicarAjustes() {
  const docs = ajustes.documentos || {};
  $('#tab-registro').hidden = !ajustes.registro_abierto;
  $('#registro-cerrado').hidden = ajustes.registro_abierto;
  $('#btn-olvido').hidden = !ajustes.recuperacion;
  for (const tipo of ['terminos', 'datos', 'politica']) {
    const doc = docs[tipo];
    if (!doc) continue;
    $('#doc-' + tipo).href = enlaceDocumento(doc);
    $(`[data-version="${tipo}"]`).textContent = `(versión ${doc.version})`;
  }
  if (docs.datos) $('[data-finalidad="datos"]').textContent = 'Finalidad: ' + docs.datos.finalidad;
  $('#aviso-textos-prueba').hidden = !Object.values(docs).some((d) => d.prueba);
}

async function prepararInvitado(cursos) {
  const curso = cursos?.find((c) => c.id === cursoElegido);
  const destino = curso?.laboratorio && await comprobarLaboratorio(curso.laboratorio) ? '../' + curso.laboratorio : '../index.html#cursos';
  for (const boton of [$('#btn-invitado'), $('#btn-invitado-menor')]) boton.href = destino;
}

/** Tras iniciar sesión (contraseña, enlace del correo o recuperación): documentos pendientes o «Mis cursos». */
async function entrarCon(respuesta, { avisar = true } = {}) {
  if (avisar) {
    const mods = await cargarModulosLab();
    if (mods) mods.pc.avisarSesion('sesion-iniciada');   // otra cuenta pudo entrar en este navegador
  }
  if (respuesta.pendientes?.length) mostrarAutorizacion(respuesta.usuario, respuesta.pendientes);
  else await cargarCursos(respuesta.usuario);
}

function mostrarAutorizacion(usuario, pendientes) {
  usuarioActual = usuario;
  pendientesActuales = pendientes;
  mostrar('autorizacion', usuario);
  estado('');
  $('#error-autorizacion').textContent = '';
  $('#aviso-textos-prueba-2').hidden = !pendientes.some((d) => d.prueba);
  // La política completa se acepta con la casilla de datos; solo tiene casilla propia si es lo único pendiente de datos.
  const politica = pendientes.find((d) => d.tipo === 'politica');
  const conDatos = politica && pendientes.some((d) => d.tipo === 'datos');
  const enlace = (d) => `<a href="${esc(enlaceDocumento(d))}" target="_blank" rel="noopener">${esc(d.titulo)}</a> <small>(versión ${esc(d.version)})</small>`;
  const texto = (d) => ({ terminos: `He leído y acepto los ${enlace(d)}.`,
    datos: `Autorizo el tratamiento de mis datos personales según la ${enlace(d)}${conDatos ? ` y la ${enlace(politica)}, que he leído` : ''}.`,
    politica: `He leído la ${enlace(d)}.` })[d.tipo];
  $('#lista-autorizacion').innerHTML = pendientes.filter((d) => !(conDatos && d === politica)).map((d) => `<label class="check"><input type="checkbox" name="${esc(d.tipo)}" required>
    <span>${texto(d)}
    <small class="finalidad">Finalidad: ${esc(d.finalidad)}</small></span></label>`).join('');
}

function mostrarEnlace() {
  const verificar = enlaceCorreo.accion === 'verificar';
  mostrar('enlace');
  estado('');
  const f = $('#form-enlace');
  f.hidden = false;
  f.reset();
  $('#titulo-enlace').textContent = verificar ? 'Confirma tu correo' : 'Elige una contraseña nueva';
  $('#texto-enlace').textContent = verificar
    ? 'Escribe la contraseña que elegiste al crear la cuenta. Así terminamos de crearla y entras al Aula.'
    : 'Mínimo 10 caracteres. Al guardarla se cerrarán las demás sesiones abiertas de tu cuenta.';
  $('#etq-clave').textContent = verificar ? 'Contraseña' : 'Contraseña nueva';
  f.clave.autocomplete = verificar ? 'current-password' : 'new-password';
  f.clave.minLength = verificar ? 1 : 10;
  $('#etq-clave2').hidden = verificar;
  f.clave2.required = !verificar;
  $('#btn-enlace').textContent = verificar ? 'Confirmar y entrar' : 'Guardar y entrar';
  $('#error-enlace').textContent = '';
}

// El laboratorio llega con la PR #1; solo se enlaza si el archivo existe en este servidor.
async function comprobarLaboratorio(ruta) {
  if (laboratorios.has(ruta)) return laboratorios.get(ruta);
  try {
    const r = await fetch('../' + ruta, { method: 'HEAD', cache: 'no-store' });
    const disponible = r.ok && (r.headers.get('content-type') || '').includes('text/html');
    if (disponible) laboratorios.set(ruta, true);
    return disponible;
  } catch {
    return false;
  }

}

async function tarjetaCurso(curso) {
  const lab = curso.laboratorio && await comprobarLaboratorio(curso.laboratorio);
  const acceso = lab
    ? `<a class="btn btn--primary btn--sm" href="../${esc(curso.laboratorio)}">Abrir laboratorio</a>`
    : '<span class="muted">Inscripción registrada.</span>';
  return `<article class="curso"><h3>${esc(curso.titulo)}</h3>
    <p class="muted">Inscrito el ${esc(new Date(curso.inscrito_en).toLocaleDateString('es-CO', { dateStyle: 'long' }))}</p>${acceso}</article>`;
}

/** Panel de las lecciones del manifiesto con su estado y «Continuar». Solo con laboratorio publicado y API con progreso. */
async function panelProgreso(curso, clave) {
  if (curso.id !== 'course-arduino') return null;
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
  const tarjetas = await Promise.all(mios.map(async curso => {
    if (tienePanel(curso)) return panelPracticas(curso);
    const plantilla = document.createElement('template');
    plantilla.innerHTML = (await panelProgreso(curso, clave)) || await tarjetaCurso(curso);
    return plantilla.content;
  }));
  if (usuarioActual !== usuario) return;
  $('#mis-cursos').replaceChildren(...tarjetas);
  if (!tarjetas.length) $('#mis-cursos').textContent = 'Todavía no te has inscrito en ningún curso.';
  indicarCurso(todos.find(c => c.id === cursoElegido), inscritos.has(cursoElegido));
  if (envio && envio.estado !== 'al-dia' && $('#sincro-texto')) {
    const motivo = { 'otra-cuenta': 'La sesión cambió: no se envió nada.', 'no-disponible': 'Este servidor aún no guarda el progreso.' }[envio.estado]
      || 'No se pudo enviar ahora; pulsa Reintentar.';
    $('#sincro-texto').textContent += ' ' + motivo;
  }
  const libres = todos.filter((c) => !inscritos.has(c.id)).sort((a,b) => Number(b.id === cursoElegido) - Number(a.id === cursoElegido));
  $('#catalogo').innerHTML = libres.length
    ? libres.map((c) => `<article class="curso"><h3>${esc(c.titulo)}</h3>
        <button type="button" class="btn btn--orange btn--sm" data-inscribir="${esc(c.id)}">${c.id === cursoElegido ? 'Confirmar inscripción' : 'Inscribirme'}</button></article>`).join('')
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
  if (error.status === 403 && /documentos vigentes/.test(error.message)) {   // cambió la versión durante la sesión
    api.sesion().then((r) => mostrarAutorizacion(r.usuario, r.pendientes)).catch(() => {});
    return;
  }
  $(destino).textContent = error.message;
}

async function enviar(formulario, accion) {
  const boton = formulario.querySelector('button[type="submit"]');
  $('#error-form').textContent = '';
  if (!formulario.checkValidity()) { formulario.reportValidity(); return; }
  boton.disabled = true;
  try {
    const respuesta = await accion(new FormData(formulario));
    formulario.reset();
    await entrarCon(respuesta);
  } catch (error) {
    // En el formulario, un 401 significa credenciales incorrectas, no sesión caducada.
    if (error.status === 0) estado(error.message, 'error');
    else $('#error-form').textContent = error.status === 401 && ajustes.registro_abierto
      ? error.message + ' Si acabas de crear la cuenta, primero abre el enlace que te enviamos por correo.' : error.message;
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
$('#btn-adulto').addEventListener('click', () => { pasoEdad('adulto'); $('#form-registro [name=nombre]').focus(); });
$('#btn-menor').addEventListener('click', () => pasoEdad('menor'));
document.querySelectorAll('[data-edad-volver]').forEach((b) => b.addEventListener('click', () => pasoEdad('pregunta')));
document.querySelectorAll('[data-ir-acceso]').forEach((b) => b.addEventListener('click', () => {
  enlaceCorreo = null;
  mostrar('acceso');
  pestana('entrar');
  estado('');
}));
$('#btn-olvido').addEventListener('click', () => {
  pestana('recuperar');
  $('#form-recuperar [name=correo]').value = $('#form-entrar [name=correo]').value;
});
$('#form-recuperar [data-volver]').addEventListener('click', () => pestana('entrar'));

async function conBoton(formulario, destinoError, accion) {
  const boton = formulario.querySelector('button[type="submit"]');
  $(destinoError).textContent = '';
  if (!formulario.checkValidity()) { formulario.reportValidity(); return; }
  boton.disabled = true;
  try {
    await accion(new FormData(formulario));
  } catch (error) {
    if (error.status === 0) estado(error.message, 'error');
    else $(destinoError).textContent = error.message;
  } finally {
    boton.disabled = false;
  }
}

// Se activó otra versión con el formulario abierto: se enlaza la nueva y se desmarcan sus casillas, para que se lea y
// se acepte antes de continuar. Los demás campos se conservan.
async function documentosCambiados(formulario, previos) {
  try { ajustes = await api.configuracion(); } catch { return; }
  aplicarAjustes();
  const nuevos = ajustes.documentos || {};
  const cambio = (t) => nuevos[t]?.version !== previos[t]?.version;
  if (cambio('terminos')) formulario.terminos.checked = false;
  if (cambio('datos') || cambio('politica')) formulario.datos.checked = false;
}

const formularioRegistro = $('#form-registro');
const verClaves = $('#ver-claves');
let temporizadorClaves;

function ocultarClaves() {
  clearTimeout(temporizadorClaves);
  formularioRegistro.clave.type = formularioRegistro.confirmacion.type = 'password';
  verClaves.textContent = 'Mostrar contraseñas durante 5 segundos';
}

verClaves.addEventListener('click', () => {
  if (formularioRegistro.clave.type === 'text') return ocultarClaves();
  formularioRegistro.clave.type = formularioRegistro.confirmacion.type = 'text';
  verClaves.textContent = 'Ocultar contraseñas';
  temporizadorClaves = setTimeout(ocultarClaves, 5000);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) ocultarClaves(); });
window.addEventListener('pagehide', ocultarClaves);
function validarConfirmacion() {
  const campo = formularioRegistro.confirmacion;
  campo.setCustomValidity(campo.value && campo.value !== formularioRegistro.clave.value
    ? 'Las contraseñas no coinciden. Revisa la confirmación.' : '');
}
formularioRegistro.addEventListener('input', validarConfirmacion);
formularioRegistro.addEventListener('reset', () => {
  ocultarClaves();
  formularioRegistro.confirmacion.setCustomValidity('');
});
formularioRegistro.addEventListener('submit', (e) => {
  e.preventDefault();
  ocultarClaves();
  validarConfirmacion();
  conBoton(e.target, '#error-form', async (d) => {
    const docs = ajustes.documentos;
    if (!docs.terminos || !docs.datos || !docs.politica) throw new api.ApiError(409, 'Faltan los documentos. Recarga la página.');
    const correo = d.get('correo').trim();
    let r;
    try {
      r = await api.registrar({ nombre: d.get('nombre').trim(), correo, clave: d.get('clave'), mayor_de_edad: true,
        terminos: docs.terminos.version, datos: docs.datos.version, politica: docs.politica.version,
        ...(cursoValido ? { curso: cursoValido } : {}) });
    } catch (error) {
      if (error.status === 409) await documentosCambiados(e.target, docs);
      throw error;
    }
    correoPendiente = correo;
    e.target.reset();
    pasoEdad('pregunta');
    mostrar('correo');
    estado('');
    $('#correo-mensaje').textContent = r.mensaje;
  });
});
$('#form-recuperar').addEventListener('submit', (e) => {
  e.preventDefault();
  conBoton(e.target, '#error-form', async (d) => {
    const r = await api.recuperar(d.get('correo').trim(), cursoValido);
    e.target.reset();
    pestana('entrar');
    estado(r.mensaje, 'ok');
  });
});
$('#btn-reenviar').addEventListener('click', async () => {
  const boton = $('#btn-reenviar');
  boton.disabled = true;
  try {
    await api.reenviar(correoPendiente);
    estado('Si había una solicitud pendiente, te enviamos un enlace nuevo. El anterior ya no sirve.', 'ok');
  } catch (error) {
    estado(error.message, 'error');
  }
  setTimeout(() => { boton.disabled = false; }, 30000);   // evita reenvíos seguidos (el servidor también limita)
});
$('#form-enlace').addEventListener('submit', (e) => {
  e.preventDefault();
  conBoton(e.target, '#error-enlace', async (d) => {
    const verificar = enlaceCorreo.accion === 'verificar';
    if (!verificar && d.get('clave') !== d.get('clave2')) throw new api.ApiError(422, 'Las contraseñas no coinciden.');
    let r;
    try {
      r = await (verificar ? api.verificar : api.restablecer)(enlaceCorreo.token, d.get('clave'));
    } catch (error) {
      if (error.status === 410 || error.status === 409) { e.target.hidden = true; enlaceCorreo = null; }
      throw error;
    }
    enlaceCorreo = null;
    e.target.reset();
    await entrarCon(r);
    estado(verificar ? 'Correo confirmado. Tu cuenta está lista.' : 'Contraseña actualizada.', 'ok');
  });
});
$('#form-autorizacion').addEventListener('submit', (e) => {
  e.preventDefault();
  conBoton(e.target, '#error-autorizacion', async () => {
    const versiones = Object.fromEntries(pendientesActuales.map((d) => [d.tipo, d.version]));
    let r;
    try {
      r = await api.autorizar(versiones);
    } catch (error) {
      if (error.status !== 409) throw error;
      // Se activó otra versión mientras se leía: se muestran las vigentes, sin marcar, para leerlas y aceptarlas.
      const actual = await api.sesion();
      mostrarAutorizacion(actual.usuario, actual.pendientes);
      throw new api.ApiError(409, 'Se publicó una versión nueva de los documentos. Léela y marca de nuevo las casillas para continuar.');
    }
    if (r.pendientes.length) { mostrarAutorizacion(usuarioActual, r.pendientes); return; }
    await cargarCursos(usuarioActual);
    estado('Gracias. Ya puedes seguir con tus cursos.', 'ok');
  });
});

async function salirDeCuenta(boton) {
  boton.disabled = true;
  // Último intento de enviar el avance pendiente de ESTA cuenta (máx. 5 s); lo que no salga queda en su cola.
  const usuario = usuarioActual;
  const clave = await claveDe(usuario);
  await Promise.race([Promise.allSettled([enviarPendiente(clave), enviarPendientesPracticas()]), new Promise((r) => setTimeout(r, 5000))]);
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
  $('#eleccion').hidden = true;
  pestana('entrar');
  const quedan = (mods && clave ? Object.keys(mods.pc.pendientes(clave)).length : 0)
    + await pendientesPracticas(usuario).catch(() => 0);
  estado(quedan ? `Sesión cerrada. ${quedan} lección(es) con avance sin enviar quedan en este navegador solo para tu cuenta; se enviarán cuando vuelvas a entrar.`
    : 'Sesión cerrada.', quedan ? 'aviso' : 'ok');
}
$('#btn-salir').addEventListener('click', () => salirDeCuenta($('#btn-salir')));
$('#btn-salir-autorizacion').addEventListener('click', () => salirDeCuenta($('#btn-salir-autorizacion')));
$('#mis-cursos').addEventListener('click', async (e) => {
  const boton = e.target.closest('#btn-sincronizar');
  if (!boton) return;
  boton.disabled = true;
  try {
    const { usuario } = await api.sesion();
    await cargarCursos(usuario);
    const queda = $('#sincro-texto') && !$('#sincro-texto').parentElement.hidden;
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
  let cursos = null;
  try { ({ cursos } = await api.catalogo()); } catch { /* sin catálogo: la práctica sin cuenta lleva a la portada */ }
  if (cursoElegido) {
    if (cursos) indicarCurso(cursos.find((c) => c.id === cursoElegido));
    else $('#eleccion').hidden = true;
  }
  prepararInvitado(cursos);
  // Registro público: solo si el servidor lo permite (decisión explícita, correo y documentos vigentes).
  try {
    ajustes = await api.configuracion();
  } catch { /* se queda cerrado */ }
  aplicarAjustes();
  if (ajustes.registro_abierto && cursoElegido) pestana('registro');
  if (enlaceCorreo) { mostrarEnlace(); return; }   // enlace del correo: primero se completa (aunque haya otra sesión)
  try {
    await entrarCon(await api.sesion(), { avisar: false });
  } catch (error) {
    if (error.status === 401) { mostrar('acceso'); estado(''); }
    else { mostrar(null); estado(error.message + ' Inténtalo más tarde.', 'error'); }
  }
})();
