// Prueba manual de extremo a extremo: recorrido completo del aula privada con compilación real.
// Aula → registro/entrada → inscripción Arduino → primera lección → recuperar borrador → compilar → simular → reto.
// Necesita el piloto (o el Compose de desarrollo) con la API conectada al compilador existente.
// Uso: AULA_SITIO=http://127.0.0.1:8100 node tests/e2e/aula-compilar.e2e.mjs
// Opcional: AULA_PARAR_COMPILADOR=1 detiene y vuelve a arrancar el contenedor globalt-arduino-compiler
// para comprobar el mensaje y la recuperación (solo en un entorno de prueba).
// Crea 3 cuentas ficticias @example.com (respeta AULA_MAX_REGISTROS_IP).
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const SITIO = (process.env.AULA_SITIO || 'http://127.0.0.1:8100').replace(/\/$/, '');
const LAB = SITIO + '/games/laboratorio-arduino/index.html';
const SHOTS = process.env.AULA_SHOTS || '';
const sufijo = Date.now().toString(36);
const CLAVE = 'clave-ficticia-e2e-1';
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

const browser = await chromium.launch();
const errores = [];
async function contexto(opciones = {}) {
  const ctx = await browser.newContext(opciones);
  ctx.on('page', (p) => { p.on('pageerror', (e) => errores.push(e.message)); p.on('dialog', (d) => d.accept()); });
  return ctx;
}
async function api(ctx, metodo, ruta, datos, csrf) {
  const r = await ctx.request.fetch(SITIO + '/api/aula' + ruta, {
    method: metodo, data: datos, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
  return { status: r.status(), json: r.status() === 204 ? null : await r.json().catch(() => null) };
}
async function cuentaApi(ctx, nombre, inscribir = true) {
  const { json } = await api(ctx, 'POST', '/registro', { nombre: 'Estudiante ' + nombre, correo: `${nombre}.${sufijo}@example.com`, clave: CLAVE });
  if (inscribir) await api(ctx, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  return json.csrf;
}
async function abrirLab(p) {
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== ''
    && !/Conectando/.test(document.querySelector('#cuenta-estado').textContent), null, { timeout: 20000 });
}
async function compilar(p) {
  await p.click('#btn-compile');
  await p.waitForFunction(() => { const t = document.querySelector('#status').textContent; return t && !/Compilando/.test(t); }, null, { timeout: 60000 });
  return p.textContent('#status');
}
const sql = (q) => execSync(`docker exec globalt-aula-piloto-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "${q}"'`).toString().trim();
const borradoresAntes = sql('SELECT usuario_id, version, md5(codigo) FROM borradores ORDER BY 1');
const usuariosAntes = Number(sql('SELECT count(*) FROM usuarios'));

// 1. Sin sesión: no se compila; mensaje claro y la simulación no arranca.
const anon = await contexto();
let p = await anon.newPage();
await p.goto(LAB);
await abrirLab(p);
assert.equal(await p.textContent('#service'), 'Compilador no disponible');
assert.match(await p.textContent('#status'), /Entra en el aula/);
await p.click('#btn-run');
await p.waitForFunction(() => !/Compilando/.test(document.querySelector('#status').textContent));
assert.match(await p.textContent('#status'), /Entra en el aula/);
assert.equal(await p.textContent('#sim-state'), 'Detenida');
log('sin sesión: no compila y lo explica');

// 2. Sin inscripción.
const sinCurso = await contexto();
await cuentaApi(sinCurso, 'compsincurso', false);
p = await sinCurso.newPage();
await p.goto(LAB);
await abrirLab(p);
assert.match(await p.textContent('#status'), /Inscríbete en el curso de Arduino/);
assert.match(await compilar(p), /Inscríbete/);
log('sin inscripción: no compila y lo explica');

// 3. Recorrido completo por la interfaz del aula (navegador 1): registro, inscripción, laboratorio, guardar.
const ctx1 = await contexto({ viewport: { width: 1400, height: 950 } });
const a = await ctx1.newPage();
await a.goto(SITIO + '/aula/');
await a.waitForSelector('#vista-acceso:not([hidden])');
await a.click('#tab-registro');
await a.fill('#form-registro [name=nombre]', 'Estudiante Recorrido');
await a.fill('#form-registro [name=correo]', `recorrido.${sufijo}@example.com`);
await a.fill('#form-registro [name=clave]', CLAVE);
await a.click('#form-registro button[type=submit]');
await a.waitForSelector('#vista-cursos:not([hidden])');
await a.click('[data-inscribir="course-arduino"]');
await a.waitForSelector('#mis-cursos .curso a');
await Promise.all([a.waitForURL(/laboratorio-arduino/), a.click('#mis-cursos .curso a')]);
await abrirLab(a);
assert.match(await a.textContent('#service'), /Compilador listo · avr-gcc/);
await a.locator('.code-editor__input').fill(SOLUCION);
await a.click('#btn-save');
await a.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
log('aula: registro, inscripción, abrir lección y guardar en la cuenta');

// 4. Otro navegador (móvil): entrar, abrir la lección, recuperar el borrador, compilar, simular y comprobar.
const ctx2 = await contexto(devices['Pixel 5']);
const b = await ctx2.newPage();
await b.goto(SITIO + '/aula/');
await b.waitForSelector('#vista-acceso:not([hidden])');
await b.fill('#form-entrar [name=correo]', `recorrido.${sufijo}@example.com`);
await b.fill('#form-entrar [name=clave]', CLAVE);
await b.click('#form-entrar button[type=submit]');
await b.waitForSelector('#mis-cursos .curso a');
await Promise.all([b.waitForURL(/laboratorio-arduino/), b.click('#mis-cursos .curso a')]);
await abrirLab(b);
assert.match(await b.textContent('#cuenta-estado'), /Código recuperado de tu cuenta/);
assert.equal(await b.inputValue('.code-editor__input'), SOLUCION);
assert.match(await compilar(b), /Compilado: \d+ de 30720 bytes de flash/);
await b.click('#btn-run');
await b.waitForFunction(() => document.querySelector('#monitor').textContent.includes('Latido 2'), null, { timeout: 15000 });
await b.waitForSelector('.c-led.is-on', { timeout: 3000 });
await b.click('#btn-stop');
await b.click('#btn-check');
await b.waitForFunction(() => /Reto superado|Todavía no/.test(document.querySelector('#eval-result').textContent), null, { timeout: 30000 });
assert.match(await b.textContent('#eval-result'), /^Reto superado/);
if (SHOTS) await b.screenshot({ path: `${SHOTS}/recorrido-movil.png`, fullPage: false });
log('otro navegador: recuperar borrador, compilar (real), simular y reto superado');

// 5. CSRF incorrecto o de otra sesión: rechazado por el servidor.
const r403 = await b.evaluate(async () => (await fetch('/api/aula/compilar', { method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'x'.repeat(43) }, body: JSON.stringify({ codigo: 'void setup(){}\nvoid loop(){}' }) })).status);
assert.equal(r403, 403);
log('CSRF incorrecto: 403');

// 6. Límite por estudiante (6 por minuto), también desde otra sesión del mismo estudiante.
let ultimo = '';
for (let i = 0; i < 6 && !/muchas veces/.test(ultimo); i++) ultimo = await compilar(b);
assert.match(ultimo, /Has compilado muchas veces seguidas/);
assert.match(await compilar(a), /Has compilado muchas veces seguidas/);   // la sesión del navegador 1 no lo evita
log('límite por estudiante: mensaje claro, también con otra sesión');

// 7. Compilador detenido y recuperación (solo si se pide; usa una cuenta nueva para no chocar con el límite).
if (process.env.AULA_PARAR_COMPILADOR === '1') {
  const ctx3 = await contexto();
  await cuentaApi(ctx3, 'compcaido');
  const c = await ctx3.newPage();
  await c.goto(LAB);
  await abrirLab(c);
  execSync('docker stop globalt-arduino-compiler', { stdio: 'ignore' });
  assert.match(await compilar(c), /no está disponible en este momento/);
  assert.equal(await c.textContent('#service'), 'Compilador no disponible');
  assert.equal(await c.isDisabled('#btn-compile'), false);   // se puede reintentar
  execSync('docker start globalt-arduino-compiler', { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    try { execSync('curl -fsS --max-time 2 --unix-socket /var/lib/globalt-robotics-lab/run/compilador.sock http://localhost/api/arduino/salud', { stdio: 'ignore' }); break; }
    catch { await c.waitForTimeout(500); }
  }
  assert.match(await compilar(c), /Compilado:/);
  assert.match(await c.textContent('#service'), /Compilador listo/);
  log('compilador detenido: mensaje claro; al volver, compila de nuevo');
}

// 8. Cuentas y borradores previos intactos.
assert.equal(sql('SELECT usuario_id, version, md5(codigo) FROM borradores WHERE usuario_id IN (SELECT usuario_id FROM borradores) ORDER BY 1')
  .split('\n').filter((l) => borradoresAntes.split('\n').includes(l)).length, borradoresAntes ? borradoresAntes.split('\n').length : 0);
assert.ok(Number(sql('SELECT count(*) FROM usuarios')) >= usuariosAntes);
log('cuentas y borradores previos conservados');

assert.deepEqual(errores, []);
await browser.close();
console.log('Recorrido completo del aula con compilación real: OK');
