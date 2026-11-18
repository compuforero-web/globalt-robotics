// Prueba de extremo a extremo del Laboratorio «Python desde Cero» (Chromium, escritorio y móvil).
// No la ejecuta CI: necesita Playwright con Chromium y un servidor estático del repositorio.
// Uso: node scripts/serve.mjs &  PY_URL=http://127.0.0.1:8080/games/laboratorio-python/index.html node tests/e2e/python-lab.e2e.mjs
// Opcional: PY_SHOTS=carpeta para capturas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const URL_LAB = process.env.PY_URL || 'http://127.0.0.1:8080/games/laboratorio-python/index.html';
const SHOTS = process.env.PY_SHOTS || '';
const FIX = new URL('../fixtures/laboratorio-python/', import.meta.url);
const fx = (n) => readFileSync(new URL(n, FIX), 'utf8');
const IDS = ['python-variables', 'python-condicionales', 'python-funciones', 'python-archivos', 'python-asistente'];
const PRINCIPAL = ['programa.py', 'programa.py', 'programa.py', 'principal.py', 'asistente.py'];
const log = (...a) => console.log('✔', ...a);
const errores = [];

const browser = await chromium.launch();
async function pagina(opciones) {
  const ctx = await browser.newContext(opciones);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  return { ctx, p };
}
async function abrir(p, id) {
  await p.goto(id ? `${URL_LAB}?practica=${id}` : URL_LAB);
  await p.waitForFunction(() => document.querySelector('#interprete').dataset.tipo !== 'cargando', null, { timeout: 90000 });
}
const listo = (p) => p.waitForFunction(() => document.querySelector('#interprete').dataset.tipo === 'listo', null, { timeout: 90000 });
async function escribir(p, archivo, codigo) {
  await p.click(`[data-archivo="${archivo}"]`);
  await p.locator('.editor__texto').fill(codigo);
}
async function ejecutar(p) {
  await p.click('#btn-ejecutar');
  await p.waitForFunction(() => /Programa terminado|⏹|Error interno/.test(document.querySelector('#consola').textContent)
    || (!document.querySelector('#error').hidden && document.querySelector('#error').dataset.tipo === 'programa'), null, { timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('#btn-detener').disabled);
}
async function comprobar(p) {
  await p.click('#btn-comprobar');
  await p.waitForSelector('.casos__fin', { timeout: 120000 });
  return p.textContent('#resultado');
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function retos(p, etiqueta) {
  for (const [i, id] of IDS.entries()) {
    const n = i + 1;
    await abrir(p, id);
    if (n === 4) await escribir(p, 'bateria.py', fx('p4-bateria.py'));
    await escribir(p, PRINCIPAL[i], fx(`p${n}-fallo.py`));
    let r = await comprobar(p);
    assert.match(r, /casos correctos/, `${id} fallo`);
    assert.doesNotMatch(r, /Reto superado/);
    assert.ok(await p.locator('.casos li.fallo').count() >= 1);
    assert.match(await p.textContent('#estado-reto'), /Reto pendiente/);
    await escribir(p, PRINCIPAL[i], fx(`p${n}-solucion.py`));
    r = await comprobar(p);
    assert.match(r, /¡Reto superado!/, `${id}: ${r}`);
    assert.equal(await p.locator('.casos li.fallo').count(), 0);
    assert.match(await p.textContent('#estado-reto'), /Reto superado.*solo en este navegador/);
    assert.ok(await sinDesborde(p), `${id} desborda`);
  }
  assert.equal(await p.locator('.practicas__ok').count(), 5);
  log(`${etiqueta}: en las 5 prácticas el fallo típico no supera el reto y la solución sí`);
}

// ================= Escritorio =================
const { ctx: ctxE, p: e } = await pagina({ viewport: { width: 1366, height: 900 } });
await abrir(e);
assert.match(await e.textContent('#interprete'), /Python 3\.14\.2 listo/);
assert.match(await e.textContent('.nota-guardado'), /solo en este navegador/);
assert.match(await e.textContent('.py-pie'), /Pyodide 314\.0\.7/);
log('carga de Pyodide 314.0.7 (CPython 3.14.2) desde la copia local');

// Entrada, indicador y eco; falta de entrada con línea y pista.
await e.fill('#entrada', '2000\n450');
await ejecutar(e);
assert.match(await e.textContent('#consola'), /Capacidad en mAh: 2000\nConsumo en mA: 450\nAutonomía: 4\.444/);
assert.equal(await e.locator('#consola .c-entrada').first().textContent(), '2000\n');
await e.fill('#entrada', '2000');
await ejecutar(e);
assert.match(await e.textContent('#error'), /EOFError en programa\.py, línea 4/);
assert.match(await e.textContent('#error'), /más datos con input\(\) que líneas hay en «Entrada»/);
log('entrada: una línea por input(), eco en la consola y EOFError con línea y pista');

// Errores con línea, pista y salto a la línea.
await e.fill('#entrada', '3');
for (const [codigo, tipo, linea, pista] of [
  ['x = 1\nif x > 0\n    print(x)\n', 'SyntaxError', 2, /Falta el signo «:»/],
  ['edad = input("Edad: ")\nprint(edad + 1)\n', 'TypeError', 2, /input\(\) devuelve texto/],
  ['total = 5\nprint(totl)\n', 'NameError', 2, /parecido/],
  ['for i in range(3):\nprint(i)\n', 'IndentationError', 2, /sangría/],
  ['valores = []\nprint(sum(valores) / len(valores))\n', 'ZeroDivisionError', 2, /cero/],
]) {
  await e.locator('.editor__texto').fill(codigo);
  await ejecutar(e);
  const caja = await e.textContent('#error');
  assert.match(caja, new RegExp(`${tipo} en programa\\.py, línea ${linea}`), caja);
  assert.match(caja, pista, caja);
  assert.equal(await e.textContent('.editor__numeros .es-error'), String(linea));
}
await e.click('#btn-ir-linea');
assert.equal(await e.evaluate(() => { const t = document.querySelector('.editor__texto'); return t.value.slice(t.selectionStart, t.selectionEnd); }), 'print(sum(valores) / len(valores))');
log('errores (sintaxis, tipos, nombre, sangría, división): tipo, línea marcada, pista y «Ir a la línea»');

// Bucle infinito: Detener lo corta; el límite de tiempo también; un print sin fin se corta solo.
await e.locator('.editor__texto').fill('n = 0\nwhile True:\n    n += 1\n');
await e.click('#btn-ejecutar');
await e.waitForTimeout(1500);
assert.equal(await e.isEnabled('#btn-detener'), true);
const t0 = Date.now();
await e.click('#btn-detener');
await e.waitForFunction(() => /Ejecución detenida/.test(document.querySelector('#consola').textContent));
assert.ok(Date.now() - t0 < 2000);
assert.ok(await e.evaluate(() => { const t = performance.now(); while (performance.now() - t < 5); return true; }));   // la página sigue respondiendo
await listo(e);
await e.locator('.editor__texto').fill('print("de nuevo")\n');
await ejecutar(e);
assert.match(await e.textContent('#consola'), /de nuevo/);
await e.locator('.editor__texto').fill('while True:\n    pass\n');
await ejecutar(e);
assert.match(await e.textContent('#consola'), /superó 10 s y se detuvo/);
await listo(e);
await e.locator('.editor__texto').fill('while True:\n    print("sin fin")\n');
await ejecutar(e);
assert.match(await e.textContent('#consola'), /demasiado texto/);
log('bucle infinito: «Detener» lo corta en <2 s, el límite de 10 s también, print sin fin se corta y el intérprete se recarga');

// Comprobar un reto con bucle infinito: cada caso se corta por tiempo y la página no se bloquea.
await e.locator('.editor__texto').fill('capacidad = int(input())\nwhile capacidad > 0:\n    capacidad += 1\n');
const r = await comprobar(e);
assert.match(r, /no terminó a tiempo/);
await listo(e);
log('comprobación con bucle infinito: casos fallidos por tiempo, sin bloquear');

await retos(e, 'escritorio');
if (SHOTS) await e.screenshot({ path: `${SHOTS}/python-escritorio.png` });
await abrir(e, 'python-variables');

// Persistencia: borrador por práctica, entrada, recarga y restaurar.
await e.locator('.editor__texto').fill('# mi borrador de la práctica 1\nprint("hola")\n');
await e.fill('#entrada', '7\n8');
await e.waitForFunction(() => /Guardado en este navegador/.test(document.querySelector('#guardado').textContent));
await abrir(e, 'python-condicionales');
assert.match(await e.inputValue('.editor__texto'), /criticas/);   // su propio borrador, no el de la práctica 1
await e.locator('.editor__texto').fill('# borrador de la práctica 2\n');
await e.waitForFunction(() => /Guardado en este navegador/.test(document.querySelector('#guardado').textContent));
await abrir(e, 'python-variables');
assert.equal(await e.inputValue('.editor__texto'), '# mi borrador de la práctica 1\nprint("hola")\n');
assert.equal(await e.inputValue('#entrada'), '7\n8');
assert.match(await e.textContent('#guardado'), /Borrador recuperado de este navegador/);
const almacen = await e.evaluate(() => JSON.parse(localStorage.getItem('globalt.laboratorio.python.v1')));
assert.match(almacen.practicas['python-condicionales'].archivos['programa.py'], /borrador de la práctica 2/);
assert.ok(almacen.practicas['python-variables'].superado_en);
e.once('dialog', (d) => d.accept());
await e.click('#btn-restaurar');
assert.match(await e.inputValue('.editor__texto'), /^# Práctica 1 · Autonomía/);
assert.ok((await e.evaluate(() => JSON.parse(localStorage.getItem('globalt.laboratorio.python.v1')))).practicas['python-variables'].superado_en);
assert.ok(!(await e.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('globalt.laboratorio.arduino')))));
log('persistencia: borradores y entrada separados por práctica, recuperados al recargar; restaurar conserva el reto superado');

// Archivos virtuales (práctica 4) y otro archivo de datos.
await abrir(e, 'python-archivos');
await escribir(e, 'bateria.py', fx('p4-bateria.py'));
await escribir(e, 'principal.py', fx('p4-solucion.py'));
await ejecutar(e);
assert.match(await e.textContent('#consola'), /Lecturas válidas: 3/);
assert.match(await e.textContent('#archivos-virtuales'), /informe\.txt\s*motor_izq;7\.3;OK/);
await escribir(e, 'lecturas.txt', 'robot;8.1\n');
await ejecutar(e);
assert.match(await e.textContent('#archivos-virtuales'), /robot;8\.1;OK/);
await escribir(e, 'bateria.py', 'def estado(v):\n    return 1 / 0\n\ndef promedio(v):\n    return 0.0\n');
await ejecutar(e);
assert.match(await e.textContent('#error'), /ZeroDivisionError en bateria\.py, línea 2/);
await e.click('[data-archivo="principal.py"]');
await e.click('#btn-ir-linea');
assert.equal(await e.getAttribute('[data-archivo="bateria.py"]', 'aria-selected'), 'true');
assert.equal(await e.textContent('.editor__numeros .es-error'), '2');
if (SHOTS) await e.screenshot({ path: `${SHOTS}/python-archivos-escritorio.png`, fullPage: true });
log('archivos virtuales: informe.txt visible, datos editables y error en el módulo con salto a su pestaña');

// Ejemplo y pistas: no cambian el código y no superan el reto.
await abrir(e, 'python-asistente');
const antes = await e.inputValue('.editor__texto');
await e.click('#btn-ejemplo');
await e.waitForFunction(() => /Adiós/.test(document.querySelector('#consola').textContent));
await e.click('#btn-pista');
await e.click('#btn-pista');
assert.equal(await e.locator('#lista-pistas li').count(), 2);
assert.equal(await e.inputValue('.editor__texto'), antes);
log('ejemplo y pistas: sin tocar el código');

// Práctica desconocida.
await e.goto(`${URL_LAB}?practica=python-no-existe`);
assert.match(await e.textContent('#objetivo'), /No hay ninguna práctica/);
assert.equal(await e.isVisible('#editor'), false);
log('práctica desconocida: sin editor ni cambios');


// Fallo de carga del intérprete: aviso, el editor sigue guardando y «Reintentar» lo recupera.
const { ctx: ctxF, p: f } = await pagina({ viewport: { width: 1280, height: 860 } });
await ctxF.route('**/pyodide.asm.wasm', (r) => r.fulfill({ status: 404, body: 'no' }));
await f.goto(URL_LAB);
await f.waitForFunction(() => document.querySelector('#interprete').dataset.tipo === 'fallo', null, { timeout: 30000 });
assert.match(await f.textContent('#error'), /No se pudo cargar el intérprete de Python/);
assert.equal(await f.isDisabled('#btn-ejecutar'), true);
await f.locator('.editor__texto').fill('print("sin intérprete")\n');
await f.waitForFunction(() => /Guardado en este navegador/.test(document.querySelector('#guardado').textContent));
await ctxF.unroute('**/pyodide.asm.wasm');
await f.click('#btn-reintentar-carga');
await listo(f);
await ejecutar(f);
assert.match(await f.textContent('#consola'), /sin intérprete/);
await ctxF.route('**/vendor/pyodide-314.0.7/pyodide.js', (r) => r.abort('internetdisconnected'));
await f.reload();
await f.waitForFunction(() => document.querySelector('#interprete').dataset.tipo === 'fallo', null, { timeout: 30000 });
log('fallo de carga (wasm 404 o red cortada): aviso inmediato, borrador guardado y «Reintentar» funciona');
await ctxF.close();

// ================= Móvil =================
const { p: m } = await pagina({ ...devices['Pixel 7'] });
await abrir(m, 'python-condicionales');
assert.ok(await sinDesborde(m));
await m.fill('#entrada', '1\n6.0');
await m.locator('.editor__texto').fill(fx('p2-solucion.py'));
await ejecutar(m);
assert.match(await m.textContent('#consola'), /Lectura 1: 6\.0 V -> CRÍTICA/);
await m.locator('.editor__texto').fill('n = int(input())\nwhile n > 0\n    n -= 1\n');
await ejecutar(m);
assert.match(await m.textContent('#error'), /SyntaxError en programa\.py, línea 2/);
await m.locator('.editor__texto').fill('while True:\n    pass\n');
await m.click('#btn-ejecutar');
await m.waitForTimeout(800);
await m.click('#btn-detener');
await m.waitForFunction(() => /Ejecución detenida/.test(document.querySelector('#consola').textContent));
await listo(m);
await m.reload();
await listo(m);
assert.equal(await m.inputValue('.editor__texto'), 'while True:\n    pass\n');
if (SHOTS) await m.screenshot({ path: `${SHOTS}/python-movil.png`, fullPage: true });
log('móvil: entrada, error con línea, Detener y borrador tras recargar, sin desbordamiento');
await retos(m, 'móvil');

assert.deepEqual(errores, []);
await browser.close();
console.log('Todas las comprobaciones del Laboratorio Python pasaron.');
