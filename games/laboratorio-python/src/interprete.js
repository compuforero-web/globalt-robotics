// Control del intérprete desde la página: crea el Worker, envía ejecuciones y lo reinicia si hay que detener
// un programa (bucle infinito, botón Detener o límite de tiempo). terminate() corta incluso «while True: pass»,
// que ningún código dentro del Worker podría interrumpir sin SharedArrayBuffer.
const CARGA_MAX_MS = 90000;   // red lenta: la primera descarga es de unos 13,5 MB

export class Interprete {
  /** onEstado(estado, info): 'cargando' | 'listo' {python, pyodide} | 'fallo' {mensaje} */
  constructor({ onEstado = () => {}, crearWorker } = {}) {
    this.onEstado = onEstado;
    this.crearWorker = crearWorker || (() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
    this.estado = 'apagado';
    this.info = null;
    this.worker = null;
    this.actual = null;   // ejecución en curso { id, resolver, onSalida, temporizador }
    this.siguienteId = 1;
    this.esperandoListo = [];
  }

  iniciar() {
    this.apagar();
    this.estado = 'cargando';
    this.onEstado('cargando');
    const worker = this.crearWorker();
    this.worker = worker;
    const carga = setTimeout(() => this.fallo(worker, 'El intérprete tardó demasiado en cargar.'), CARGA_MAX_MS);
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker) return;
      if (data.tipo === 'listo') {
        clearTimeout(carga);
        this.estado = 'listo';
        this.info = { python: data.python, pyodide: data.pyodide };
        this.onEstado('listo', this.info);
        for (const r of this.esperandoListo.splice(0)) r(true);
      } else if (data.tipo === 'fallo-carga') {
        clearTimeout(carga);
        this.fallo(worker, data.mensaje);
      } else if (data.tipo === 'salida' && this.actual?.id === data.id) {
        this.actual.onSalida?.(data.clase, data.texto);
      } else if (data.tipo === 'resultado' && this.actual?.id === data.id) {
        this.terminarEjecucion(data.resultado);
      }
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      clearTimeout(carga);
      if (this.estado === 'cargando') this.fallo(worker, e.message || 'No se pudo cargar el intérprete.');
      else if (this.actual) { this.terminarEjecucion({ estado: 'fallo-interno', mensaje: e.message || 'Error del intérprete.' }); this.iniciar(); }
    };
    worker.postMessage({ tipo: 'iniciar' });
  }

  fallo(worker, mensaje) {
    if (worker !== this.worker) return;
    worker.terminate();
    this.worker = null;
    this.estado = 'fallo';
    this.onEstado('fallo', { mensaje });
    for (const r of this.esperandoListo.splice(0)) r(false);
  }

  apagar() {
    this.worker?.terminate();
    this.worker = null;
  }

  /** Espera a que el intérprete esté listo (true) o falle (false). */
  listo() {
    if (this.estado === 'listo') return Promise.resolve(true);
    if (this.estado === 'fallo' || this.estado === 'apagado') return Promise.resolve(false);
    return new Promise((r) => this.esperandoListo.push(r));
  }

  get ocupado() { return Boolean(this.actual); }

  /**
   * Ejecuta un programa. Resuelve con el resultado del arnés o con {estado: 'tiempo' | 'detenido' | 'no-listo'}.
   * Si se supera limiteMs, el Worker se termina y se carga otro.
   */
  ejecutar({ archivos, principal, entrada = [], llamadas = [] }, { onSalida, limiteMs = 8000 } = {}) {
    if (this.estado !== 'listo' || !this.worker) return Promise.resolve({ estado: 'no-listo' });
    if (this.actual) return Promise.reject(new Error('Ya hay una ejecución en curso.'));
    const id = this.siguienteId++;
    return new Promise((resolver) => {
      this.actual = { id, resolver, onSalida, temporizador: setTimeout(() => this.cortar('tiempo'), limiteMs) };
      this.worker.postMessage({ tipo: 'ejecutar', id, archivos, principal, entrada, llamadas });
    });
  }

  /** Botón Detener: corta la ejecución en curso y recarga el intérprete. */
  detener() { if (this.actual) this.cortar('detenido'); }

  cortar(estado) {
    this.terminarEjecucion({ estado });
    this.iniciar();   // terminate() + Worker nuevo (Pyodide sale de la caché del navegador)
  }

  terminarEjecucion(resultado) {
    const actual = this.actual;
    if (!actual) return;
    clearTimeout(actual.temporizador);
    this.actual = null;
    actual.resolver(resultado);
  }
}
