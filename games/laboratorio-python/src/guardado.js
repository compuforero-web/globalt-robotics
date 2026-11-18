// Borradores del Laboratorio Python: SOLO en el almacenamiento de este navegador (localStorage), separados por
// práctica. No se envían a ningún servidor ni a la cuenta del aula. Otro navegador o el modo privado no los ven.
// Invitado: 'globalt.laboratorio.python.v1' (como siempre). Con cuenta del aula: un espacio propio de esa cuenta
// (configurar), para que en un equipo compartido cada estudiante vea solo sus borradores.
export const CLAVE_INVITADO = 'globalt.laboratorio.python.v1';
let CLAVE = CLAVE_INVITADO;

/** Espacio de borradores: '' (invitado) o el sufijo de la cuenta (progreso-cuenta.js → espacioBorradores). */
export function configurar(espacio = '') { CLAVE = CLAVE_INVITADO + espacio; }

/** Borrador de invitado de una práctica (solo lectura; para ofrecer copiar el código a la cuenta). */
export function leerInvitado(id) {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_INVITADO) || '{}')?.practicas?.[id];
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}
const MAX = 32 * 1024;   // caracteres por archivo

function leerTodo() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    return datos && typeof datos === 'object' && datos.practicas && typeof datos.practicas === 'object' ? datos : { practicas: {} };
  } catch {
    return { practicas: {} };
  }
}

function escribirTodo(datos) {
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); return true; } catch { return false; }
}

/** Borrador de una práctica: { archivos: {nombre: texto}, entrada, guardado_en, superado_en } (vacío si no hay). */
export function leer(id) {
  const p = leerTodo().practicas[id];
  return p && typeof p === 'object' ? p : {};
}

function actualizar(id, cambios) {
  const datos = leerTodo();
  datos.practicas[id] = { ...leer(id), ...cambios };
  return escribirTodo(datos);
}

/** Guarda los archivos editables y la entrada. Devuelve false si el navegador no permite guardar. */
export function guardar(id, archivos, entrada) {
  const limpios = {};
  for (const [n, t] of Object.entries(archivos)) limpios[n] = String(t).slice(0, MAX);
  return actualizar(id, { archivos: limpios, entrada: String(entrada).slice(0, 4000), guardado_en: new Date().toISOString() });
}

/** Restaura el código inicial: borra el borrador pero conserva el registro de reto superado. */
export function borrar(id) {
  const { superado_en } = leer(id);
  const datos = leerTodo();
  if (superado_en) datos.practicas[id] = { superado_en }; else delete datos.practicas[id];
  return escribirTodo(datos);
}

export function marcarSuperado(id) {
  return actualizar(id, { superado_en: leer(id).superado_en || new Date().toISOString() });
}

export const superado = (id) => Boolean(leer(id).superado_en);
