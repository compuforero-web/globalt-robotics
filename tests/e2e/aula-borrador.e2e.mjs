// Prueba manual de extremo a extremo: borrador del Laboratorio Arduino guardado en la cuenta del aula.
// No la ejecuta CI: necesita Chromium, la API del aula con PostgreSQL y el sitio en el mismo origen.
// Uso: (cd services/aula-api && docker compose up -d) && AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/aula-borrador.e2e.mjs
// Crea cuentas ficticias @example.com.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const SITIO = (process.env.AULA_SITIO || 'http://127.0.0.1:8180').replace(/\/$/, '');
const LAB = SITIO + '/games/laboratorio-arduino/index.html';
const SHOTS = process.env.AULA_SHOTS || '';
const sufijo = Date.now().toString(36);
const CLAVE = 'clave-ficticia-e2e-1';
const KEY = 'globalt.laboratorio.arduino.v1';
const log = (...a) => console.log('✔', ...a);

const browser = await chromium.launch();
const errores = [];

async function contexto(opciones = {}) {
  const ctx = await browser.newContext(opciones);
  ctx.on('page', (p) => p.on('pageerror', (e) => errores.push(e.message)));
  return ctx;
}
async function api(ctx, metodo, ruta, datos, csrf) {
  const r = await ctx.request.fetch(SITIO + '/api/aula' + ruta, {
    method: metodo, data: datos, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
  return { status: r.status(), json: r.status() === 204 ? null : await r.json() };
}
async function cuenta(ctx, nombre, inscribir = true) {
  const correo = `${nombre}.${sufijo}@example.com`;
  const { json } = await api(ctx, 'POST', '/registro', { nombre: 'Estudiante ' + nombre, correo, clave: CLAVE });
  if (inscribir) await api(ctx, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  return { correo, csrf: json.csrf };
}
async function entrar(ctx, correo) {
  return (await api(ctx, 'POST', '/sesion', { correo, clave: CLAVE })).json.csrf;
}
async function abrir(ctx, pagina) {
  const p = pagina || await ctx.newPage();
  if (pagina) await p.reload(); else await p.goto(LAB);
  await p.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent)
    || document.querySelector('#cuenta').hidden);
  return p;
}
const estado = (p) => p.textContent('#cuenta-estado');
const codigo = (p) => p.inputValue('.code-editor__input');
async function escribirYGuardar(p, texto, esperado = /Guardado en tu cuenta\./) {
  await p.locator('.code-editor__input').fill(texto);
  await p.click('#btn-save');
  await p.waitForFunction((re) => new RegExp(re).test(document.querySelector('#cuenta-estado').textContent)
    || !document.querySelector('#cuenta-eleccion').hidden, esperado.source);
}
const local = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').lessons?.['arduino-led-serie'] || {}, KEY);
const remoto = async (ctx) => (await api(ctx, 'GET', '/borradores/arduino-led-serie')).json.borrador;

// 1. Sin sesión: aviso discreto y guardado local intacto.
const anon = await contexto();
let p = await abrir(anon);
assert.match(await estado(p), /Entra en el aula/);
await p.locator('.code-editor__input').fill('// anónimo');
await p.click('#btn-save');
assert.equal((await local(p)).code, '// anónimo');
log('sin sesión: aviso y guardado local');

// 2. Sin inscripción: no se guarda en la cuenta.
const sinCurso = await contexto();
await cuenta(sinCurso, 'sincurso', false);
p = await abrir(sinCurso);
assert.match(await estado(p), /Inscríbete en el curso/);
log('sin inscripción: aviso');

// 3. Estudiante A guarda; B no ve nada de A y guarda lo suyo.
const ctxA = await contexto();
const A = await cuenta(ctxA, 'a');
const pA = await abrir(ctxA);
assert.match(await estado(pA), /aún no tiene copia/);
const progresoAntes = await pA.textContent('#progress-state');
await escribirYGuardar(pA, '// código de A\nvoid setup() {}\nvoid loop() {}\n');
assert.equal((await remoto(ctxA)).codigo, '// código de A\nvoid setup() {}\nvoid loop() {}\n');
assert.equal((await local(pA)).code, '// código de A\nvoid setup() {}\nvoid loop() {}\n');
assert.equal(await pA.textContent('#progress-state'), progresoAntes);   // guardar no aprueba el reto
assert.equal((await local(pA)).completedAt, undefined);

const ctxB = await contexto();
await cuenta(ctxB, 'b');
const pB = await abrir(ctxB);
assert.match(await estado(pB), /aún no tiene copia/);
assert.doesNotMatch(await codigo(pB), /código de A/);
await escribirYGuardar(pB, '// código de B');
assert.equal((await remoto(ctxA)).codigo.startsWith('// código de A'), true);
assert.equal((await remoto(ctxB)).codigo, '// código de B');
log('aislamiento entre estudiantes A y B');

// 4. Cerrar sesión: el código local sigue; luego, en otro navegador, se recupera de la cuenta.
assert.equal((await api(ctxA, 'DELETE', '/sesion', undefined, A.csrf)).status, 204);
await abrir(ctxA, pA);
assert.match(await estado(pA), /Entra en el aula/);
assert.match(await codigo(pA), /código de A/);
const ctxA2 = await contexto(devices['Pixel 5']);   // otro navegador (móvil)
await entrar(ctxA2, A.correo);
const pA2 = await abrir(ctxA2);
assert.match(await estado(pA2), /Código recuperado de tu cuenta/);
assert.match(await codigo(pA2), /código de A/);
assert.match((await local(pA2)).code, /código de A/);
log('recuperación tras cerrar sesión, desde otro navegador');

// 5. Versiones distintas: nunca se reemplaza en silencio; el estudiante elige.
await escribirYGuardar(pA2, '// A desde el móvil');
A.csrf = await entrar(ctxA, A.correo);
await abrir(ctxA, pA);   // recarga: el borrador local era «código de A»
assert.equal(await pA.isVisible('#cuenta-eleccion'), true);
assert.match(await codigo(pA), /código de A/);
if (SHOTS) await pA.locator('#editor-zone').screenshot({ path: `${SHOTS}/eleccion.png` });
await pA.click('#btn-usar-cuenta');
assert.equal(await codigo(pA), '// A desde el móvil');
assert.match((await local(pA)).backupCode, /código de A/);   // la versión local queda como respaldo
assert.match(await estado(pA), /versión de tu cuenta/);
log('elección explícita: usar la versión de la cuenta (respaldo local conservado)');

// 6. Conflicto al guardar: el otro navegador tenía una versión vieja.
await escribirYGuardar(pA, '// A portátil v3');
await escribirYGuardar(pA2, '// A móvil sobre versión vieja');
assert.equal(await pA2.isVisible('#cuenta-eleccion'), true);
assert.equal((await remoto(ctxA2)).codigo, '// A portátil v3');           // no se sobrescribió
assert.equal((await local(pA2)).code, '// A móvil sobre versión vieja');  // pero sí se guardó localmente
if (SHOTS) await pA2.screenshot({ path: `${SHOTS}/conflicto-movil.png` });
await pA2.click('#btn-usar-local');
await pA2.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
assert.equal((await remoto(ctxA2)).codigo, '// A móvil sobre versión vieja');
assert.equal((await local(pA2)).backupCode, '// A portátil v3');                // la versión de la cuenta queda de respaldo
log('conflicto al guardar: elección «usar la de este navegador»');

// 7. Fallo de conexión: queda local, aparece «Reintentar» y funciona al volver la red.
await pA2.route('**/api/aula/borradores/**', (r) => r.abort('internetdisconnected'));
await escribirYGuardar(pA2, '// sin red', /No se pudo guardar/);
assert.equal(await pA2.isVisible('#btn-cuenta-reintentar'), true);
assert.equal((await local(pA2)).code, '// sin red');
assert.notEqual((await remoto(ctxA2)).codigo, '// sin red');
await pA2.click('#btn-cuenta-reintentar');
await pA2.waitForFunction(() => /No se pudo guardar/.test(document.querySelector('#cuenta-estado').textContent));
await pA2.unroute('**/api/aula/borradores/**');
await pA2.click('#btn-cuenta-reintentar');
await pA2.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
assert.equal((await remoto(ctxA2)).codigo, '// sin red');
assert.equal(await pA2.isVisible('#btn-cuenta-reintentar'), false);
log('fallo de conexión: guardado local, reintento correcto');

// 8. Al abrir sin conexión con el aula: aviso con reintento; el código local no se toca.
const p3 = await ctxA2.newPage();
await p3.route('**/api/aula/**', (r) => r.abort('internetdisconnected'));
await p3.goto(LAB);
await p3.waitForFunction(() => /No se pudo conectar/.test(document.querySelector('#cuenta-estado').textContent));
assert.equal(await codigo(p3), '// sin red');
await p3.unroute('**/api/aula/**');
await p3.click('#btn-cuenta-reintentar');
await p3.waitForFunction(() => /Sincronizado con tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
log('apertura sin conexión: reintento y sincronización');

// 9. Código demasiado largo para la cuenta: aviso claro, guardado local.
await escribirYGuardar(p3, '// ' + 'ñ'.repeat(11000), /demasiado largo/);
assert.equal((await local(p3)).code.length, 11003);
log('límite de tamaño: aviso y guardado local');

// 10. Sitio sin aula (dominio público): el bloque de cuenta no aparece.
const pub = await (await contexto()).newPage();
await pub.route('**/api/aula/**', (r) => r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' }));
await pub.goto(LAB);
await pub.waitForTimeout(500);
assert.equal(await pub.isVisible('#cuenta'), false);
log('sin aula en el sitio: sin mensajes de cuenta');

assert.deepEqual(errores, []);
await browser.close();
console.log('Todas las comprobaciones del borrador en la cuenta pasaron.');
