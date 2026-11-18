// Prueba manual de extremo a extremo: progreso del curso sincronizado por estudiante (aula + laboratorio).
// No la ejecuta CI: necesita Chromium, la API del aula con PostgreSQL, el compilador y el sitio en el mismo origen.
// Uso: AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/aula-progreso.e2e.mjs   (AULA_SHOTS=carpeta para capturas)
// Crea cuentas ficticias @example.com. El registro abierto solo se usa en el banco local para crearlas.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { crearCuenta } from './cuenta-prueba.mjs';   // alta de adulto con el buzón de pruebas

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const SITIO = (process.env.AULA_SITIO || 'http://127.0.0.1:8180').replace(/\/$/, '');
const AULA = SITIO + '/aula/index.html';
const LAB = SITIO + '/games/laboratorio-arduino/index.html';
const SHOTS = process.env.AULA_SHOTS || '';
const KEY = 'globalt.laboratorio.arduino.v1';
const PREFIJO = 'globalt.aula.progreso-pendiente.v1.';
const CLAVE = 'clave-ficticia-e2e-1';
const L1 = 'arduino-led-serie';
const L2 = 'arduino-protoboard-semaforo';
const sufijo = Date.now().toString(36);
const log = (...a) => console.log('✔', ...a);
const SOLUCION = `const int LED = 13;
int latidos = 0;
void setup() { pinMode(LED, OUTPUT); Serial.begin(9600); }
void loop() {
  latidos++;
  digitalWrite(LED, HIGH); Serial.print("Latido "); Serial.println(latidos); delay(200);
  digitalWrite(LED, LOW); delay(800);
}
`;

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
// Cuentas creadas en un contexto aparte (no dejan sesión en los navegadores de la prueba).
const creador = await contexto();
async function cuenta(nombre) {
  const correo = `prog-${nombre}.${sufijo}@example.com`;
  const { json } = await crearCuenta(creador, SITIO, { nombre: 'Estudiante ' + nombre, correo, clave: CLAVE });
  await api(creador, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  await api(creador, 'DELETE', '/sesion', null, json.csrf);
  return correo;
}
/** Progreso de la cuenta con sesión en ese contexto (lo que guarda el servidor). */
async function servidor(ctx) {
  const { json } = await api(ctx, 'GET', '/mis-cursos');
  const p = json.cursos.find((c) => c.id === 'course-arduino').progreso;
  return { ultima: p.ultima, l: Object.fromEntries(p.lecciones.map((x) => [x.leccion_id, x])) };
}
async function entrarAula(p, correo) {
  await p.goto(AULA);
  await p.waitForSelector('#form-entrar:not([hidden])');
  await p.fill('#form-entrar [name=correo]', correo);
  await p.fill('#form-entrar [name=clave]', CLAVE);
  await p.click('#form-entrar button[type=submit]');
  await p.waitForSelector('#mis-cursos .curso--progreso');
}
async function salirAula(p) {
  await p.click('#btn-salir');
  await p.waitForSelector('#vista-acceso:not([hidden])');
}
const estados = (p) => p.$$eval('#mis-cursos .leccion', (ls) => Object.fromEntries(ls.map((l) => [l.dataset.leccion, l.dataset.estado])));
async function abrirLab(p, leccion) {
  await p.goto(`${LAB}?leccion=${leccion}`);
  await p.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent) || document.querySelector('#cuenta').hidden);
}
// Espera a que la cola de la cuenta quede vacía y el último envío se confirme.
const esperarSync = (p) => p.waitForFunction((pre) => /Avance guardado en tu cuenta/.test(document.querySelector('#progreso-cuenta').textContent)
  && !Object.keys(localStorage).some((k) => k.startsWith(pre)), PREFIJO, { timeout: 15000 });
async function comprobar(p) {
  await p.click('#btn-check');
  await p.waitForFunction(() => /Reto superado|Todavía no|necesita/.test(document.querySelector('#eval-result .eval__title, #eval-result p')?.textContent || ''), null, { timeout: 90000 });
  return p.textContent('#eval-result');
}
const colas = (p) => p.evaluate((pre) => Object.keys(localStorage).filter((k) => k.startsWith(pre)).map((k) => [k, JSON.parse(localStorage.getItem(k))]), PREFIJO);
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const A = await cuenta('ana');
const B = await cuenta('beto');

// 1. Aula de A (escritorio): 15 lecciones «Sin comenzar» y «Continuar» → lección 1.
const ctxA = await contexto({ viewport: { width: 1280, height: 900 } });
const aulaA = await ctxA.newPage();
await entrarAula(aulaA, A);
let est = await estados(aulaA);
assert.equal(Object.keys(est).length, 15);
assert.ok(Object.values(est).every((e) => e === 'sin-comenzar'));
assert.match(await aulaA.getAttribute('#btn-continuar', 'href'), new RegExp(`leccion=${L1}$`));
assert.match(await aulaA.textContent('.curso--progreso'), /0 de 15/);
assert.match(await aulaA.textContent('.nota--progreso'), /no es una evaluación verificada por el servidor/);
log('aula: 15 lecciones «Sin comenzar» y «Continuar» a la lección 1');

// 2. Leer, cambiar de paso, guardar código, compilar y pedir pista: «En curso», nunca «Completada».
const labA = await ctxA.newPage();
await abrirLab(labA, L1);
await labA.click('.steps__btn[data-step="2"]');
await labA.click('.steps__btn[data-step="3"]');
await esperarSync(labA);
await labA.locator('.code-editor__input').fill('void setup() {}\nvoid loop() {}\n');
await labA.click('#btn-save');
await labA.waitForFunction(() => /Guardado en tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
await labA.click('#btn-compile');
await labA.waitForFunction(() => /Compilado|errores/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
await labA.click('[data-act="hint"]').catch(() => {});
await labA.waitForTimeout(500);
let s = await servidor(ctxA);
assert.equal(s.ultima, L1);
assert.equal(s.l[L1].estado, 'en-curso');
assert.equal(s.l[L1].paso, 3);
assert.deepEqual(s.l[L1].vistos, [0, 2, 3]);
assert.equal(s.l[L1].completada_en, null);
assert.match(await labA.textContent('#progress-state'), /Reto pendiente en tu cuenta/);
assert.match(await labA.textContent('#progress-where'), /registro declarativo/);
log('leer, guardar, compilar y pedir pista: «En curso» con paso 4 y sin completar');

// 3. Solo superar el evaluador completa la lección.
await labA.locator('.code-editor__input').fill('void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); }\n');
assert.match(await comprobar(labA), /Todavía no/);
await labA.waitForTimeout(300);
assert.equal((await servidor(ctxA)).l[L1].completada_en, null);
await labA.locator('.code-editor__input').fill(SOLUCION);
assert.match(await comprobar(labA), /Reto superado/);
await esperarSync(labA);
s = await servidor(ctxA);
assert.equal(s.l[L1].estado, 'completada');
assert.ok(s.l[L1].completada_en);
assert.match(await labA.textContent('#progress-state'), /Reto superado.*registrado en tu cuenta/);
assert.match(await labA.textContent(`.lesson-picker__list a[data-lesson="${L1}"]`), /Superado/);
// Con cuenta, el registro local sin cuenta no se toca (separación en navegadores compartidos).
assert.equal((await labA.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"lessons":{}}').lessons))[L1]?.completedAt, undefined, KEY);
log('evaluador fallido no completa; superado → «Completada» en la cuenta (declarativo) sin tocar el registro local');

// 4. Guardados repetidos: muchos cambios de paso → una fila por lección, sin duplicados ni retrocesos.
for (const n of [0, 1, 2, 3, 4, 5, 4, 5]) await labA.click(`.steps__btn[data-step="${n}"]`);
await esperarSync(labA);
s = await servidor(ctxA);
assert.equal(Object.keys(s.l).length, 1);
assert.equal(s.l[L1].paso, 5);
assert.deepEqual(s.l[L1].vistos, [0, 1, 2, 3, 4, 5]);
assert.equal(s.l[L1].estado, 'completada');
assert.deepEqual(await colas(labA), []);   // cola vacía tras confirmar
log('guardados repetidos: una fila, paso más reciente, reto conservado y cola vacía');

// 5. Otro navegador (móvil): mismo progreso, el laboratorio abre en el paso guardado.
const ctxA2 = await contexto({ ...devices['Pixel 7'] });
const aulaA2 = await ctxA2.newPage();
await entrarAula(aulaA2, A);
est = await estados(aulaA2);
assert.equal(est[L1], 'completada');
assert.match(await aulaA2.textContent('.curso--progreso'), /1 de 15/);
assert.match(await aulaA2.getAttribute('#btn-continuar', 'href'), new RegExp(`leccion=${L2}$`));
assert.ok(await sinDesborde(aulaA2));
if (SHOTS) await aulaA2.screenshot({ path: `${SHOTS}/progreso-aula-movil.png`, fullPage: true });
await aulaA2.click('#btn-continuar');
await aulaA2.waitForURL(new RegExp(`leccion=${L2}`));
await aulaA2.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
await esperarSync(aulaA2);
assert.equal((await servidor(ctxA2)).ultima, L2);
await abrirLab(aulaA2, L1);
await aulaA2.waitForFunction(() => document.querySelector('.steps__btn[data-step="5"]')?.getAttribute('aria-current') === 'step');
assert.match(await aulaA2.textContent('#progress-state'), /Reto superado/);
assert.ok(await sinDesborde(aulaA2));
if (SHOTS) await aulaA2.screenshot({ path: `${SHOTS}/progreso-lab-movil.png` });
log('otro navegador (móvil): estados, «Continuar» a la lección 2 y paso 6 recuperado en la lección 1');

// 6. Navegador compartido: progreso local previo sin cuenta + A cierra sesión + B entra.
const ctxS = await contexto({ viewport: { width: 1280, height: 900 } });
const pS = await ctxS.newPage();
await pS.goto(LAB);
await pS.evaluate((k) => localStorage.setItem(k, JSON.stringify({ lessons: {
  'arduino-pwm-brillo': { completedAt: '2026-01-01T00:00:00.000Z', step: 3, seen: [0, 1, 2, 3] } } })), KEY);
await entrarAula(pS, A);
assert.equal((await estados(pS))['arduino-pwm-brillo'], 'sin-comenzar');   // lo local no se atribuye a A
const labS = await ctxS.newPage();
await abrirLab(labS, 'arduino-pwm-brillo');
await esperarSync(labS);
assert.match(await labS.textContent('#progress-state'), /Reto pendiente en tu cuenta/);
assert.equal(await labS.getAttribute('.steps__btn[data-step="0"]', 'aria-current'), 'step');   // paso de la cuenta, no el local
assert.equal((await servidor(ctxS)).l['arduino-pwm-brillo'].completada_en, null);
// A cierra sesión en el aula: la pestaña del laboratorio deja de registrar para A.
await salirAula(pS);
await labS.waitForFunction(() => /La sesión del aula cambió/.test(document.querySelector('#progreso-cuenta').textContent));
const posts = [];
labS.on('request', (r) => { if (r.url().endsWith('/api/aula/mis-cursos') && r.method() === 'POST') posts.push(r.url()); });
await entrarAula(pS, B);
assert.ok(Object.values(await estados(pS)).every((e) => e === 'sin-comenzar'));   // B no ve nada de A
await labS.click('.steps__btn[data-step="2"]');
await labS.waitForTimeout(2500);
assert.deepEqual(posts, []);
assert.match(await labS.textContent('#progress-state'), /Reto superado/);   // vuelve a mostrar el registro local sin cuenta
// B abre el laboratorio: ve solo su cuenta (sin el «Superado» local ni el de A).
const labB = await ctxS.newPage();
await abrirLab(labB, L1);
await esperarSync(labB);
assert.match(await labB.textContent('#progress-state'), /Reto pendiente en tu cuenta/);
assert.doesNotMatch(await labB.textContent('.lesson-picker__list'), /Superado/);
s = await servidor(ctxS);
assert.deepEqual(Object.keys(s.l), [L1]);
assert.equal(s.l[L1].estado, 'en-curso');
log('navegador compartido: progreso local no atribuido, cierre de sesión detiene la pestaña y B solo ve lo suyo');

// 7. Fallo de red: reto superado sin conexión → cola pendiente de B; reintento correcto e idempotente.
await labB.locator('.code-editor__input').fill(SOLUCION);
await labB.click('#btn-compile');
await labB.waitForFunction(() => /Compilado/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
await labB.route('**/api/aula/**', (r) => r.abort('internetdisconnected'));
assert.match(await comprobar(labB), /Reto superado/);
await labB.waitForFunction(() => /pendiente en este navegador, solo para tu cuenta/.test(document.querySelector('#progreso-cuenta').textContent));
assert.equal(await labB.isVisible('#btn-progreso-reintentar'), true);
assert.match(await labB.textContent('#progress-state'), /Reto superado.*pendiente de sincronizar/);
let q = await colas(labB);
assert.equal(q.length, 1);
assert.ok(!q[0][0].includes('@') && !JSON.stringify(q[0][1]).includes('@'));   // sin correo ni credenciales
assert.equal(q[0][1][L1].completada, true);
await labB.click('#btn-progreso-reintentar');   // sigue sin red: no se pierde nada
await labB.waitForTimeout(800);
assert.equal((await colas(labB)).length, 1);
await labB.unroute('**/api/aula/**');
await labB.click('#btn-progreso-reintentar');
await esperarSync(labB);
s = await servidor(ctxS);
assert.equal(s.l[L1].estado, 'completada');
assert.deepEqual(await colas(labB), []);
assert.equal(await labB.isVisible('#btn-progreso-reintentar'), false);
log('sin red: reto pendiente en la cola de B (sin correo), reintento fallido conserva, reintento correcto sincroniza');

// 8. Cierre de sesión con avance pendiente: se conserva para su cuenta y no lo recibe otra.
await labB.route('**/api/aula/mis-cursos', (r) => (r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue()));
await labB.click('.steps__btn[data-step="4"]');
await labB.waitForFunction(() => /No se pudo guardar tu avance/.test(document.querySelector('#progreso-cuenta').textContent), null, { timeout: 15000 });
q = await colas(labB);
assert.equal(q.length, 1);
const claveB = q[0][0];
await pS.route('**/api/aula/mis-cursos', (r) => (r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue()));
await pS.reload();
await pS.waitForSelector('#mis-cursos .curso--progreso');
assert.match(await pS.textContent('.sincro'), /sin enviar/);
assert.match(await pS.textContent(`.leccion[data-leccion="${L1}"]`), /Sin enviar/);
await salirAula(pS);
assert.match(await pS.textContent('#estado'), /quedan en este navegador solo para tu cuenta/);
await pS.unroute('**/api/aula/mis-cursos');
await labB.unroute('**/api/aula/mis-cursos');
// Entra A en el mismo navegador: no envía ni muestra la cola de B.
await entrarAula(pS, A);
assert.equal((await estados(pS))[L1], 'completada');   // el de A (de su cuenta)
assert.equal(await pS.isVisible('.sincro'), false);
assert.deepEqual((await colas(pS)).map(([k]) => k), [claveB]);
assert.equal((await servidor(ctxS)).l[L1].paso, 5);   // el paso 5 de B no llegó a A
await salirAula(pS);
// B vuelve: su cola se envía al entrar en el aula.
await entrarAula(pS, B);
await pS.waitForFunction(() => document.querySelector('.sincro')?.hidden !== false);
assert.deepEqual(await colas(pS), []);
s = await servidor(ctxS);
assert.equal(s.l[L1].paso, 4);
assert.equal(s.l[L1].estado, 'completada');
log('cierre de sesión con pendiente: se conserva por cuenta, A no lo recibe y B lo sincroniza al volver');

// 9. API anterior (sin progreso en «mis cursos»): el aula muestra la tarjeta de siempre y el laboratorio sigue en local.
const ctxV = await contexto();
const pV = await ctxV.newPage();
await ctxV.route('**/api/aula/mis-cursos', async (r) => {
  if (r.request().method() !== 'GET') return r.fulfill({ status: 405, contentType: 'application/json', body: '{"detail":"Method Not Allowed"}' });
  const resp = await r.fetch();
  const json = await resp.json();
  for (const c of json.cursos) delete c.progreso;
  return r.fulfill({ response: resp, json });
});
await pV.goto(AULA);
await pV.fill('#form-entrar [name=correo]', A);
await pV.fill('#form-entrar [name=clave]', CLAVE);
await pV.click('#form-entrar button[type=submit]');
await pV.waitForSelector('#mis-cursos .curso');
assert.equal(await pV.locator('#mis-cursos a', { hasText: 'Abrir laboratorio' }).count(), 1);
await abrirLab(pV, L2);
await pV.waitForFunction(() => /todavía no guarda el progreso/.test(document.querySelector('#progreso-cuenta').textContent));
assert.match(await pV.textContent('#progress-where'), /solo en este navegador/);
log('API anterior: tarjeta clásica en el aula y registro solo local en el laboratorio');

// 10. Escritorio: capturas y sin desbordamiento.
await aulaA.reload();
await aulaA.waitForSelector('#mis-cursos .curso--progreso');
assert.ok(await sinDesborde(aulaA));
if (SHOTS) {
  await aulaA.screenshot({ path: `${SHOTS}/progreso-aula-escritorio.png`, fullPage: true });
  await labA.screenshot({ path: `${SHOTS}/progreso-lab-escritorio.png` });
}
log('escritorio: panel sin desbordamiento');

assert.deepEqual(errores, []);
await browser.close();
console.log('Todas las comprobaciones del progreso sincronizado pasaron.');
