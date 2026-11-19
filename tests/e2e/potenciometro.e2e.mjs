// Prueba manual de extremo a extremo de la lección 6 «Potenciómetro y PWM» (2.4 de la ruta): ADC emulado con
// potenciómetro interactivo (teclado, ratón y dedo), medidor de D9, guion del reto, evaluación, borradores y móvil.
// No la ejecuta CI: necesita Chromium y el compilador (ver services/compilador-arduino/README.md).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/potenciometro.e2e.mjs
// Opcional: AULA_SITIO=http://127.0.0.1:8180 (API del aula ya actualizada, mismo origen): borrador en la cuenta.
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
const IDS = ['arduino-led-serie', 'arduino-protoboard-semaforo', 'arduino-pwm-brillo', 'arduino-boton-entrada', 'arduino-boton-flanco'];
const L6 = 'arduino-potenciometro-pwm';
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
const volts = (p) => p.textContent('.pot-ctl__volts');
const meter = (p) => p.textContent('.pwm-meter__value');
async function run(p) {
  await p.click('#btn-run');
  await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 20000 });
}
const waitAdc = (p, value) => p.waitForFunction((v) => document.querySelector('.pot-ctl__adc').textContent.endsWith(': ' + v), String(value), { timeout: 5000 });
const waitMeter = (p, value) => p.waitForFunction((v) => document.querySelector('.pwm-meter__value').textContent === v, value, { timeout: 5000 });
async function check(p, timeout = 60000) {
  await p.click('#btn-check');
  await p.waitForFunction(() => /Reto superado|Todavía no|necesita/.test(document.querySelector('#eval-result').textContent), null, { timeout });
  return p.textContent('#eval-result');
}

// ---------- 1. Escritorio: teclado y ratón, ADC real, PWM medido, guion y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L6);
  assert.match(await p.textContent('.lab-top__course'), /Lección 6/);
  assert.equal(await p.locator('.lesson-picker__list a').count(), 15);
  assert.match(await p.textContent('.lesson-picker__prev'), /Lección 3.*Lección 4/);
  assert.equal(await p.locator('#circuit svg .c-pot').count(), 1);
  assert.equal(await p.getAttribute('#pot-range', 'aria-valuetext'), '0,00 voltios');

  // Código inicial: imprime analogRead(A0). Teclado: Fin = 5 V, Inicio = 0 V, Re Pág = +0,5 V, flecha = +0,05 V.
  await run(p);
  await p.focus('#pot-range');
  await p.keyboard.press('End');
  assert.equal(await volts(p), '5,00 V');
  await waitAdc(p, 1023);
  await p.waitForFunction(() => /A0 = 1023/.test(document.querySelector('#monitor').textContent), null, { timeout: 3000 });
  await p.keyboard.press('Home');
  await waitAdc(p, 0);
  for (let i = 0; i < 5; i++) await p.keyboard.press('PageUp');
  assert.equal(await volts(p), '2,50 V');
  await waitAdc(p, 512);
  await p.keyboard.press('ArrowLeft');
  assert.equal(await volts(p), '2,45 V');
  await waitAdc(p, 501);
  assert.equal(await p.getAttribute('#pot-range', 'aria-valuetext'), '2,45 voltios');
  log('teclado: Fin/Inicio/Re Pág/flecha mueven A0; analogRead del programa compilado da 1023, 0, 512 y 501');

  // Ratón: un clic a un cuarto del recorrido ≈ 1,25 V.
  const box = await p.locator('#pot-range').boundingBox();
  await p.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  const v = parseFloat((await volts(p)).replace(',', '.'));
  assert.ok(v > 1 && v < 1.5, `ratón: ${v} V`);
  await waitAdc(p, Math.min(1023, Math.floor(v / 5 * 1024)));
  log(`ratón: clic al 25 % del control → ${v} V y la lectura correspondiente`);

  // Solución: el brillo de D9 se mide con PWM (0 %, 25 %, 50 %, 100 %).
  await setCode(p, fx('pot-solucion'));
  await run(p);
  await p.focus('#pot-range');
  await p.keyboard.press('Home');
  await waitMeter(p, '0 %');
  assert.equal(await p.locator('.c-led.is-on').count(), 0);
  for (const [presses, pct] of [[25, '25 %'], [25, '50 %']]) {
    for (let i = 0; i < presses; i++) await p.keyboard.press('ArrowRight');
    await waitMeter(p, pct);
    assert.match(await p.textContent('.pwm-meter__freq'), /PWM a 490 Hz/);
  }
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/pot-escritorio.png` });
  await p.keyboard.press('End');
  await waitMeter(p, '100 %');
  assert.match(await p.textContent('.pwm-meter__freq'), /salida continua/);
  assert.equal(await p.locator('.c-led.is-on').count(), 1);
  log('solución: D9 medido 0 %, 25 %, 50 % (PWM a 490 Hz) y 100 % según A0');

  // Guion del reto en tiempo real: el control se mueve solo hasta 5 V.
  await p.click('#btn-clear');
  await p.locator('#btn-check').focus();   // el control no tiene el foco: el guion puede moverlo
  await p.click('.pot-ctl__script');
  await p.waitForFunction(() => document.querySelector('.pot-ctl__volts').textContent === '5,00 V', null, { timeout: 12000 });
  await p.waitForFunction(() => /Lectura: 1023/.test(document.querySelector('#monitor').textContent), null, { timeout: 5000 });
  assert.match(await p.textContent('#monitor'), /Lectura: 0\n[\s\S]*Lectura: 256\n[\s\S]*Lectura: 512\n/);
  await p.click('#btn-stop');
  log('«Reproducir guion del reto»: 0 V → 1,25 V → 2,5 V → 5 V en tiempo real, con sus lecturas');

  // Evaluación.
  const t0 = Date.now();
  assert.match(await check(p), /^Reto superado/);
  const ms = Date.now() - t0;
  assert.ok((await stored(p))[L6].completedAt);
  for (const [name, re] of [['pot-sin-escala', /0–255/], ['pot-lento', /tarda demasiado/], ['pot-invertido', /invertido/], ['pot-otro-canal', /¿lees el canal A0\?/], ['pot-ritmo', /se esperan 250 ms/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log(`reto: la solución aprueba (${ms} ms con compilación); sin escala, lento, invertido, otro canal y ritmo suspenden con su explicación`);
  await ctx.close();
}

// ---------- 2. Borradores locales y cambio de lección ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, 'arduino-boton-flanco');
  await setCode(p, '// contador');
  await p.click('#btn-save');
  await open(p, L6);
  await setCode(p, '// mi potenciómetro');
  if (!(await p.locator('.lesson-picker__box').evaluate((d) => d.open))) await p.click('.lesson-picker__box > summary');
  await p.click('.lesson-picker__list a[data-lesson="arduino-boton-flanco"]');
  await p.click('#switch-dialog button[value="save"]');
  await p.waitForURL(/leccion=arduino-boton-flanco/);
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await code(p), '// contador');
  const s = await stored(p);
  assert.equal(s[L6].code, '// mi potenciómetro');
  for (const id of IDS.filter((i) => i !== 'arduino-boton-flanco')) assert.equal(s[id]?.code, undefined, id);
  log('borradores locales: la lección 6 guarda el suyo; «Guardar y cambiar» y la lección 5 intactos');
  await ctx.close();
}

// ---------- 3. Móvil: arrastre con el dedo, sin desbordamiento ----------
for (const device of ['Pixel 7', 'iPhone 13']) {
  const ctx = await context({ ...devices[device] });
  const m = await ctx.newPage();
  await open(m, L6);
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), device);
  const w = m.viewportSize().width;
  for (const sel of ['#circuit svg', '#pot-range', '.pwm-meter']) {
    const b = await m.locator(sel).boundingBox();
    assert.ok(b.x >= 0 && b.x + b.width <= w, `${device} ${sel}`);
  }
  assert.ok((await m.locator('#pot-range').boundingBox()).height >= 44, 'objetivo táctil de al menos 44 px');
  await setCode(m, fx('pot-solucion'));
  await run(m);
  await m.locator('#pot-range').scrollIntoViewIfNeeded();
  const b = await m.locator('#pot-range').boundingBox();
  const y = b.y + b.height / 2;
  const cdp = await ctx.newCDPSession(m);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 4, y }] });
  for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 4 + (b.width - 8) * k / 10, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await m.waitForFunction(() => document.querySelector('.pot-ctl__volts').textContent === '5,00 V', null, { timeout: 3000 });
  await waitAdc(m, 1023);
  await waitMeter(m, '100 %');
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/pot-movil-${device.replace(/\s/g, '-')}.png` });
  log(`móvil (${device}): sin desbordamiento; arrastrar con el dedo lleva A0 a 5 V y D9 al 100 %`);
  await ctx.close();
}

// ---------- 4. Cuenta del aula: borrador independiente (opcional) ----------
if (SITIO) {
  const LABA = SITIO + '/games/laboratorio-arduino/index.html';
  const sufijo = Date.now().toString(36);
  async function api(ctx, method, path, data, csrf) {
    const r = await ctx.request.fetch(SITIO + '/api/aula' + path, { method, data, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
    return { status: r.status(), json: r.status() === 204 ? null : await r.json() };
  }
  const remote = async (ctx, id) => (await api(ctx, 'GET', '/borradores/' + id)).json.borrador;
  const ctxA = await context();
  const correo = `pot.${sufijo}@example.com`;
  const { json } = await crearCuenta(ctxA, SITIO, { nombre: 'Estudiante pot', correo, clave: 'clave-ficticia-e2e-1' });
  await api(ctxA, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  // Borradores previos en dos lecciones anteriores: no deben cambiar.
  await api(ctxA, 'PUT', '/borradores/arduino-led-serie', { codigo: '// l1' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/arduino-boton-flanco', { codigo: '// l5' }, json.csrf);
  const pa = await ctxA.newPage();
  await pa.goto(`${LABA}?leccion=${L6}`);
  await pa.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
  assert.match(await pa.textContent('#cuenta-estado'), /aún no tiene copia/);
  await setCode(pa, fx('pot-solucion'));
  await pa.click('#btn-save');
  await pa.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
  assert.match(await check(pa), /^Reto superado/);   // compila por la API del aula
  assert.equal((await remote(ctxA, L6)).codigo, fx('pot-solucion'));
  assert.equal((await remote(ctxA, 'arduino-led-serie')).codigo, '// l1');
  assert.equal((await remote(ctxA, 'arduino-boton-flanco')).codigo, '// l5');
  for (const id of ['arduino-protoboard-semaforo', 'arduino-pwm-brillo', 'arduino-boton-entrada']) assert.equal(await remote(ctxA, id), null, id);
  const ctxB = await context();
  const otro = await crearCuenta(ctxB, SITIO, { nombre: 'Otro', correo: `pot.otro.${sufijo}@example.com`, clave: 'clave-ficticia-e2e-2' });
  await api(ctxB, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, otro.json.csrf);
  assert.equal(await remote(ctxB, L6), null);
  const ctxC = await context(devices['Pixel 7']);
  await api(ctxC, 'POST', '/sesion', { correo, clave: 'clave-ficticia-e2e-1' });
  const pc = await ctxC.newPage();
  await pc.goto(`${LABA}?leccion=${L6}`);
  await pc.waitForFunction(() => /Código recuperado de tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  assert.equal(await code(pc), fx('pot-solucion'));
  log('cuenta: borrador propio de la lección 6, aislado por estudiante; los anteriores intactos; compilación por el aula; recuperación en móvil');
  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
}

assert.deepEqual(errors, []);
await browser.close();
log('sin errores de JavaScript en la página');
