// Worker del Laboratorio Python: carga Pyodide (CPython compilado a WebAssembly, copia local en vendor/) y
// ejecuta el código del estudiante con src/arnes.py. Corre fuera del hilo de la página: si el programa no termina,
// la página termina este Worker (terminate) y crea otro; así un bucle infinito nunca congela la interfaz.
// Mensajes: {tipo:'iniciar'} → {tipo:'listo', python, pyodide} | {tipo:'fallo-carga', mensaje}
//           {tipo:'ejecutar', id, archivos, principal, entrada, llamadas} → {tipo:'salida', id, clase, texto}* y
//           {tipo:'resultado', id, resultado}
const VENDOR = new URL('../vendor/pyodide-314.0.7/', import.meta.url).href;
let pyodide = null;
let ejecutarPy = null;

function enviar(mensaje) { self.postMessage(mensaje); }

// Pyodide compila el .wasm con instantiateStreaming, que exige el tipo MIME application/wasm, y si falla solo
// escribe un aviso y la carga queda colgada. Aquí: con otro tipo MIME se instancia desde ArrayBuffer, y cualquier
// fallo se informa a la página al momento (para ofrecer «Reintentar»).
const instanciarOriginal = WebAssembly.instantiateStreaming?.bind(WebAssembly);
WebAssembly.instantiateStreaming = async (respuesta, imports) => {
  try {
    const r = await respuesta;
    if (!r.ok) throw new Error(`pyodide.asm.wasm: HTTP ${r.status}`);
    if (instanciarOriginal && (r.headers.get('content-type') || '').split(';')[0].trim() === 'application/wasm') {
      return await instanciarOriginal(r, imports);
    }
    return await WebAssembly.instantiate(await r.arrayBuffer(), imports);
  } catch (error) {
    enviar({ tipo: 'fallo-carga', mensaje: `No se pudo preparar el intérprete: ${String(error?.message || error).slice(0, 200)}` });
    throw error;
  }
};

async function iniciar() {
  try {
    const [{ loadPyodide }, asm] = await Promise.all([import(VENDOR + 'pyodide.js'), import(VENDOR + 'pyodide-asm.js')]);
    // createPyodideModule: el módulo de Emscripten se importa aquí con extensión .js (tipo MIME de JavaScript en
    // cualquier servidor) en lugar de que Pyodide pida «pyodide.asm.mjs».
    pyodide = await loadPyodide({ indexURL: VENDOR, createPyodideModule: asm.default, fullStdLib: false,
      stdout: () => {}, stderr: () => {} });
    const arnes = await fetch(new URL('./arnes.py', import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`arnes.py: HTTP ${r.status}`);
      return r.text();
    });
    pyodide.FS.mkdirTree('/home/pyodide/laboratorio');
    pyodide.FS.writeFile('/home/pyodide/laboratorio/arnes.py', arnes);
    pyodide.runPython("import sys\nsys.path.insert(0, '/home/pyodide/laboratorio')\nimport arnes");
    ejecutarPy = pyodide.pyimport('arnes').ejecutar;
    enviar({ tipo: 'listo', python: pyodide.runPython('import sys; sys.version.split()[0]'), pyodide: pyodide.version });
  } catch (error) {
    enviar({ tipo: 'fallo-carga', mensaje: String(error?.message || error).slice(0, 300) });
  }
}

function ejecutar({ id, archivos, principal, entrada, llamadas }) {
  if (!ejecutarPy) { enviar({ tipo: 'resultado', id, resultado: { estado: 'no-listo' } }); return; }
  const emitir = (clase, texto) => enviar({ tipo: 'salida', id, clase, texto });
  const args = [pyodide.toPy(archivos), principal, pyodide.toPy(entrada || []), pyodide.toPy(llamadas || []), emitir];
  let proxy;
  try {
    proxy = ejecutarPy(...args);
    const resultado = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
    enviar({ tipo: 'resultado', id, resultado });
  } catch (error) {
    enviar({ tipo: 'resultado', id, resultado: { estado: 'fallo-interno', mensaje: String(error?.message || error).slice(0, 500) } });
  } finally {
    proxy?.destroy?.();
    for (const a of args) a?.destroy?.();
  }
}

self.onmessage = ({ data }) => {
  if (data?.tipo === 'iniciar') iniciar();
  else if (data?.tipo === 'ejecutar') ejecutar(data);
};
