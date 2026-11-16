// Cliente de /api/aula. La sesión vive en una cookie HttpOnly; el token CSRF solo en memoria.
const BASE = '/api/aula';
let csrf = '';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function llamar(ruta, { metodo = 'GET', datos } = {}) {
  const cabeceras = { Accept: 'application/json' };
  if (datos !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (metodo !== 'GET' && csrf) cabeceras['X-CSRF-Token'] = csrf;
  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo, headers: cabeceras, credentials: 'same-origin', cache: 'no-store',
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el aula.');
  }
  if (respuesta.status === 204) return null;
  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) throw new ApiError(0, 'El servicio del aula no está disponible.');
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new ApiError(respuesta.status, cuerpo.detail || `Error ${respuesta.status}`);
  if (cuerpo.csrf) csrf = cuerpo.csrf;
  return cuerpo;
}

export const sesion = () => llamar('/sesion');
export const entrar = (correo, clave) => llamar('/sesion', { metodo: 'POST', datos: { correo, clave } });
export const registrar = (nombre, correo, clave) => llamar('/registro', { metodo: 'POST', datos: { nombre, correo, clave } });
export async function salir() { await llamar('/sesion', { metodo: 'DELETE' }); csrf = ''; }
export const catalogo = () => llamar('/cursos');
export const configuracion = () => llamar('/config');
export const misCursos = () => llamar('/mis-cursos');
export const inscribir = (cursoId) => llamar('/inscripciones', { metodo: 'POST', datos: { curso_id: cursoId } });
export function olvidarCsrf() { csrf = ''; }
