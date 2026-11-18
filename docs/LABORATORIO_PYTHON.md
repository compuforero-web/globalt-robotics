# Laboratorio «Python desde Cero»

`games/laboratorio-python/index.html` (`?practica=<id>`). Cinco prácticas originales y encadenadas alrededor de la batería del robot del club:

| # | Id | Tema | Reto |
|---|---|---|---|
| 1 | `python-variables` | Variables y operadores | Autonomía en horas, minutos y 80 % usable (`/`, `//`, `%`, `f"{:.2f}"`) |
| 2 | `python-condicionales` | Condicionales y ciclos | Semáforo OK / BAJA / CRÍTICA de n lecturas con conteo y consejo |
| 3 | `python-funciones` | Funciones y listas | `estado`, `promedio`, `bajo_umbral` y panel de lecturas (se llaman las funciones directamente) |
| 4 | `python-archivos` | Archivos y módulos | Lee `lecturas.txt`, usa el módulo `bateria.py`, escribe `informe.txt` y controla archivo ausente y líneas no válidas |
| 5 | `python-asistente` | Asistente de consola | Ciclo de órdenes (`agregar`, `lista`, `promedio`, `alerta`, `guardar`, `ayuda`, `salir`) con `bitacora.txt` |

## Ejecución

- **Intérprete:** Pyodide 314.0.7 = CPython **3.14.2** en WebAssembly, copia local en `vendor/pyodide-314.0.7/`, sin CDN. Licencias MPL-2.0 (Pyodide) y PSF (CPython), procedencia, peso (13,5 MB; ≈6,4 MB con gzip) y SHA-256 en `vendor/pyodide-314.0.7/PROCEDENCIA.md`. Solo se renombraron `.mjs` → `.js` (tipo MIME en cualquier servidor).
- **Aislamiento:** el código corre en un Worker de módulo (`src/worker.js`). «Detener», el límite de 10 s por ejecución y de 6 s por caso del reto terminan el Worker (`terminate()`), lo que corta incluso `while True: pass`, y se carga otro de la caché. La salida está limitada a 20 000 caracteres (un `print` sin fin se corta solo). Los módulos `js`/`pyodide`/`micropip` no se pueden importar desde el código del estudiante.
- **Entrada:** cada línea del cuadro «Entrada» responde a un `input()`; el indicador y el eco se ven en la consola pero no cuentan en la comparación. Si faltan líneas: `EOFError` con línea y pista.
- **Errores:** tipo, archivo, línea (marcada en el editor, con «Ir a la línea» incluso en otro archivo), mensaje original de Python (con sus sugerencias «Did you mean») y una pista en español (`src/errores.js`).
- **Archivos virtuales:** cada ejecución crea una carpeta nueva en la memoria del intérprete con los archivos de la práctica; se muestran los archivos creados o cambiados y se borran al terminar. Nada toca el disco del estudiante.
- **Arnés único:** `src/arnes.py` lo ejecutan igual Pyodide (navegador) y CPython (pruebas).
- **Retos:** casos de entrada/salida exacta (sin espacios finales), archivos esperados, llamadas a funciones (`repr`) y un requisito de código (importar `bateria`). Se informa la primera línea distinta.
- **Borradores:** `localStorage` clave `globalt.laboratorio.python.v1`, por práctica (archivos, entrada y reto superado), con guardado automático. Solo en ese navegador: no se envían al aula ni a ningún servidor; la página lo explica junto al editor.
- **Fallo de carga:** si el `.wasm` no llega o no se puede instanciar, aviso inmediato y «Reintentar»; el editor sigue guardando. Si el servidor no envía `application/wasm`, se instancia desde `ArrayBuffer`.

Sin cambios en el aula, sus cuentas, el compilador Arduino, Linux ni Cloudflare. La tarjeta pública del catálogo no se incluye aquí.

## Pruebas

- `python3 -m unittest tests.test_python_lab` (CI): con CPython, cada solución de `tests/fixtures/laboratorio-python/` supera todos los casos y el fallo típico y el código inicial no; entrada, errores con línea, salida limitada, archivos virtuales, módulos bloqueados y sumas del intérprete.
- `node scripts/serve.mjs` y `PY_URL=http://127.0.0.1:8080/games/laboratorio-python/index.html node tests/e2e/python-lab.e2e.mjs` (manual, Chromium escritorio 1366×900 y Pixel 7): solución y fallo de las 5 prácticas en ambos, entrada, cinco tipos de error, «Detener» y límite con bucle infinito, persistencia, archivos virtuales, fallo de carga del `.wasm` y del cargador. `serve.mjs` entrega el `.wasm` como `application/octet-stream`, así que también cubre la vía sin `application/wasm`.

## Limitaciones

- `input()` no es interactivo durante la ejecución: los datos se escriben antes en «Entrada». Hacerlo interactivo exigiría `SharedArrayBuffer` y cabeceras COOP/COEP en el servidor.
- Solo la biblioteca estándar incluida en Pyodide; sin paquetes de PyPI ni red.
- El resultado del reto se calcula y registra en el navegador: no es una evaluación verificada ni un certificado.
- Tras «Detener» o un tiempo agotado, el intérprete tarda unos segundos en recargarse.
