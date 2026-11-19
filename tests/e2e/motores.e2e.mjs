// Prueba manual de extremo a extremo de las lecciones 9 «Sentido de giro», 10 «Velocidad con ENA» y 11 «Dos motores»
// (5.1–5.3 de la ruta): modelo L298N + motor que responde a los pines reales del programa compilado (órdenes, PWM de
// EN, zona muerta e inercia), circuito con batería y GND común, avisos, retos, borradores independientes y móvil.
// No la ejecuta CI: necesita Chromium y el compilador (ver services/compilador-arduino/README.md).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/motores.e2e.mjs
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
const OLD = ['arduino-led-serie', 'arduino-protoboard-semaforo', 'arduino-pwm-brillo', 'arduino-boton-entrada', 'arduino-boton-flanco',
  'arduino-potenciometro-pwm', 'arduino-ultrasonico-distancia', 'arduino-ultrasonico-alerta'];
const L9 = 'arduino-l298n-direccion';
const L10 = 'arduino-l298n-velocidad';
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
const order = (p, ch = 'A') => p.textContent(`[data-ch="${ch}"] .motor-read__order`);
const speed = (p, ch = 'A') => p.textContent(`[data-ch="${ch}"] .motor-read__speed`);
const rotor = (p, ch = 'A') => p.getAttribute(`[data-motor="${ch}"] .c-motor-rotor`, 'transform');
/** Espera (comprobando en cada fotograma) a que las lecturas de `ch` cumplan las dos expresiones. */
const waitRead = (p, ch, orderRe, speedRe, timeout = 6000) => p.waitForFunction(([c, o, s]) => {
  const q = (k) => document.querySelector(`[data-ch="${c}"] .motor-read__${k}`).textContent;
  return new RegExp(o).test(q('order')) && new RegExp(s).test(q('speed'));
}, [ch, orderRe.source, speedRe.source], { timeout, polling: 'raf' });

// ---------- 1. Lección 9 en escritorio: circuito, órdenes reales, inercia, avisos y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L9);
  assert.match(await p.textContent('.lab-top__course'), /Lección 9/);
  assert.equal(await p.locator('.lesson-picker__list a').count(), 15);
  assert.equal(await p.locator('#circuit .c-motor').count(), 1);
  assert.equal(await p.locator('#circuit .c-jumper').count(), 1);
  const desc = await p.textContent('#circuit-desc');
  for (const re of [/IN1 del L298N a D7/, /IN2 del L298N a D8/, /ENA lleva el puente/, /batería de 7 a 9 voltios/, /GND común/, /no alimenta los motores/]) assert.match(desc, re);
  assert.match(await p.textContent('#circuit svg'), /GND común[\s\S]*batería 7–9 V|batería 7–9 V[\s\S]*GND común/);
  assert.match(await p.textContent('#lesson'), /Por qué el Nano no mueve el motor/);
  log('lección 9: selector con 15 lecciones; circuito con L298N, puente en ENA, batería del motor y GND común descritos');

  // Programa vacío: nada se mueve (no hay animación preparada).
  await setCode(p, 'void setup() {}\nvoid loop() {}\n');
  await run(p);
  await waitRead(p, 'A', /^libre|^freno/, /^parado$/);
  await p.waitForTimeout(800);
  assert.match(await speed(p), /^parado$/);
  assert.equal(await rotor(p), 'rotate(0)');
  assert.match(await order(p), /IN1 sin configurar, IN2 sin configurar/);
  log('programa que no toca los pines: el motor sigue parado, sin girar, e IN1/IN2 «sin configurar»');

  // Solución: adelante (↻), orden de freno con el eje aún girando, atrás (↺); el giro sale del modelo.
  await setCode(p, fx('dir-solucion'));
  await run(p);
  await waitRead(p, 'A', /^adelante · IN1 HIGH, IN2 LOW, ENA con puente$/, /^\d+ rpm ↻ adelante$/);
  const r1 = await rotor(p);
  await p.waitForTimeout(150);
  assert.notEqual(await rotor(p), r1);
  await waitRead(p, 'A', /^freno · IN1 LOW, IN2 LOW/, /deteniéndose \(freno\)/);
  await waitRead(p, 'A', /^freno/, /^parado$/);
  await waitRead(p, 'A', /^atrás · IN1 LOW, IN2 HIGH/, /↺ atrás$/);
  await waitRead(p, 'A', /^atrás/, /^200 rpm ↺ atrás$/);
  assert.equal(await p.isHidden('.motor-read__warn'), true);
  await p.click('#btn-stop');
  const frozen = await rotor(p);
  await p.waitForTimeout(400);
  assert.equal(await rotor(p), frozen);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/motor-l9-escritorio.png` });
  log('solución: adelante ↻, «freno» con el eje «deteniéndose», parado, atrás ↺ a 200 rpm; al detener la simulación el rotor no se mueve');

  // Inversión sin parada: aviso del modelo. Pin sin configurar: lo dice la lectura de la orden.
  await setCode(p, fx('dir-sin-parada'));
  await run(p);
  await p.waitForSelector('.motor-read__warn:not([hidden])', { timeout: 4000 });
  assert.match(await p.textContent('.motor-read__warn'), /pasó de adelante a atrás girando al 100 %\. En un motor real/);
  await setCode(p, fx('dir-sin-pinmode'));
  await run(p);
  await waitRead(p, 'A', /IN2 sin configurar/, /./, 4000);
  await p.click('#btn-stop');
  log('inversión sin parar: aviso de pico de corriente; IN2 sin pinMode: «IN2 sin configurar»');

  assert.match(await check(p), /Todavía no/);
  await setCode(p, fx('dir-solucion'));
  assert.match(await check(p), /^Reto superado/);
  for (const [name, re] of [['dir-sin-parada', /sin pasar por parado/], ['dir-sentido', /fue hacia atrás/], ['dir-parada-corta', /tras solo 50 ms parado/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log('reto 9: la solución aprueba; sin pinMode, inversión sin parar, sentido incorrecto y parada corta suspenden con su explicación');
  await ctx.close();
}

// ---------- 2. Lección 10: PWM de ENA, zona muerta, rampa y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L10);
  assert.equal(await p.locator('#circuit .c-jumper').count(), 0);
  assert.match(await p.textContent('#circuit-desc'), /ENA del L298N a D9/);
  await run(p);   // código inicial: ENA a 60, 120, 255 y 0
  await waitRead(p, 'A', /ENA 24 %$/, /^parado: con 24 % no vence la zona muerta$/);
  await waitRead(p, 'A', /ENA 47 %$/, /^4\d rpm ↻ adelante$/, 4000);
  await waitRead(p, 'A', /ENA 100 %$/, /^200 rpm ↻ adelante$/, 4000);
  assert.match(await p.textContent('.pin-dot[data-pin="9"]'), /D9/);
  await waitRead(p, 'A', /^libre \(sin tensión\)/, /deteniéndose \(rueda libre\)/, 4000);
  assert.match(await p.textContent('#monitor'), /ENA = 60\nENA = 120\nENA = 255/);
  await p.click('#btn-stop');
  log('código inicial: ENA 24 % → motor parado (zona muerta); 47 % → ~49 rpm; 100 % → 200 rpm; ENA 0 → «libre» y el eje se va parando');

  await setCode(p, fx('vel-solucion'));
  assert.match(await check(p), /^Reto superado/);
  for (const [name, re] of [['vel-salto', /rampa brusca/], ['vel-otro-pin', /Hay PWM en D10/], ['vel-atras', /hacia atrás/], ['vel-sin-pinmode', /pinMode\(7, OUTPUT\)/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/motor-l10-escritorio.png` });
  log('reto 10: la rampa aprueba; salto brusco, PWM en otro pin (ENA deshabilitado), sentido atrás e IN1 sin configurar suspenden');
  await ctx.close();
}

// ---------- 3. Lección 11: dos motores, maniobras y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L11);
  assert.equal(await p.locator('#circuit .c-motor').count(), 2);
  assert.match(await p.textContent('#circuit-desc'), /IN3 del L298N a D4\. IN4 del L298N a D2\. ENB del L298N a D6/);
  await setCode(p, fx('dos-solucion'));
  await run(p);
  await waitRead(p, 'A', /^adelante/, /↻ adelante$/);
  await waitRead(p, 'B', /^adelante · IN3 HIGH, IN4 LOW, ENB 78 %$/, /↻ adelante$/);
  await waitRead(p, 'B', /^atrás · IN3 LOW, IN4 HIGH, ENB 70 %$/, /↺ atrás$/, 3000);
  assert.match(await order(p, 'A'), /^adelante/);
  await waitRead(p, 'B', /^libre/, /deteniéndose \(rueda libre\)/, 4000);
  await waitRead(p, 'A', /^libre/, /^parado$/, 4000);
  assert.match(await p.textContent('#monitor'), /^Avanzar\nGirar a la derecha\nAvanzar\nParar\n$/);
  log('solución: los dos avanzan, el derecho invierte en el giro (ENB 70 %), «Parar» deja rueda libre y los ejes se detienen después');

  assert.match(await check(p), /^Reto superado/);
  for (const [name, re] of [['dos-izquierda', /Giró a la izquierda/], ['dos-sin-enb', /ENB \(D6\) nunca se activó/], ['dos-zona-muerta', /zona muerta/],
    ['dos-pines-cambiados', /IN3\/IN4/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/motor-l11-escritorio.png` });
  log('reto 11: la solución aprueba; giro a la izquierda, ENB deshabilitado, zona muerta e IN3/IN4 cambiados suspenden');
  await ctx.close();
}

// ---------- 4. Borradores locales independientes y cambio de lección ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, 'arduino-ultrasonico-alerta');
  await setCode(p, '// alerta');
  await p.click('#btn-save');
  for (const [id, text] of [[L9, '// direccion'], [L10, '// velocidad']]) {
    await open(p, id);
    await setCode(p, text);
    await p.click('#btn-save');
  }
  await open(p, L11);
  assert.equal(await code(p), fx('dos-ejemplo'));
  await setCode(p, '// dos');
  if (!(await p.locator('.lesson-picker__box').evaluate((d) => d.open))) await p.click('.lesson-picker__box > summary');
  await p.click(`.lesson-picker__list a[data-lesson="${L9}"]`);
  await p.click('#switch-dialog button[value="save"]');
  await p.waitForURL(new RegExp(`leccion=${L9}`));
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await code(p), '// direccion');
  const s = await stored(p);
  assert.equal(s[L10].code, '// velocidad');
  assert.equal(s[L11].code, '// dos');
  assert.equal(s['arduino-ultrasonico-alerta'].code, '// alerta');
  for (const id of OLD.filter((i) => i !== 'arduino-ultrasonico-alerta')) assert.equal(s[id]?.code, undefined, id);
  log('borradores locales: lecciones 9, 10 y 11 con el suyo; «Guardar y cambiar»; la lección 8 intacta');
  await ctx.close();
}

// ---------- 5. Móvil: sin desbordamiento, lecturas legibles y motores que responden ----------
for (const device of ['Pixel 7', 'iPhone 13']) {
  const ctx = await context({ ...devices[device] });
  const m = await ctx.newPage();
  for (const id of [L9, L10, L11]) {
    await open(m, id);
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${device} ${id}`);
    const w = m.viewportSize().width;
    for (const sel of ['#circuit svg', '.motor-read', '.pin-strip']) {
      const b = await m.locator(sel).boundingBox();
      assert.ok(b.x >= 0 && b.x + b.width <= w + 0.5, `${device} ${id} ${sel}`);
    }
  }
  await setCode(m, fx('dos-solucion'));
  await m.locator('#btn-run').scrollIntoViewIfNeeded();
  await m.tap('#btn-run');
  await m.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 20000 });
  await waitRead(m, 'B', /^atrás/, /↺ atrás$/, 4000);
  await m.locator('#circuit').scrollIntoViewIfNeeded();
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/motor-movil-${device.replace(/\s/g, '-')}.png` });
  log(`móvil (${device}): lecciones 9–11 sin desbordamiento; tocar Ejecutar mueve los dos motores (giro con el derecho hacia atrás)`);
  await ctx.close();
}

// ---------- 6. Cuenta del aula: borradores independientes (opcional) ----------
if (SITIO) {
  const LABA = SITIO + '/games/laboratorio-arduino/index.html';
  const sufijo = Date.now().toString(36);
  async function api(ctx, method, path, data, csrf) {
    const r = await ctx.request.fetch(SITIO + '/api/aula' + path, { method, data, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
    return { status: r.status(), json: r.status() === 204 ? null : await r.json() };
  }
  const remote = async (ctx, id) => (await api(ctx, 'GET', '/borradores/' + id)).json.borrador;
  const ctxA = await context();
  const correo = `motor.${sufijo}@example.com`;
  const { json } = await crearCuenta(ctxA, SITIO, { nombre: 'Estudiante motores', correo, clave: 'clave-ficticia-e2e-1' });
  await api(ctxA, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/arduino-led-serie', { codigo: '// l1' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/arduino-ultrasonico-alerta', { codigo: '// l8' }, json.csrf);
  const pa = await ctxA.newPage();
  for (const [id, name] of [[L9, 'dir-solucion'], [L10, 'vel-solucion'], [L11, 'dos-solucion']]) {
    await pa.goto(`${LABA}?leccion=${id}`);
    await pa.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
    assert.match(await pa.textContent('#cuenta-estado'), /aún no tiene copia/, id);
    await setCode(pa, fx(name));
    await pa.click('#btn-save');
    await pa.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
    assert.match(await check(pa), /^Reto superado/, id);   // compila por la API del aula
  }
  assert.equal((await remote(ctxA, L9)).codigo, fx('dir-solucion'));
  assert.equal((await remote(ctxA, L10)).codigo, fx('vel-solucion'));
  assert.equal((await remote(ctxA, L11)).codigo, fx('dos-solucion'));
  assert.equal((await remote(ctxA, 'arduino-led-serie')).codigo, '// l1');
  assert.equal((await remote(ctxA, 'arduino-ultrasonico-alerta')).codigo, '// l8');
  for (const id of OLD.filter((i) => !['arduino-led-serie', 'arduino-ultrasonico-alerta'].includes(i))) assert.equal(await remote(ctxA, id), null, id);
  const ctxB = await context();
  const otro = await crearCuenta(ctxB, SITIO, { nombre: 'Otro', correo: `motor.otro.${sufijo}@example.com`, clave: 'clave-ficticia-e2e-2' });
  await api(ctxB, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, otro.json.csrf);
  for (const id of [L9, L10, L11]) assert.equal(await remote(ctxB, id), null, id);
  const ctxC = await context(devices['Pixel 7']);
  await api(ctxC, 'POST', '/sesion', { correo, clave: 'clave-ficticia-e2e-1' });
  const pc = await ctxC.newPage();
  await pc.goto(`${LABA}?leccion=${L11}`);
  await pc.waitForFunction(() => /Código recuperado de tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  assert.equal(await code(pc), fx('dos-solucion'));
  log('cuenta: borradores propios de las lecciones 9, 10 y 11, aislados por estudiante; los anteriores intactos; compilación por el aula; recuperación en móvil');
  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
}

assert.deepEqual(errors, []);
await browser.close();
log('sin errores de JavaScript en la página');
