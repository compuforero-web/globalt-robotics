// Aula GLOBALT: registro, acceso, cierre de sesión y «Mis cursos». No guarda nada en el almacenamiento del navegador.
import * as api from './api.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vistas = { acceso: $('#vista-acceso'), cursos: $('#vista-cursos') };
let laboratorioDisponible = null;

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

async function cargarCursos(usuario) {
  mostrar('cursos', usuario);
  estado('Cargando tus cursos…');
  const [{ cursos: mios }, { cursos: todos }] = await Promise.all([api.misCursos(), api.catalogo()]);
  const inscritos = new Set(mios.map((c) => c.id));
  $('#mis-cursos').innerHTML = mios.length
    ? (await Promise.all(mios.map(tarjetaCurso))).join('')
    : '<p class="muted">Todavía no te has inscrito en ningún curso.</p>';
  const libres = todos.filter((c) => !inscritos.has(c.id));
  $('#catalogo').innerHTML = libres.length
    ? libres.map((c) => `<article class="curso"><h3>${esc(c.titulo)}</h3>
        <button type="button" class="btn btn--orange btn--sm" data-inscribir="${esc(c.id)}">Inscribirme</button></article>`).join('')
    : '<p class="muted">Ya estás inscrito en todos los cursos disponibles.</p>';
  estado('');
}

function tratarError(error, destino) {
  if (error.status === 401) { api.olvidarCsrf(); mostrar('acceso'); estado('Tu sesión terminó. Inicia sesión de nuevo.', 'aviso'); return; }
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
  try { await api.salir(); } catch (error) { if (error.status !== 401) { estado(error.message, 'error'); return; } }
  mostrar('acceso');
  pestana('entrar');
  estado('Sesión cerrada.', 'ok');
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
  try {
    const { usuario } = await api.sesion();
    await cargarCursos(usuario);
  } catch (error) {
    if (error.status === 401) { mostrar('acceso'); estado(''); }
    else { mostrar(null); estado(error.message + ' Inténtalo más tarde.', 'error'); }
  }
})();
