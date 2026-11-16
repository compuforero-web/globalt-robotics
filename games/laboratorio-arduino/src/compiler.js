// Cliente del servicio de compilación (services/compilador-arduino). Mismo origen: /api/arduino/.
// Dentro del aula privada se usa /api/aula/, que exige sesión, inscripción y CSRF y aplica límites
// por estudiante antes de reenviar al mismo servicio.
let BASE = '/api/arduino';
let RUTA_SALUD = '/salud';
let aula = null;   // { csrf: () => string } cuando se compila a través del aula

/** Compila a través de la API del aula (sesión del estudiante). */
export function usarAula(obtenerCsrf) {
  BASE = '/api/aula';
  RUTA_SALUD = '/compilador/salud';
  aula = { csrf: obtenerCsrf };
}
export const enAula = () => aula !== null;

const AULA_401 = 'Entra en el aula con tu cuenta para compilar.';

export class CompilerUnavailable extends Error {
  // pending = no hay servicio de compilación en este sitio (sin detalle del servicio).
  constructor(message) {
    super(message || 'La compilación estará disponible próximamente.');
    this.name = 'CompilerUnavailable';
    this.pending = !message;
  }
}

async function request(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (aula) {
      const headers = { Accept: 'application/json', ...(options.headers || {}) };
      if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = aula.csrf() || '';
      options = { ...options, headers, credentials: 'same-origin' };
    }
    const response = await fetch(BASE + path, { ...options, signal: controller.signal, cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    if (aula && type.includes('application/json')) {
      const data = await response.json();
      if (response.ok) return data;
      if (response.status === 401) throw new Error(AULA_401);
      if (response.status === 503) throw new CompilerUnavailable(data.detail || undefined);
      throw new Error(data.detail || `Error ${response.status}`);
    }
    // Sin servicio instalado el servidor web responde 404/502 o una página HTML.
    if ([404, 502, 503, 504].includes(response.status) || !type.includes('application/json')) {
      let detail = '';
      try { detail = type.includes('application/json') ? (await response.json()).error || '' : ''; } catch { /* sin detalle */ }
      throw new CompilerUnavailable(response.status === 503 && detail ? detail : undefined);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  } catch (error) {
    if (error instanceof CompilerUnavailable) throw error;
    if (error.name === 'AbortError') throw new Error('El compilador tardó demasiado en responder.');
    if (error instanceof TypeError) throw new CompilerUnavailable();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Devuelve la información del servicio o lanza CompilerUnavailable. */
export function checkCompiler() { return request(RUTA_SALUD, {}, 8000); }

/** Compila el programa. Respuesta: { ok, hex?, memoria?, diagnosticos[], salida, version }. */
export function compileSketch(code) {
  return request('/compilar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placa: 'nano', codigo: code }),
  }, aula ? 60000 : 30000);   // el aula puede esperar turno antes de compilar
}
