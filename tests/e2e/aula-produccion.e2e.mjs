// Prueba manual de extremo a extremo del aula en el dominio público (o en una réplica con TLS).
// Necesita una cuenta creada con «aula-produccion.sh crear-cuenta» (el registro público está cerrado).
// Uso: AULA_CORREO=… AULA_CLAVE=… node tests/e2e/aula-produccion.e2e.mjs
// Réplica local: AULA_RESOLVER=127.0.0.1 (resuelve globalt-robotics.com a esa IP y acepta su certificado de prueba).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const SITIO = 'https://globalt-robotics.com';
const { AULA_CORREO: CORREO, AULA_CLAVE: CLAVE, AULA_RESOLVER: RESOLVER, AULA_SHOTS: SHOTS } = process.env;
assert.ok(CORREO && CLAVE, 'Define AULA_CORREO y AULA_CLAVE');
const log = (...a) => console.log('✔', ...a);
const SOLUCION = `const int LED = 13;
int latidos = 0;
void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}
void loop() {
  latidos++;
  digitalWrite(LED, HIGH);
  Serial.print("Latido ");
  Serial.println(latidos);
  delay(200);
  digitalWrite(LED, LOW);
  delay(800);
}
`;
const browser = await chromium.launch(RESOLVER ? { args: [`--host-resolver-rules=MAP globalt-robotics.com ${RESOLVER},MAP www.globalt-robotics.com ${RESOLVER}`, '--no-proxy-server'] } : {});
const errores = [];
async function contexto(opciones = {}) {
  const ctx = await browser.newContext({ ...opciones, ignoreHTTPSErrors: Boolean(RESOLVER) });
  ctx.on('page', (p) => { p.on('pageerror', (e) => errores.push(e.message)); p.on('dialog', (d) => d.accept()); });
  return ctx;
}
async function entrar(p) {
  await p.goto(SITIO + '/aula/');
  await p.waitForSelector('#vista-acceso:not([hidden]), #vista-cursos:not([hidden])');
  if (await p.isVisible('#vista-cursos')) return;
  await p.fill('#form-entrar [name=correo]', CORREO);
  await p.fill('#form-entrar [name=clave]', CLAVE);
  await p.click('#form-entrar button[type=submit]');
  await p.waitForSelector('#vista-cursos:not([hidden])');
}
async function abrirLab(p) {
  await p.waitForSelector('#mis-cursos .curso a');
  await Promise.all([p.waitForURL(/laboratorio-arduino/), p.click('#mis-cursos .curso a')]);
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== ''
    && !/Conectando/.test(document.querySelector('#cuenta-estado').textContent), null, { timeout: 20000 });
}

// 1. Portada: juegos, robot, Videos oculto y acceso discreto al aula.
const ctx = await contexto({ viewport: { width: 1366, height: 900 } });
const p = await ctx.newPage();
await p.goto(SITIO + '/');
await p.waitForFunction(() => document.querySelectorAll('#games-grid .card').length > 0);
await p.waitForSelector('#nav-menu [data-aula-link]:not([hidden])', { timeout: 10000 });
assert.equal(await p.isVisible('#videos'), false);
assert.equal(await p.locator('.robot-scene__canvas').isVisible(), true);
await p.locator('[data-play]').first().click();
await p.frameLocator('#game-modal iframe').locator('body').waitFor();
await p.click('#game-modal [data-close]');
log('portada: juegos, robot y enlace «Aula» (backend disponible)');

// 2. Aula: registro público cerrado; acceso con cuenta creada por consola; cookies seguras.
await p.goto(SITIO + '/aula/');
await p.waitForSelector('#vista-acceso:not([hidden])');
assert.equal(await p.isVisible('#tab-registro'), false);
assert.equal(await p.isVisible('#registro-cerrado'), true);
await entrar(p);
const galleta = (await ctx.cookies()).find((c) => c.name === 'aula_sesion');
assert.ok(galleta && galleta.secure && galleta.httpOnly && galleta.sameSite === 'Strict' && galleta.path === '/api/aula');
await p.waitForSelector('#mis-cursos .curso a, [data-inscribir="course-arduino"]');
if (await p.isVisible('[data-inscribir="course-arduino"]')) {
  await p.click('[data-inscribir="course-arduino"]');
}
log('aula: registro cerrado, acceso, cookie Secure/HttpOnly/SameSite=Strict, inscripción');

// 3. Laboratorio: guardar en la cuenta, compilar (real), simular y comprobar el reto.
await abrirLab(p);
assert.match(await p.textContent('#service'), /Compilador listo/);
await p.locator('.code-editor__input').fill(SOLUCION);
await p.click('#btn-save');
await p.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
await p.click('#btn-run');
await p.waitForFunction(() => document.querySelector('#monitor').textContent.includes('Latido 2'), null, { timeout: 30000 });
await p.click('#btn-stop');
await p.click('#btn-check');
await p.waitForFunction(() => /Reto superado|Todavía no/.test(document.querySelector('#eval-result').textContent), null, { timeout: 40000 });
assert.match(await p.textContent('#eval-result'), /^Reto superado/);
const directo = await p.evaluate(async () => (await fetch('/api/arduino/compilar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
assert.equal(directo, 403);
log('laboratorio: borrador en la cuenta, compilación real, simulación y reto; compilador directo bloqueado (403)');

// 4. Otro navegador (móvil): recupera el borrador.
const movil = await contexto(devices['Pixel 5']);
const m = await movil.newPage();
await entrar(m);
await abrirLab(m);
assert.match(await m.textContent('#cuenta-estado'), /Código recuperado de tu cuenta|Sincronizado/);
assert.equal(await m.inputValue('.code-editor__input'), SOLUCION);
if (SHOTS) await m.screenshot({ path: `${SHOTS}/produccion-movil.png` });
log('móvil: borrador recuperado');

// 5. Administración bloqueada y aula solo por HTTPS.
const estados = await p.evaluate(async () => Promise.all(['/admin', '/admin.html', '/api/aula/otra', '/api/arduino/salud']
  .map(async (r) => (await fetch(r, { cache: 'no-store' })).status)));
assert.deepEqual(estados, [403, 403, 403, 403]);
log('administración y rutas no previstas de la API bloqueadas');

assert.deepEqual(errores, []);
await browser.close();
console.log('Aula en el dominio: OK');
