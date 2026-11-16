// Cliente del servicio de compilación (services/compilador-arduino). Mismo origen: /api/arduino/.
const BASE = '/api/arduino';

export class CompilerUnavailable extends Error {
  constructor(message = 'Servicio de compilación pendiente') { super(message); this.name = 'CompilerUnavailable'; }
}

async function request(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BASE + path, { ...options, signal: controller.signal, cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
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
export function checkCompiler() { return request('/salud', {}, 5000); }

/** Compila el programa. Respuesta: { ok, hex?, memoria?, diagnosticos[], salida, version }. */
export function compileSketch(code) {
  return request('/compilar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placa: 'nano', codigo: code }),
  });
}
