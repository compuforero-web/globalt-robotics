// Prueba manual de extremo a extremo de las lecciones 12 «Posiciones del servo» y 13 «Barrido sin bloquear» (3.1–3.2 de
// la ruta): librería Servo compilada de verdad, modelo SG90 alimentado por los pulsos reales de D9, LED de D13 a la vez,
// circuito con fuente externa y GND común, retos, borradores independientes y móvil.
// No la ejecuta CI: necesita Chromium y el compilador con Servo (ver services/compilador-arduino/README.md).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/servo.e2e.mjs
// Opcional: AULA_SITIO=http://127.0.0.1:8180 (API del aula ya actualizada, mismo origen): borradores en la cuenta.
//           LAB_SHOTS=carpeta para capturas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { crearCuenta } from './cuenta-prueba.mjs';   // alta de adulto con el buzón de pruebas

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const LAB = process.env.LAB_URL || 'http://localhost:8080/games/laboratorio-arduino/index.html';
const SITIO = (process.env.AULA_SITIO || '').replace(/\/$/, '');
const SHOTS = process.env.LAB_SHOTS || '';
const KEY = 'globalt.laboratorio.arduino.v1';
const L12 = 'arduino-servo-posiciones';
const L13 = 'arduino-servo-barrido';
const L11 = 'arduino-l298n-dos-motores';
const fx = (name) => readFileSync(new URL(`../fixtures/laboratorio/${name}.ino`, import.meta.url), 'utf8');
const log = (...a) => console.log('✔', ...a);

const browser = await chromium.launch();
const errors = [];
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ...options });
  ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  return ctx;
}
async function open(page, id, base = LAB) {
  await page.goto(`${base}?leccion=${id}`);
  await page.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
}
const setCode = (p, code) => p.locator('.code-editor__input').fill(code);
const code = (p) => p.inputValue('.code-editor__input');
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"lessons":{}}').lessons, KEY);
async function run(p) {
  if ((await p.textContent('#sim-state')) === 'En ejecución') {
    await p.click('#btn-stop');
    await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'Detenida');
  }
  await p.click('#btn-run');
  await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 20000 });
}
async function check(p, timeout = 60000) {
  await p.click('#btn-check');
  await p.waitForFunction(() => /Reto superado|Todavía no|necesita/.test(document.querySelector('#eval-result').textContent), null, { timeout });
  return p.textContent('#eval-result');
}
/** Espera (en cada fotograma) a que las lecturas del servo cumplan las expresiones. */
const waitServo = (p, signalRe, angleRe, timeout = 6000) => p.waitForFunction(([s, a]) => {
  const q = (k) => document.querySelector(`.servo-read__${k}`).textContent;
  return new RegExp(s).test(q('signal')) && new RegExp(a).test(q('angle'));
}, [signalRe.source, angleRe.source], { timeout, polling: 'raf' });
const hornAngle = (p) => p.evaluate(() => -Number(/rotate\((-?[\d.]+)\)/.exec(document.querySelector('.c-servo-horn').getAttribute('transform'))[1]));

// ---------- 1. Lección 12 en escritorio: circuito, pulsos reales, orden frente a giro y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L12);
  assert.match(await p.textContent('.lab-top__course'), /Lección 12/);
  assert.equal(await p.locator('.lesson-picker__list a').count(), 15);
  assert.equal(await p.locator('#circuit .c-servo').count(), 1);
  assert.equal(await p.locator('#circuit .c-led').count(), 0);
  const desc = await p.textContent('#circuit-desc');
  for (const re of [/naranja \(señal\) del servo va a D9/, /fuente externa de 5 voltios/, /GND común/, /no alimenta el servo/]) assert.match(desc, re);
  assert.match(await p.textContent('#lesson'), /Fuente separada y GND común/);
  log('lección 12: selector con 15 lecciones; circuito con SG90 en D9, fuente externa de 5 V y GND común descritos');

  // Programa sin Servo: no hay pulsos ni movimiento (no hay animación preparada).
  await setCode(p, 'void setup() {}\nvoid loop() {}\n');
  await run(p);
  await p.waitForTimeout(1500);
  assert.match(await p.textContent('.servo-read__signal'), /sin pulsos|sin configurar/);
  assert.equal(await hornAngle(p), 90);
  log('programa vacío: «sin pulsos» y el brazo quieto');

  // Código inicial: 0° → 90° → 180° cada 2 s; la orden cambia con el pulso y el brazo llega después.
  await setCode(p, fx('pos-ejemplo'));
  await run(p);
  await waitServo(p, /50,0 Hz · pulso de 54\d µs → 0°/, /^0° · quieto$/, 8000);
  await waitServo(p, /pulso de 147\d µs → 90°/, /90° \(girando\)|^90° · quieto$/, 4000);
  await waitServo(p, /pulso de 2[34]\d\d µs → 180°/, /^180° · quieto$/, 4000);
  assert.equal(Math.round(await hornAngle(p)), 180);
  assert.ok(!(await p.locator('.c-servo-target').evaluate((e) => e.hidden)));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/servo-l12-escritorio.png` });
  await p.click('#btn-stop');
  log('código inicial: 50 Hz, 544 µs → 0°, 1472 µs → 90°, 2400 µs → 180°; el brazo gira tras la orden y se detiene en el ángulo');

  await setCode(p, fx('pos-solucion'));
  assert.match(await check(p), /^Reto superado/);
  for (const [name, re] of [['pos-default', /posición por defecto de attach\(\)/], ['pos-analogwrite', /PWM de analogWrite/],
    ['pos-otro-pin', /Hay pulsos cada 20 ms en D10/], ['pos-mensaje-tarde', /imprime el ángulo justo al mover el servo/], ['pos-tiempos', /1460 ms/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log('reto 12: la solución aprueba; posición por defecto, analogWrite, pin equivocado, mensaje tarde y tiempos suspenden');
  await ctx.close();
}

// ---------- 2. Lección 13: barrido y LED a la vez ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L13);
  assert.equal(await p.locator('#circuit .c-servo').count(), 1);
  assert.equal(await p.locator('#circuit .c-led[data-pin="13"]').count(), 1);
  assert.match(await p.textContent('#circuit-desc'), /D13 va por una resistencia de 220 ohmios/);
  await setCode(p, fx('bar-solucion'));
  await run(p);
  await p.waitForTimeout(1200);
  const a1 = await hornAngle(p);
  const ledStates = new Set();
  for (let k = 0; k < 14; k++) {
    ledStates.add(await p.locator('#circuit .c-led').evaluate((e) => e.classList.contains('is-on')));
    await p.waitForTimeout(100);
  }
  const a2 = await hornAngle(p);
  assert.ok(Math.abs(a2 - a1) > 30, `${a1} → ${a2}`);
  assert.equal(ledStates.size, 2);
  await waitServo(p, /50,0 Hz/, /girando/, 2000);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/servo-l13-escritorio.png` });
  log(`solución: el brazo barre (${Math.round(a1)}° → ${Math.round(a2)}° en 1,4 s) mientras el LED de D13 se enciende y apaga`);
  assert.match(await check(p), /^Reto superado/);
  for (const [name, re] of [['bar-ejemplo', /delay\(\) bloquea el loop/], ['bar-led-detenido', /se quedó apagado/], ['bar-rapido', /200 °\/s/], ['bar-saltos', /saltó de 0° a 180°/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log('reto 13: la solución aprueba; barrido con delay (LED bloqueado), LED detenido, barrido rápido y saltos suspenden');
  await ctx.close();
}

// ---------- 3. Borradores locales independientes y cambio de lección ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L11);
  await setCode(p, '// dos motores');
  await p.click('#btn-save');
  await open(p, L12);
  await setCode(p, '// posiciones');
  await p.click('#btn-save');
  await open(p, L13);
  assert.equal(await code(p), fx('bar-ejemplo'));
  await setCode(p, '// barrido');
  if (!(await p.locator('.lesson-picker__box').evaluate((d) => d.open))) await p.click('.lesson-picker__box > summary');
  await p.click(`.lesson-picker__list a[data-lesson="${L12}"]`);
  await p.click('#switch-dialog button[value="save"]');
  await p.waitForURL(new RegExp(`leccion=${L12}`));
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await code(p), '// posiciones');
  const s = await stored(p);
  assert.equal(s[L13].code, '// barrido');
  assert.equal(s[L11].code, '// dos motores');
  assert.equal(s['arduino-led-serie']?.code, undefined);
  log('borradores locales: lecciones 12 y 13 con el suyo; «Guardar y cambiar»; la lección 11 intacta');
  await ctx.close();
}

// ---------- 4. Móvil: sin desbordamiento y servo que responde ----------
for (const device of ['Pixel 7', 'iPhone 13']) {
  const ctx = await context({ ...devices[device] });
  const m = await ctx.newPage();
  for (const id of [L12, L13]) {
    await open(m, id);
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${device} ${id}`);
    const w = m.viewportSize().width;
    for (const sel of ['#circuit svg', '.servo-read', '.pin-strip']) {
      const b = await m.locator(sel).boundingBox();
      assert.ok(b.x >= 0 && b.x + b.width <= w + 0.5, `${device} ${id} ${sel}`);
    }
  }
  await setCode(m, fx('bar-solucion'));
  await m.locator('#btn-run').scrollIntoViewIfNeeded();
  await m.tap('#btn-run');
  await m.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 20000 });
  await waitServo(m, /50,0 Hz/, /girando/, 4000);
  await m.locator('#circuit').scrollIntoViewIfNeeded();
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/servo-movil-${device.replace(/\s/g, '-')}.png` });
  log(`móvil (${device}): lecciones 12–13 sin desbordamiento; tocar Ejecutar mueve el servo`);
  await ctx.close();
}

// ---------- 5. Cuenta del aula: borradores independientes (opcional) ----------
if (SITIO) {
  const LABA = SITIO + '/games/laboratorio-arduino/index.html';
  const sufijo = Date.now().toString(36);
  async function api(ctx, method, path, data, csrf) {
    const r = await ctx.request.fetch(SITIO + '/api/aula' + path, { method, data, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
    return { status: r.status(), json: r.status() === 204 ? null : await r.json() };
  }
  const remote = async (ctx, id) => (await api(ctx, 'GET', '/borradores/' + id)).json.borrador;
  const ctxA = await context();
  const correo = `servo.${sufijo}@example.com`;
  const { json } = await crearCuenta(ctxA, SITIO, { nombre: 'Estudiante servo', correo, clave: 'clave-ficticia-e2e-1' });
  await api(ctxA, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/arduino-led-serie', { codigo: '// l1' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/' + L11, { codigo: '// l11' }, json.csrf);
  const pa = await ctxA.newPage();
  for (const [id, name] of [[L12, 'pos-solucion'], [L13, 'bar-solucion']]) {
    await pa.goto(`${LABA}?leccion=${id}`);
    await pa.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
    assert.match(await pa.textContent('#cuenta-estado'), /aún no tiene copia/, id);
    await setCode(pa, fx(name));
    await pa.click('#btn-save');
    await pa.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
    assert.match(await check(pa), /^Reto superado/, id);   // compila por la API del aula, con Servo
  }
  assert.equal((await remote(ctxA, L12)).codigo, fx('pos-solucion'));
  assert.equal((await remote(ctxA, L13)).codigo, fx('bar-solucion'));
  assert.equal((await remote(ctxA, 'arduino-led-serie')).codigo, '// l1');
  assert.equal((await remote(ctxA, L11)).codigo, '// l11');
  const ctxB = await context();
  const otro = await crearCuenta(ctxB, SITIO, { nombre: 'Otro', correo: `servo.otro.${sufijo}@example.com`, clave: 'clave-ficticia-e2e-2' });
  await api(ctxB, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, otro.json.csrf);
  for (const id of [L12, L13]) assert.equal(await remote(ctxB, id), null, id);
  const ctxC = await context(devices['Pixel 7']);
  await api(ctxC, 'POST', '/sesion', { correo, clave: 'clave-ficticia-e2e-1' });
  const pc = await ctxC.newPage();
  await pc.goto(`${LABA}?leccion=${L13}`);
  await pc.waitForFunction(() => /Código recuperado de tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  assert.equal(await code(pc), fx('bar-solucion'));
  log('cuenta: borradores propios de las lecciones 12 y 13, aislados por estudiante; los anteriores intactos; compilación con Servo por el aula; recuperación en móvil');
  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
}

assert.deepEqual(errors, []);
await browser.close();
log('sin errores de JavaScript en la página');
