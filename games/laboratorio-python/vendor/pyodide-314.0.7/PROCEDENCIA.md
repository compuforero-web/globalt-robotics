# Intérprete de Python del laboratorio: Pyodide 314.0.7

| Dato | Valor |
|---|---|
| Proyecto | Pyodide — CPython compilado a WebAssembly (https://github.com/pyodide/pyodide) |
| Versión | 314.0.7 (publicada en npm el 2026-09-14) · Python **3.14.2** |
| Procedencia | Paquete npm `pyodide@314.0.7` (`npm pack`), integridad `sha512-0YvXxEhfEdpLfb/XkM2BFAeMROq0iMUX2bzzH9pOttyMcWkwq+HbE5uyuGD82LN7y2q+SNvi/6V5JEsOlD2R1A==` comprobada |
| Licencias | Pyodide: Mozilla Public License 2.0 (`LICENSE-pyodide.txt`, del repositorio en la etiqueta 314.0.7). CPython y su biblioteca estándar: PSF License (`LICENSE-CPython.txt`, etiqueta v3.14.2). Ambas permiten redistribuir sin modificar junto con código de otra licencia. |
| Peso | 13 531 207 bytes sin comprimir (≈13,5 MB); ≈6,4 MB con gzip. Se descarga una vez por navegador y luego se usa la caché. |

No se ha modificado ningún archivo. Solo se cambiaron dos **nombres** para que cualquier servidor los entregue con
tipo MIME de JavaScript (los Workers de módulo lo exigen y no todos los servidores conocen `.mjs`):

| Archivo aquí | Original en el paquete | Bytes | SHA-256 |
|---|---|---:|---|
| `pyodide.js` | `pyodide.mjs` | 17 931 | `6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109` |
| `pyodide-asm.js` | `pyodide.asm.mjs` | 1 250 344 | `f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635` |
| `pyodide.asm.wasm` | igual | 9 598 218 | `cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6` |
| `python_stdlib.zip` | igual | 2 545 637 | `fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a` |
| `pyodide-lock.json` | igual | 119 077 | `5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010` |

`src/worker.js` pasa el módulo `pyodide-asm.js` con la opción `createPyodideModule` de `loadPyodide`, de modo que
Pyodide no pide `pyodide.asm.mjs`. No se carga ningún paquete adicional ni nada de una CDN: `indexURL` apunta a
esta carpeta. Los archivos `.map`, `.d.ts` y las consolas de ejemplo del paquete no se incluyen.

Para actualizar: `npm pack pyodide@<versión>`, comprobar la integridad, copiar los cinco archivos con los mismos
nombres en una carpeta nueva `vendor/pyodide-<versión>/`, actualizar `VENDOR` en `src/worker.js`, esta tabla y las
sumas que comprueba `tests/test_python_lab.py`.
