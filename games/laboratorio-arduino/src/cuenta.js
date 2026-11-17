// Copia del borrador en la cuenta del aula (/api/aula, mismo origen). La sesión vive en una cookie
// HttpOnly y la identidad la decide el servidor; aquí solo se guarda el token CSRF en memoria.
// Si el aula no existe en este sitio, el laboratorio sigue solo con el guardado local.
const BASE = '/api/aula';
const MAX_BYTES = 16 * 1024;   // límite de cuerpo de la API y del proxy
export const MAX_CARACTERES = 12000;
let csrf = '';

export class CuentaError extends Error {
  constructor(status, message, borrador = null) { super(message); this.status = status; this.borrador = borrador; }
}

async function llamar(ruta, { metodo = 'GET', datos } = {}) {
  const cabeceras = { Accept: 'application/json' };
  let cuerpo;
  if (datos !== undefined) {
    cuerpo = JSON.stringify(datos);
    if (new Blob([cuerpo]).size > MAX_BYTES) {
      throw new CuentaError(413, 'Tu programa es demasiado largo para guardarlo en la cuenta; sigue guardado en este navegador.');
    }
    cabeceras['Content-Type'] = 'application/json';
  }
  if (metodo !== 'GET' && csrf) cabeceras['X-CSRF-Token'] = csrf;
  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, body: cuerpo, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new CuentaError(0, 'Sin conexión con el aula.');
  }
  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) throw new CuentaError(-1, 'El aula no está disponible en este sitio.');
  let json = {};
  try { json = await respuesta.json(); } catch { throw new CuentaError(0, 'Respuesta no válida del aula.'); }
  if (!respuesta.ok) throw new CuentaError(respuesta.status, json.detail || `Error ${respuesta.status}`, json.borrador || null);
  if (json.csrf) csrf = json.csrf;
  return json;
}

/** Token CSRF de la sesión actual (solo en memoria), para compilar a través del aula. */
export const tokenCsrf = () => csrf;

const ruta = (leccionId) => `/borradores/${encodeURIComponent(leccionId)}`;

/**
 * Comprueba la sesión y lee el borrador. Devuelve { estado, borrador?, mensaje? } con estado:
 * 'sin-aula' (no hay API aquí), 'sin-sesion', 'sin-inscripcion', 'no-disponible' (la API aún no admite esta
 * lección: solo guardado local), 'error' (reintentar) o 'lista'.
 */
export async function conectar(leccionId) {
  let usuario;
  try {
    ({ usuario } = await llamar('/sesion'));
  } catch (e) {
    if (e.status === 401) return { estado: 'sin-sesion' };
    if (e.status === -1 || e.status === 404) return { estado: 'sin-aula' };   // el aula no está publicada aquí
    return { estado: 'error', mensaje: e.message };
  }
  try {
    const { borrador } = await llamar(ruta(leccionId));
    return { estado: 'lista', borrador, usuario };
  } catch (e) {
    if (e.status === 403) return { estado: 'sin-inscripcion', mensaje: e.message };
    if (e.status === 401) return { estado: 'sin-sesion' };
    // La API responde 404 «Lección no disponible» si aún no admite esta lección (JSON: el aula sí existe).
    if (e.status === 404) return { estado: 'no-disponible' };
    return { estado: 'error', mensaje: e.message };
  }
}

/** Guarda el código. versionBase = versión de la cuenta que conoce este navegador (null si no hay copia). */
export async function guardar(leccionId, codigo, versionBase) {
  const { borrador } = await llamar(ruta(leccionId), { metodo: 'PUT', datos: { codigo, version_base: versionBase } });
  return borrador;
}

// ---------- Progreso del curso (declarativo; ver progreso-cuenta.js) ----------
/** Sesión actual ({ usuario }); renueva el token CSRF en memoria. */
export const sesion = () => llamar('/sesion');

/**
 * Progreso del curso en la cuenta. Devuelve el objeto «progreso» del curso, o null si la API de este servidor
 * todavía no lo ofrece (versión anterior): en ese caso el laboratorio sigue con el registro de este navegador.
 */
export async function progresoCurso(cursoId = 'course-arduino') {
  const { cursos } = await llamar('/mis-cursos');
  const curso = (cursos || []).find((c) => c.id === cursoId);
  if (!curso) throw new CuentaError(403, 'Inscríbete en el curso desde el aula.');
  return curso.progreso && Array.isArray(curso.progreso.lecciones) ? curso.progreso : null;
}

/** Registra avance de una lección (la identidad la decide la sesión del servidor). */
export const registrarProgreso = (datos) => llamar('/mis-cursos', { metodo: 'POST', datos });
