// Progreso en la cuenta del aula para las prácticas de Desarrollo Web (course-web) y Python desde Cero
// (course-python). Lo usan los dos laboratorios y, cargado bajo demanda, el panel del aula
// (aula/src/progreso-practicas.js). Sigue el diseño del progreso de Arduino (docs/AULA_PROGRESO.md).
//
// DECLARATIVO: el reto lo evalúa el navegador; el servidor guarda lo que el laboratorio declara tras superar
// su evaluador. No es una evaluación verificada por el servidor: no sirve para certificados, notas ni permisos.
//
// Borrador local ≠ avance sincronizado:
// - El CÓDIGO de cada práctica (borrador) se guarda SOLO en este navegador. Con cuenta, en un espacio propio de
//   esa cuenta (espacioBorradores); sin cuenta, en el espacio de invitado de siempre.
// - El AVANCE (visita y reto superado) se envía a la cuenta. Lo que no se pudo enviar espera en una cola PROPIA
//   de la cuenta (huella del correo, nunca el correo ni credenciales) y se reintenta.
// - El historial de invitado (borradores y retos marcados sin cuenta) NUNCA se sube ni se atribuye a una cuenta.
// - Antes de enviar se pregunta al servidor quién tiene la sesión: si es otra cuenta, no se envía nada.
// - El servidor fusiona los datos: reintentar o repetir un envío no duplica ni hace retroceder nada.

export const CURSOS = {
  'course-web': {
    titulo: 'Desarrollo Web', unidad: 'práctica', ruta: 'games/laboratorio-web/index.html',
    // id = identificador de la API («web-» + identificador del taller en lessons.js)
    practicas: [
      { local: 'estructura', id: 'web-estructura', corto: 'Estructura HTML' },
      { local: 'rejilla', id: 'web-rejilla', corto: 'Diseño con CSS' },
      { local: 'adaptable', id: 'web-adaptable', corto: 'Diseño adaptable' },
      { local: 'eventos', id: 'web-eventos', corto: 'Eventos y DOM' },
      { local: 'publicacion', id: 'web-publicacion', corto: 'Proyecto y publicación' },
    ],
    enlace: (p) => `games/laboratorio-web/index.html#${p.local}`,
  },
  'course-python': {
    titulo: 'Python desde Cero', unidad: 'práctica', ruta: 'games/laboratorio-python/index.html',
    practicas: [
      { local: 'python-variables', id: 'python-variables', corto: 'Variables y operadores' },
      { local: 'python-condicionales', id: 'python-condicionales', corto: 'Condicionales y ciclos' },
      { local: 'python-funciones', id: 'python-funciones', corto: 'Funciones y listas' },
      { local: 'python-archivos', id: 'python-archivos', corto: 'Archivos y módulos' },
      { local: 'python-asistente', id: 'python-asistente', corto: 'Asistente de consola' },
    ],
    enlace: (p) => `games/laboratorio-python/index.html?practica=${encodeURIComponent(p.id)}`,
  },
};
for (const curso of Object.values(CURSOS)) curso.practicas.forEach((p, i) => { p.numero = i + 1; });

/** Práctica del curso por identificador local o de la API (o undefined). */
export const practica = (cursoId, id) => CURSOS[cursoId]?.practicas.find((p) => p.local === id || p.id === id);

/** URL absoluta de una práctica (no depende de la página que la pida). */
export const urlPractica = (cursoId, p) => new URL('../../' + CURSOS[cursoId].enlace(p), import.meta.url).href;

// ---------- Cliente mínimo de /api/aula (sesión en cookie HttpOnly; CSRF solo en memoria) ----------
const BASE = '/api/aula';
const ESPERA_MS = 8000;
let csrf = '';

export class CuentaError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function llamar(ruta, { metodo = 'GET', datos } = {}) {
  const cabeceras = { Accept: 'application/json' };
  if (datos !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (metodo !== 'GET' && csrf) cabeceras['X-CSRF-Token'] = csrf;
  const control = typeof AbortController === 'function' ? new AbortController() : null;
  const reloj = control && setTimeout(() => control.abort(), ESPERA_MS);
  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, credentials: 'same-origin', cache: 'no-store',
      body: datos === undefined ? undefined : JSON.stringify(datos), signal: control?.signal });
  } catch {
    throw new CuentaError(0, 'Sin conexión con el aula.');
  } finally {
    clearTimeout(reloj);
  }
  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) throw new CuentaError(-1, 'El aula no está disponible en este sitio.');
  let json;
  try { json = await respuesta.json(); } catch { throw new CuentaError(0, 'Respuesta no válida del aula.'); }
  if (!respuesta.ok) throw new CuentaError(respuesta.status, json.detail || `Error ${respuesta.status}`);
  if (json.csrf) csrf = json.csrf;
  return json;
}

export const api = {
  sesion: () => llamar('/sesion'),   // también renueva el CSRF de esa sesión
  misCursos: () => llamar('/mis-cursos'),
  registrar: (datos) => llamar('/mis-cursos', { metodo: 'POST', datos }),
};

// ---------- Huella de la cuenta (idéntica a la de Arduino) ----------
export async function claveCuenta(correo) {
  if (!correo) return null;
  const texto = 'globalt-aula:' + String(correo).trim().toLowerCase();
  if (!globalThis.crypto?.subtle) {   // sin HTTPS: FNV-1a (solo separa espacios; no es secreta)
    let h = 0xcbf29ce484222325n;
    for (const b of new TextEncoder().encode(texto)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
    return 'f' + h.toString(16).padStart(16, '0');
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sufijo de las claves de borrador: '' para invitado; '.cuenta.<huella>' con cuenta. */
export const espacioBorradores = (clave) => (clave ? '.cuenta.' + clave : '');

// ---------- Cola de avance pendiente, por cuenta ----------
export const PREFIJO = 'globalt.aula.practicas-pendiente.v1.';
const PESTANA = 'globalt.aula.practicas.cuenta-pestana.v1';
const ID = /^[a-z0-9-]{3,60}$/;
const memoria = new Map();   // respaldo si el almacenamiento está bloqueado: solo dura esta página

function limpiar(datos) {
  const fuera = {};
  for (const [id, e] of Object.entries(datos || {})) {
    if (!ID.test(id) || !e || typeof e !== 'object') continue;
    fuera[id] = {
      visto_en: typeof e.visto_en === 'string' && !Number.isNaN(Date.parse(e.visto_en)) ? e.visto_en : new Date().toISOString(),
      completada: e.completada === true,
      seq: Number.isInteger(e.seq) ? e.seq : 0,
    };
  }
  return fuera;
}

export function pendientes(clave) {
  if (!clave) return {};
  let crudo;
  try {
    crudo = localStorage.getItem(PREFIJO + clave);
  } catch {
    return limpiar(memoria.get(clave));   // almacenamiento bloqueado: solo la memoria de esta página
  }
  if (crudo === null) return {};          // vacía (o la vació otra pestaña al enviarla)
  try {
    const datos = JSON.parse(crudo);
    return datos && typeof datos === 'object' && !Array.isArray(datos) ? limpiar(datos) : {};
  } catch { return {}; }
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

/** Anota una visita (o un reto superado) para la cuenta. Nunca quita «completada» de la cola. */
export function anotar(clave, id, { completada = false } = {}) {
  if (!clave || !ID.test(id)) return false;
  const datos = pendientes(clave);
  const previo = datos[id];
  datos[id] = { visto_en: new Date().toISOString(), completada: Boolean(previo?.completada) || completada === true,
    seq: (previo?.seq || 0) + 1 };
  return escribir(clave, datos);
}

function confirmar(clave, id, seq) {
  const datos = pendientes(clave);
  if (datos[id]?.seq !== seq) return;   // cambió mientras se enviaba: se envía en la siguiente vuelta
  delete datos[id];
  escribir(clave, datos);
}

export function clasificar(error) {
  const s = error?.status;
  if (s === 401) return { estado: 'sin-sesion' };
  if (s === 403) return { estado: 'sin-permiso', mensaje: error.message };
  if (s === 404 || s === 405 || s === -1) return { estado: 'no-disponible' };
  return { estado: 'error', mensaje: error?.message || 'Sin conexión con el aula.' };
}

let enCurso = null;   // un solo envío a la vez por página; entre pestañas, Web Locks (evita duplicados)
/**
 * Envía la cola de UNA cuenta. Devuelve { estado, enviados } con estado 'al-dia' | 'otra-cuenta' | 'sin-sesion'
 * | 'sin-permiso' | 'no-disponible' | 'error' | 'pendiente'. Lo no enviado sigue en la cola.
 */
export function enviar(clave, cliente = api) {
  if (enCurso) return enCurso.then(() => enviar(clave, cliente));
  const cerrojo = globalThis.navigator?.locks;
  const tarea = cerrojo && clave ? cerrojo.request('globalt-practicas-cola-' + clave, () => enviarAhora(clave, cliente))
    : enviarAhora(clave, cliente);
  enCurso = tarea.finally(() => { enCurso = null; });
  return enCurso;
}

async function enviarAhora(clave, cliente) {
  const enviados = [];
  let cola = pendientes(clave);
  if (!clave || !Object.keys(cola).length) return { estado: 'al-dia', enviados };
  try {
    const { usuario } = await cliente.sesion();
    if ((await claveCuenta(usuario?.correo)) !== clave) return { estado: 'otra-cuenta', enviados };
  } catch (e) {
    return { ...clasificar(e), enviados };
  }
  for (let vuelta = 0; vuelta < 3 && Object.keys(cola).length; vuelta++) {
    for (const [id, e] of Object.entries(cola)) {
      try {
        const { progreso } = await cliente.registrar({ leccion_id: id, paso: 0, vistos: [0], visto_en: e.visto_en, completada: e.completada });
        enviados.push(progreso);
        confirmar(clave, id, e.seq);
      } catch (error) {
        if (error.status === 422) { confirmar(clave, id, e.seq); continue; }   // dato imposible: no bloquear la cola
        return { ...clasificar(error), enviados };
      }
    }
    cola = pendientes(clave);
  }
  return { estado: Object.keys(cola).length ? 'pendiente' : 'al-dia', enviados };
}

// ---------- Estado combinado y «Continuar» ----------
/** Map id → { estado: 'completada'|'en-curso', visto_en, pendiente } (servidor + cola de la MISMA cuenta). */
export function combinar(servidor, cola = {}) {
  const mapa = new Map();
  for (const l of servidor?.lecciones || []) mapa.set(l.leccion_id, { estado: l.estado, visto_en: l.visto_en, pendiente: false });
  for (const [id, e] of Object.entries(cola)) {
    const s = mapa.get(id);
    mapa.set(id, {
      estado: s?.estado === 'completada' || e.completada ? 'completada' : 'en-curso',
      visto_en: !s || Date.parse(e.visto_en) >= Date.parse(s.visto_en) ? e.visto_en : s.visto_en,
      pendiente: true,
    });
  }
  return mapa;
}

/** Práctica de «Continuar»: la última visitada si no está completada; si no, la siguiente sin completar. */
export function continuarCon(practicas, mapa) {
  let ultima = null;
  for (const p of practicas) {
    const e = mapa.get(p.id);
    if (e && (!ultima || Date.parse(e.visto_en) > Date.parse(mapa.get(ultima.id).visto_en))) ultima = p;
  }
  const hecha = (p) => mapa.get(p.id)?.estado === 'completada';
  if (!ultima) return practicas.find((p) => !hecha(p)) || practicas[0];
  if (!hecha(ultima)) return ultima;
  const i = practicas.indexOf(ultima);
  return [...practicas.slice(i + 1), ...practicas.slice(0, i)].find((p) => !hecha(p)) || ultima;
}

// ---------- Sesión entre pestañas del mismo navegador (mismo canal que el aula y Arduino) ----------
const CANAL = 'globalt-aula-sesion';
export function avisarSesion(tipo) {
  try { const c = new BroadcastChannel(CANAL); c.postMessage({ tipo }); c.close(); } catch { /* sin soporte */ }
}
export function escucharSesion(funcion) {
  try { const c = new BroadcastChannel(CANAL); c.onmessage = (e) => funcion(e.data?.tipo); return () => c.close(); } catch { return () => {}; }
}

/**
 * Cuenta de esta página para un curso: { estado, usuario?, clave?, progreso?, mensaje? } con estado
 * 'inscrito' | 'sin-inscripcion' | 'invitado' (sin sesión) | 'sin-aula' | 'sin-conexion' (offline, la pestaña
 * ya conocía su cuenta: sigue con ella) | 'error' (offline sin cuenta conocida: invitado).
 */
export async function cuentaParaCurso(cursoId, cliente = api) {
  let usuario;
  try {
    ({ usuario } = await cliente.sesion());
  } catch (e) {
    if (e.status === 401) { olvidarPestana(); return { estado: 'invitado' }; }
    if (e.status === -1 || e.status === 404) return { estado: 'sin-aula' };
    const conocida = leerPestana(cursoId);
    return conocida ? { estado: 'sin-conexion', ...conocida, progreso: null } : { estado: 'error', mensaje: e.message };
  }
  const clave = await claveCuenta(usuario?.correo);
  try {
    const { cursos } = await cliente.misCursos();
    const curso = (cursos || []).find((c) => c.id === cursoId);
    if (!curso) { olvidarPestana(); return { estado: 'sin-inscripcion', usuario }; }
    recordarPestana(cursoId, clave, usuario);
    return { estado: 'inscrito', usuario, clave, progreso: curso.progreso && Array.isArray(curso.progreso.lecciones) ? curso.progreso : null };
  } catch (e) {
    if (e.status === 401) { olvidarPestana(); return { estado: 'invitado' }; }
    const conocida = leerPestana(cursoId);
    return conocida?.clave === clave ? { estado: 'sin-conexion', ...conocida, progreso: null } : { estado: 'error', mensaje: e.message };
  }
}

// La pestaña recuerda su cuenta (solo huella y nombre, en la sesión de esta pestaña) para seguir sin conexión.
function recordarPestana(cursoId, clave, usuario) {
  try { sessionStorage.setItem(PESTANA, JSON.stringify({ cursoId, clave, nombre: String(usuario?.nombre || '').slice(0, 60) })); } catch { /* */ }
}
function leerPestana(cursoId) {
  try {
    const d = JSON.parse(sessionStorage.getItem(PESTANA) || 'null');
    return d && d.cursoId === cursoId && typeof d.clave === 'string' ? { clave: d.clave, usuario: { nombre: d.nombre } } : null;
  } catch { return null; }
}
function olvidarPestana() {
  try { sessionStorage.removeItem(PESTANA); } catch { /* */ }
}

/**
 * Controlador para un laboratorio. Uso:
 *   const c = await conectarLaboratorio('course-web', { alCambiar });
 *   c.modo → 'cuenta' | 'invitado' | 'detenido';  c.espacio → sufijo de borradores;  c.estado(id) → estado;
 *   c.visitar(id) al abrir una práctica; await c.completar(id) SOLO cuando el evaluador aprueba.
 *   c.aviso() → { borrador, avance, tipo, reintentar } para mostrar la diferencia entre borrador local y avance.
 */
export async function conectarLaboratorio(cursoId, { alCambiar = () => {}, cliente = api, esperaMs = 6000 } = {}) {
  let reloj;
  const inicio = await Promise.race([
    cuentaParaCurso(cursoId, cliente),
    new Promise((r) => { reloj = setTimeout(() => r({ estado: 'error', mensaje: 'El aula tardó demasiado en responder.' }), esperaMs); }),
  ]).finally(() => clearTimeout(reloj));
  const c = {
    cursoId, inicio: inicio.estado, modo: ['inscrito', 'sin-conexion'].includes(inicio.estado) ? 'cuenta' : 'invitado',
    clave: inicio.clave || null, usuario: inicio.usuario || null, servidor: inicio.progreso || null,
    sincro: inicio.estado === 'sin-conexion' ? 'error' : 'al-dia', mensaje: inicio.mensaje || '',
  };
  c.espacio = c.modo === 'cuenta' ? espacioBorradores(c.clave) : '';
  const cambio = () => { try { alCambiar(c); } catch { /* la interfaz no debe romper el registro */ } };

  c.mapa = () => (c.modo === 'cuenta' ? combinar(c.servidor, pendientes(c.clave)) : new Map());
  c.estado = (id) => c.mapa().get(id)?.estado || 'sin-comenzar';

  c.detener = (texto) => {
    if (c.modo !== 'cuenta') return;
    c.modo = 'detenido';
    c.sincro = 'detenido';
    c.mensaje = texto;
    cambio();
  };

  c.sincronizar = async () => {
    if (c.modo !== 'cuenta') return;
    if (Object.keys(pendientes(c.clave)).length) {
      c.sincro = 'enviando';
      cambio();
      const r = await enviar(c.clave, cliente);
      if (r.estado === 'otra-cuenta') return c.detener('La sesión del aula cambió en este navegador: no se envió nada. Recarga la página.');
      if (r.estado === 'sin-sesion') return c.detener('Tu sesión terminó: el avance pendiente queda guardado solo para tu cuenta y se enviará cuando vuelvas a entrar.');
      c.sincro = r.estado === 'al-dia' ? 'al-dia' : r.estado === 'no-disponible' ? 'no-disponible' : 'error';
      c.mensaje = r.mensaje || '';
    }
    try {
      const { cursos } = await cliente.misCursos();
      const curso = (cursos || []).find((x) => x.id === cursoId);
      if (curso?.progreso) c.servidor = curso.progreso;
    } catch { /* se queda con lo último conocido */ }
    if (c.sincro === 'enviando') c.sincro = 'al-dia';
    cambio();
  };

  c.visitar = (id) => {
    if (c.modo !== 'cuenta') return;
    anotar(c.clave, id);
    cambio();
    c.sincronizar();
  };

  /** Solo tras aprobar el evaluador. Devuelve 'registrado' | 'pendiente' | 'invitado' | 'no-registrado'. */
  c.completar = async (id) => {
    if (c.modo === 'invitado') return 'invitado';
    if (c.modo !== 'cuenta') return 'no-registrado';
    let quien;
    try {
      const { usuario } = await cliente.sesion();
      quien = (await claveCuenta(usuario?.correo)) === c.clave ? 'misma' : 'otra';
    } catch (e) {
      quien = e.status === 401 ? 'sin-sesion' : 'sin-red';
    }
    if (c.modo !== 'cuenta') return 'no-registrado';
    if (quien === 'sin-sesion') { c.detener('Tu sesión terminó: este reto no se guardó en ninguna cuenta. Entra de nuevo en el aula, recarga y vuelve a comprobarlo.'); return 'no-registrado'; }
    if (quien === 'otra') { c.detener('La sesión del aula cambió en este navegador: este reto no se guardó en ninguna cuenta. Recarga la página.'); return 'no-registrado'; }
    anotar(c.clave, id, { completada: true });
    cambio();
    await c.sincronizar();
    return Object.keys(pendientes(c.clave)).includes(id) ? 'pendiente' : 'registrado';
  };

  c.aviso = () => {
    const nombre = c.usuario?.nombre ? ` (${c.usuario.nombre})` : '';
    const n = c.modo === 'invitado' ? 0 : Object.keys(pendientes(c.clave)).length;
    if (c.modo === 'detenido') {
      return { tipo: 'aviso', borrador: 'Borrador: guardado solo en este navegador, en el espacio de la cuenta con la que abriste la página.',
        avance: c.mensaje, recargar: true };
    }
    if (c.modo === 'invitado') {
      const motivo = {
        'sin-inscripcion': `Tienes sesión${nombre} pero no estás inscrito en este curso: inscríbete desde el aula para guardar tu avance.`,
        error: 'No se pudo comprobar tu cuenta (sin conexión). Trabajas como invitado: lo que hagas ahora no se sumará a ninguna cuenta.',
      }[c.inicio] || 'Modo invitado: tus retos se marcan solo en este navegador y nunca se suman a una cuenta. Entra en el aula para guardar tu avance.';
      return { tipo: 'invitado', borrador: 'Borrador de invitado: guardado solo en este navegador.', avance: motivo, reintentar: c.inicio === 'error', recargar: c.inicio === 'error' };
    }
    const borrador = `Borrador: guardado solo en este navegador, separado para tu cuenta${nombre}. No se copia a tu cuenta.`;
    if (c.sincro === 'enviando') return { tipo: 'enviando', borrador, avance: 'Enviando tu avance a la cuenta…' };
    if (c.sincro === 'no-disponible') return { tipo: 'aviso', borrador, avance: `Este servidor aún no guarda el avance de este curso: ${n} práctica(s) esperan en este navegador, solo para tu cuenta.`, reintentar: true };
    if (n) return { tipo: 'error', borrador, avance: `Sin conexión con el aula: ${n} práctica(s) con avance sin enviar, guardado en este navegador solo para tu cuenta. Se reintentará al volver la conexión.`, reintentar: true };
    return { tipo: 'ok', borrador, avance: `Avance sincronizado con tu cuenta${nombre}.` };
  };

  const alVolver = () => { if (c.modo === 'cuenta') c.sincronizar(); };
  addEventListener('online', alVolver);
  escucharSesion((tipo) => {
    if (tipo === 'sesion-cerrada') c.detener('Se cerró la sesión del aula en este navegador: ya no se registra avance para esa cuenta. Recarga la página.');
    else if (tipo === 'sesion-iniciada') c.detener('Otra sesión del aula se abrió en este navegador: ya no se registra avance desde esta página. Recarga la página.');
  });
  if (c.modo === 'cuenta' && Object.keys(pendientes(c.clave)).length && inicio.estado === 'inscrito') c.sincronizar();
  return c;
}
