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
// Registro de adultos: solo envía la solicitud; la cuenta se crea al abrir el enlace del correo (verificar).
export const registrar = (datos) => llamar('/registro', { metodo: 'POST', datos });
export const reenviar = (correo) => llamar('/cuenta/reenviar', { metodo: 'POST', datos: { correo } });
export const recuperar = (correo, curso) => llamar('/cuenta/recuperar', { metodo: 'POST', datos: curso ? { correo, curso } : { correo } });
export const verificar = (token, clave) => llamar('/cuenta/verificar', { metodo: 'POST', datos: { token, clave } });
export const restablecer = (token, clave) => llamar('/cuenta/restablecer', { metodo: 'POST', datos: { token, clave } });
export const autorizar = (versiones) => llamar('/cuenta/autorizar', { metodo: 'POST', datos: versiones });
export const documento = (tipo, version) => llamar(`/documentos/${encodeURIComponent(tipo)}/${encodeURIComponent(version)}`);
export async function salir() { await llamar('/sesion', { metodo: 'DELETE' }); csrf = ''; }
export const catalogo = () => llamar('/cursos');
export const configuracion = () => llamar('/config');
export const misCursos = () => llamar('/mis-cursos');
export const inscribir = (cursoId) => llamar('/inscripciones', { metodo: 'POST', datos: { curso_id: cursoId } });
export const registrarProgreso = (datos) => llamar('/mis-cursos', { metodo: 'POST', datos });
export function olvidarCsrf() { csrf = ''; }
export const seguimiento = (ruta = '', opciones) => llamar('/familias' + ruta, opciones);
