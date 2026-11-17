// Progreso del curso en la cuenta del aula: última lección visitada, paso y retos superados.
//
// DECLARATIVO: el reto lo evalúa el navegador. El servidor guarda lo que el laboratorio declara tras superar
// su evaluador; no es una evaluación verificada por el servidor y no sirve para certificados, notas ni permisos.
//
// Separación entre estudiantes (también en un navegador compartido):
// - El avance que no se pudo enviar se guarda en una clave PROPIA de cada cuenta (huella SHA-256 del correo,
//   nunca el correo ni credenciales). Cada cuenta solo lee y envía su propia cola.
// - Antes de enviar se pregunta al servidor quién tiene la sesión: si no es la cuenta de la cola, no se envía.
// - El progreso local anterior («globalt.laboratorio.arduino.v1», sin cuenta) NUNCA se sube automáticamente.
// - Los datos se fusionan en el servidor, así que reintentar o repetir un envío no duplica ni hace retroceder nada.
export const PREFIJO = 'globalt.aula.progreso-pendiente.v1.';
const CANAL = 'globalt-aula-sesion';
const MAX_PASO = 30;
const ID = /^[a-z0-9-]{3,60}$/;

/** Huella de la cuenta para separar colas (nunca se guarda el correo). null sin correo. */
export async function claveCuenta(correo) {
  if (!correo) return null;
  const texto = 'globalt-aula:' + String(correo).trim().toLowerCase();
  if (!globalThis.crypto?.subtle) {   // contexto sin HTTPS: huella FNV-1a (solo separa colas; no es secreta)
    let h = 0xcbf29ce484222325n;
    for (const b of new TextEncoder().encode(texto)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
    return 'f' + h.toString(16).padStart(16, '0');
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const memoria = new Map();   // respaldo si el almacenamiento está bloqueado: solo dura esta página

function leer(clave) {
  if (!clave) return {};
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (crudo !== null) {
      const datos = JSON.parse(crudo);
      return datos && typeof datos === 'object' && !Array.isArray(datos) ? limpiar(datos) : {};
    }
  } catch { /* almacenamiento bloqueado o dañado: se usa la memoria de la página */ }
  return limpiar(memoria.get(clave) || {});
}

function escribir(clave, datos) {
  memoria.set(clave, datos);
  try {
    if (Object.keys(datos).length) localStorage.setItem(PREFIJO + clave, JSON.stringify(datos));
    else localStorage.removeItem(PREFIJO + clave);
    return true;
  } catch {
    return false;
  }
}

const pasoValido = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_PASO;

/** Solo lecciones y campos conocidos: lo que haya en el almacenamiento no puede inyectar otros datos. */
function limpiar(datos) {
  const fuera = {};
  for (const [id, e] of Object.entries(datos)) {
    if (!ID.test(id) || !e || typeof e !== 'object' || !pasoValido(e.paso)) continue;
    const fecha = typeof e.visto_en === 'string' && !Number.isNaN(Date.parse(e.visto_en)) ? e.visto_en : new Date().toISOString();
    fuera[id] = {
      paso: e.paso,
      vistos: [...new Set(Array.isArray(e.vistos) ? e.vistos.filter(pasoValido) : [])].sort((a, b) => a - b),
      visto_en: fecha,
      completada: e.completada === true,
      seq: Number.isInteger(e.seq) ? e.seq : 0,
    };
  }
  return fuera;
}

/** Avance pendiente de una cuenta: { leccionId: { paso, vistos, visto_en, completada, seq } }. */
export const pendientes = (clave) => leer(clave);

/**
 * Anota avance para una cuenta. «completada» solo debe pasarse como true tras superar el evaluador.
 * Una anotación nunca quita «completada» ni pasos vistos de la cola.
 */
export function anotar(clave, leccionId, { paso, vistos = [], completada = false }) {
  if (!clave || !ID.test(leccionId) || !pasoValido(paso)) return false;
  const datos = leer(clave);
  const previo = datos[leccionId];
  datos[leccionId] = {
    paso,
    vistos: [...new Set([...(previo?.vistos || []), ...vistos.filter(pasoValido), paso])].sort((a, b) => a - b),
    visto_en: new Date().toISOString(),
    completada: Boolean(previo?.completada) || completada === true,
    seq: (previo?.seq || 0) + 1,
  };
  return escribir(clave, datos);
}

/** Quita una entrada ya enviada, salvo que haya cambiado mientras se enviaba. */
function confirmar(clave, leccionId, seq) {
  const datos = leer(clave);
  if (datos[leccionId]?.seq !== seq) return;
  delete datos[leccionId];
  escribir(clave, datos);
}

/**
 * Envía la cola de UNA cuenta. api = { sesion(): Promise<{usuario}>, registrar(datos): Promise<{progreso}> }.
 * Devuelve { estado, enviados: [progreso…], mensaje? } con estado:
 *   'al-dia' | 'otra-cuenta' (la sesión es de otra persona: no se envió nada) | 'sin-sesion' | 'sin-permiso'
 *   | 'no-disponible' (la API aún no guarda progreso) | 'error' (red o servidor: reintentar)
 *   | 'pendiente' (llegaron anotaciones nuevas durante el envío: volver a llamar).
 * Las entradas no enviadas siguen en la cola.
 */
export async function enviar(clave, api) {
  const enviados = [];
  let cola = leer(clave);
  if (!clave || !Object.keys(cola).length) return { estado: 'al-dia', enviados };
  try {
    const { usuario } = await api.sesion();   // también renueva el token CSRF de esa sesión
    if ((await claveCuenta(usuario?.correo)) !== clave) return { estado: 'otra-cuenta', enviados };
  } catch (e) {
    return { ...clasificar(e), enviados };
  }
  for (let vuelta = 0; vuelta < 3 && Object.keys(cola).length; vuelta++) {
    for (const [leccionId, e] of Object.entries(cola)) {
      try {
        const { progreso } = await api.registrar({
          leccion_id: leccionId, paso: e.paso, vistos: e.vistos, visto_en: e.visto_en, completada: e.completada });
        enviados.push(progreso);
        confirmar(clave, leccionId, e.seq);
      } catch (error) {
        if (error.status === 422) { confirmar(clave, leccionId, e.seq); continue; }   // dato imposible: no bloquear la cola
        return { ...clasificar(error), enviados };
      }
    }
    cola = leer(clave);   // anotaciones nuevas llegadas durante el envío
  }
  return { estado: Object.keys(cola).length ? 'pendiente' : 'al-dia', enviados };   // 'pendiente': volver a enviar
}

function clasificar(error) {
  const s = error?.status;
  if (s === 401) return { estado: 'sin-sesion' };
  if (s === 403) return { estado: 'sin-permiso', mensaje: error.message };
  if (s === 404 || s === 405 || s === -1) return { estado: 'no-disponible' };
  return { estado: 'error', mensaje: error?.message || 'Sin conexión con el aula.' };
}

/**
 * Combina el progreso del servidor con la cola pendiente de la MISMA cuenta.
 * Devuelve Map leccionId → { estado: 'completada'|'en-curso', paso, vistos, completadaEn, pendiente, visto_en }.
 */
export function combinar(servidor, cola = {}) {
  const mapa = new Map();
  for (const l of servidor?.lecciones || []) {
    mapa.set(l.leccion_id, { estado: l.estado, paso: l.paso, vistos: l.vistos || [], completadaEn: l.completada_en,
      visto_en: l.visto_en, pendiente: false });
  }
  for (const [id, e] of Object.entries(cola)) {
    const s = mapa.get(id);
    const masNueva = !s || Date.parse(e.visto_en) >= Date.parse(s.visto_en);
    mapa.set(id, {
      estado: s?.estado === 'completada' || e.completada ? 'completada' : 'en-curso',
      paso: masNueva ? e.paso : s.paso,
      vistos: [...new Set([...(s?.vistos || []), ...e.vistos])].sort((a, b) => a - b),
      completadaEn: s?.completadaEn || (e.completada ? e.visto_en : null),
      visto_en: masNueva ? e.visto_en : s.visto_en,
      pendiente: true,
    });
  }
  return mapa;
}

/** Última lección visitada según el progreso combinado (o null). */
export function ultima(mapa) {
  let mejor = null;
  for (const [id, e] of mapa) if (!mejor || Date.parse(e.visto_en) > Date.parse(mejor.visto_en)) mejor = { id, visto_en: e.visto_en };
  return mejor?.id || null;
}

/**
 * Lección a la que lleva «Continuar»: la última visitada si no está completada; si lo está, la siguiente
 * sin completar del manifiesto (o la primera sin completar); con todo completado, la última visitada.
 */
export function continuarCon(manifiesto, mapa) {
  const ultimaId = ultima(mapa);
  if (!ultimaId || !manifiesto.some((m) => m.id === ultimaId)) {
    return (manifiesto.find((m) => mapa.get(m.id)?.estado !== 'completada') || manifiesto[0]).id;
  }
  if (mapa.get(ultimaId)?.estado !== 'completada') return ultimaId;
  const i = manifiesto.findIndex((m) => m.id === ultimaId);
  const orden = [...manifiesto.slice(i + 1), ...manifiesto.slice(0, i)];
  return (orden.find((m) => mapa.get(m.id)?.estado !== 'completada') || manifiesto[i]).id;
}

/** Aviso entre pestañas del mismo navegador cuando la sesión del aula se cierra o cambia de cuenta. */
export function avisarSesion(tipo) {
  try { const c = new BroadcastChannel(CANAL); c.postMessage({ tipo }); c.close(); } catch { /* sin soporte */ }
}
export function escucharSesion(funcion) {
  try { new BroadcastChannel(CANAL).onmessage = (e) => funcion(e.data?.tipo); } catch { /* sin soporte */ }
}
