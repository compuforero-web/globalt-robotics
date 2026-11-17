// Prueba manual de extremo a extremo de las lecciones 7 «Medir distancia» y 8 «Alerta de cercanía» (4.1 y 4.2 de la
// ruta): modelo HC-SR04 que responde al TRIG real del programa compilado, obstáculo interactivo (teclado, ratón, dedo
// y «Sin obstáculo»), reinicio, guion del reto, evaluación, borradores independientes y móvil.
// No la ejecuta CI: necesita Chromium y el compilador (ver services/compilador-arduino/README.md).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/ultrasonico.e2e.mjs
// Opcional: AULA_SITIO=http://127.0.0.1:8180 (API del aula ya actualizada, mismo origen): borradores en la cuenta.
//           LAB_SHOTS=carpeta para capturas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const LAB = process.env.LAB_URL || 'http://localhost:8080/games/laboratorio-arduino/index.html';
const SITIO = (process.env.AULA_SITIO || '').replace(/\/$/, '');
const SHOTS = process.env.LAB_SHOTS || '';
const KEY = 'globalt.laboratorio.arduino.v1';
const OLD = ['arduino-led-serie', 'arduino-protoboard-semaforo', 'arduino-pwm-brillo', 'arduino-boton-entrada', 'arduino-boton-flanco', 'arduino-potenciometro-pwm'];
const L7 = 'arduino-ultrasonico-distancia';
const L8 = 'arduino-ultrasonico-alerta';
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
const cm = (p) => p.textContent('.sonar-ctl__cm');
async function run(p) {
  // Detiene antes la simulación anterior: si no, su monitor y su circuito siguen cambiando mientras se compila.
  if ((await p.textContent('#sim-state')) === 'En ejecución') {
    await p.click('#btn-stop');
    await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'Detenida');
  }
  await p.click('#btn-run');
  await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 20000 });
}
/** Espera a que la última línea completa del monitor cumpla `re` (texto que imprime el programa compilado). */
const waitLine = (p, re, timeout = 5000) => p.waitForFunction((src) => {
  const lines = document.querySelector('#monitor').textContent.trim().split('\n');
  return new RegExp(src).test(lines[lines.length - 1] || '');
}, re.source, { timeout });
const lastLine = async (p) => (await p.textContent('#monitor')).trim().split('\n').pop();
const waitMeter = (p, test, timeout = 5000) => p.waitForFunction((src) => new Function('v', src)(parseInt(document.querySelector('.pwm-meter__value').textContent, 10)), test, { timeout });
async function check(p, timeout = 60000) {
  await p.click('#btn-check');
  await p.waitForFunction(() => /Reto superado|Todavía no|necesita/.test(document.querySelector('#eval-result').textContent), null, { timeout });
  return p.textContent('#eval-result');
}

// ---------- 1. Lección 7 en escritorio: TRIG real, eco con pulseIn, teclado, ratón, sin eco, reinicio, guion y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L7);
  assert.match(await p.textContent('.lab-top__course'), /Lección 7/);
  assert.equal(await p.locator('.lesson-picker__list a').count(), 13);
  assert.match(await p.textContent('.lesson-picker__prev'), /Lección 1.*Lección 4/);
  assert.equal(await p.locator('#circuit svg .c-sonar').count(), 1);
  assert.equal(await p.locator('#circuit .c-led').count(), 0);
  assert.equal(await cm(p), '100 cm');
  assert.equal(await p.getAttribute('#sonar-range', 'aria-valuetext'), '100 centímetros');

  // Código inicial: imprime la duración del eco (pulseIn sin límite). Teclado: Fin = 400 cm, Inicio = 2 cm, flechas ±1 cm.
  await run(p);
  await waitLine(p, /^Eco: 57\d\d us$/);
  assert.match(await p.textContent('.sonar-ctl__trig'), /µs en alto ✓ disparo válido/);
  assert.match(await p.textContent('.sonar-ctl__echo'), /^5831 µs en alto/);
  await p.focus('#sonar-range');
  await p.keyboard.press('End');
  assert.equal(await cm(p), '400 cm');
  await waitLine(p, /^Eco: 23[01]\d\d us$/);
  await p.keyboard.press('Home');
  await waitLine(p, /^Eco: 11\d us$/);
  for (let i = 0; i < 8; i++) await p.keyboard.press('ArrowRight');
  assert.equal(await cm(p), '10 cm');
  await waitLine(p, /^Eco: 57\d us$/);
  log('teclado: Fin/Inicio/flechas mueven el obstáculo; pulseIn del programa compilado mide ~23 200, ~117 y ~577 µs');

  // Sin obstáculo: el módulo baja ECHO a los 38 ms; pulseIn sin límite devuelve ~37 800 µs (no 0).
  await p.check('.sonar-ctl__check');
  assert.equal(await cm(p), 'sin obstáculo');
  assert.equal(await p.isDisabled('#sonar-range'), true);
  await waitLine(p, /^Eco: 37\d\d\d us$/);
  assert.match(await p.textContent('.sonar-ctl__echo'), /38000 µs en alto: sin eco/);
  await p.uncheck('.sonar-ctl__check');
  // Ratón: un clic hacia la mitad del recorrido ≈ 200 cm.
  const box = await p.locator('#sonar-range').boundingBox();
  await p.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  const v = parseInt(await cm(p), 10);
  assert.ok(v > 170 && v < 230, `ratón: ${v} cm`);
  await waitLine(p, new RegExp(`^Eco: ${String(Math.floor(v * 58.31 * 0.994)).slice(0, 2)}\\d\\d+ us$`));
  log(`«Sin obstáculo» da ~37 800 µs sin límite; ratón: clic a la mitad → ${v} cm y su eco`);

  // TRIG demasiado corto: el modelo lo ignora y el programa imprime 0.
  await setCode(p, fx('ultra-trig-corto'));
  await run(p);
  await waitLine(p, /^Distancia: 0 cm$/, 8000);
  assert.match(await p.textContent('.sonar-ctl__trig'), /✗ ignorado: necesita ≥ 10 µs/);
  assert.equal(await p.textContent('.sonar-ctl__echo'), '—');
  // Sin pinMode(OUTPUT) en TRIG no hay ningún pulso.
  await setCode(p, fx('ultra-sin-pinmode'));
  await run(p);
  await waitLine(p, /^Distancia: 0 cm$/, 8000);
  assert.match(await p.textContent('.sonar-ctl__trig'), /sin pulsos: D7 no está configurado como salida|sin pulsos todavía/);
  log('TRIG de ~7 µs ignorado (✗) y TRIG sin pinMode: sin eco, el programa imprime 0');

  // Solución: cambio de distancia en marcha y reinicio (RESET) con la misma distancia.
  await setCode(p, fx('ultra-solucion'));
  await run(p);
  await p.focus('#sonar-range');
  await p.keyboard.press('Home');
  for (let i = 0; i < 33; i++) await p.keyboard.press('ArrowRight');
  assert.equal(await cm(p), '35 cm');
  await waitLine(p, /^Distancia: 3[45] cm$/);
  await p.click('#btn-reset');
  assert.equal(await p.textContent('#monitor'), '');
  await waitLine(p, /^Distancia: 3[45] cm$/);
  assert.equal(await cm(p), '35 cm');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/ultra-escritorio.png` });
  log('solución: 35 cm → «Distancia: 34/35 cm»; RESET vacía el monitor y vuelve a medir 35 cm');

  // Guion del reto en tiempo real: el obstáculo pasa solo por 10, 35, 80 y 150 cm.
  await p.click('#btn-clear');
  await p.locator('#btn-check').focus();
  await p.click('.sonar-ctl__script');
  await p.waitForFunction(() => document.querySelector('.sonar-ctl__cm').textContent === '150 cm', null, { timeout: 12000 });
  await waitLine(p, /^Distancia: 1[45]\d cm$/);
  assert.match(await p.textContent('#monitor'), /Distancia: (9|10) cm\n[\s\S]*Distancia: 3[45] cm\n[\s\S]*Distancia: (79|80) cm\n/);
  // RESET durante el guion: vuelve a empezar desde 10 cm.
  await p.click('#btn-reset');
  await p.waitForFunction(() => document.querySelector('.sonar-ctl__cm').textContent === '10 cm', null, { timeout: 3000 });
  await waitLine(p, /^Distancia: (9|10) cm$/);
  await p.click('#btn-stop');
  log('«Reproducir guion del reto»: 10 → 35 → 80 → 150 cm en tiempo real; RESET reinicia también el guion');

  // Evaluación.
  const t0 = Date.now();
  assert.match(await check(p), /^Reto superado/);
  const ms = Date.now() - t0;
  assert.ok((await stored(p))[L7].completedAt);
  for (const [name, re] of [['ultra-factor', /dividir el tiempo entre 58/], ['ultra-trig-corto', /necesita al menos 10 µs/],
    ['ultra-sin-espera', /al menos 60 ms/], ['ultra-lento', /se esperan 100–200 ms/], ['ultra-pines-cambiados', /cambiados TRIG y ECHO/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log(`reto 7: la solución aprueba (${ms} ms con compilación); factor 29, TRIG corto, sin espera, lento y pines cambiados suspenden`);
  await ctx.close();
}

// ---------- 2. Lección 8 en escritorio: brillo medido en D9, sin eco, «Fuera de rango» y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L8);
  assert.match(await p.textContent('.lab-top__course'), /Lección 8/);
  assert.match(await p.textContent('.lesson-picker__prev'), /Lección 7.*Lección 3/);
  assert.equal(await p.locator('#circuit .c-led').count(), 1);
  assert.equal(await cm(p), '30 cm');

  // Código inicial: pulseIn con límite de 30 000 µs devuelve 0 sin eco.
  await run(p);
  await waitLine(p, /^pulseIn = 17\d\d$/);
  await p.check('.sonar-ctl__check');
  await waitLine(p, /^pulseIn = 0$/);
  await p.uncheck('.sonar-ctl__check');
  log('código inicial: pulseIn(…, 30000) da ~1740 µs a 30 cm y 0 sin obstáculo');

  await setCode(p, fx('alerta-solucion'));
  await run(p);
  await waitMeter(p, 'return v >= 46 && v <= 56');
  assert.match(await p.textContent('.pwm-meter__freq'), /PWM a 490 Hz/);
  await p.focus('#sonar-range');
  await p.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowRight');
  assert.equal(await cm(p), '6 cm');
  await waitMeter(p, 'return v === 100');
  assert.equal(await p.locator('.c-led.is-on').count(), 1);
  for (let i = 0; i < 64; i++) await p.keyboard.press('ArrowRight');
  assert.equal(await cm(p), '70 cm');
  await waitMeter(p, 'return v === 0');
  assert.equal(await p.locator('.c-led.is-on').count(), 0);
  for (let i = 0; i < 50; i++) await p.keyboard.press('ArrowLeft');
  await waitMeter(p, 'return v >= 70 && v <= 80');
  await p.check('.sonar-ctl__check');
  await waitLine(p, /^Fuera de rango$/);
  await waitMeter(p, 'return v === 0');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/alerta-escritorio.png` });
  log('solución: D9 medido 100 % a 6 cm, 0 % a 70 cm, ~75 % a 20 cm (PWM 490 Hz); sin eco «Fuera de rango» y LED apagado');

  await p.uncheck('.sonar-ctl__check');
  await p.click('#btn-stop');
  assert.match(await check(p), /^Reto superado/);
  for (const [name, re] of [['alerta-cero-encendido', /trata ese 0/], ['alerta-sin-timeout', /38 000 µs/],
    ['alerta-espera-larga', /≤ 40 ms/], ['alerta-invertido', /invertido/], ['alerta-lento', /tarda demasiado/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log('reto 8: la solución aprueba; 0 sin tratar, sin tiempo máximo, aviso tardío, invertido y lento suspenden con su explicación');
  await ctx.close();
}

// ---------- 3. Borradores locales independientes y cambio de lección ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, 'arduino-potenciometro-pwm');
  await setCode(p, '// pot');
  await p.click('#btn-save');
  await open(p, L7);
  await setCode(p, '// distancia');
  await p.click('#btn-save');
  await open(p, L8);
  assert.equal(await code(p), readFileSync(new URL('../fixtures/laboratorio/alerta-ejemplo.ino', import.meta.url), 'utf8'));
  await setCode(p, '// alerta');
  if (!(await p.locator('.lesson-picker__box').evaluate((d) => d.open))) await p.click('.lesson-picker__box > summary');
  await p.click(`.lesson-picker__list a[data-lesson="${L7}"]`);
  await p.click('#switch-dialog button[value="save"]');
  await p.waitForURL(new RegExp(`leccion=${L7}`));
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await code(p), '// distancia');
  const s = await stored(p);
  assert.equal(s[L8].code, '// alerta');
  assert.equal(s['arduino-potenciometro-pwm'].code, '// pot');
  for (const id of OLD.filter((i) => i !== 'arduino-potenciometro-pwm')) assert.equal(s[id]?.code, undefined, id);
  log('borradores locales: lecciones 7 y 8 con el suyo; «Guardar y cambiar»; la lección 6 intacta');
  await ctx.close();
}

// ---------- 4. Móvil: arrastre con el dedo, casilla táctil, sin desbordamiento ----------
for (const device of ['Pixel 7', 'iPhone 13']) {
  const ctx = await context({ ...devices[device] });
  const m = await ctx.newPage();
  await open(m, L8);
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), device);
  const w = m.viewportSize().width;
  for (const sel of ['#circuit svg', '#sonar-range', '.pwm-meter', '.sonar-ctl__read']) {
    const b = await m.locator(sel).boundingBox();
    assert.ok(b.x >= 0 && b.x + b.width <= w, `${device} ${sel}`);
  }
  assert.ok((await m.locator('#sonar-range').boundingBox()).height >= 44, 'objetivo táctil de al menos 44 px');
  assert.ok((await m.locator('.sonar-ctl__none').boundingBox()).height >= 44, 'casilla con objetivo táctil de 44 px');
  await setCode(m, fx('alerta-solucion'));
  await run(m);
  await m.locator('#sonar-range').scrollIntoViewIfNeeded();
  const b = await m.locator('#sonar-range').boundingBox();
  const y = b.y + b.height / 2;
  const cdp = await ctx.newCDPSession(m);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y }] });
  for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width / 2 - (b.width / 2) * k / 10, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await m.waitForFunction(() => document.querySelector('.sonar-ctl__cm').textContent === '2 cm', null, { timeout: 3000 });
  await waitMeter(m, 'return v === 100');
  await m.tap('.sonar-ctl__none');
  await waitLine(m, /^Fuera de rango$/);
  await waitMeter(m, 'return v === 0');
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/alerta-movil-${device.replace(/\s/g, '-')}.png`, fullPage: false });
  log(`móvil (${device}): sin desbordamiento; arrastrar con el dedo lleva el obstáculo a 2 cm (D9 100 %); tocar «Sin obstáculo» → «Fuera de rango»`);
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
  const correo = `ultra.${sufijo}@example.com`;
  const { json } = await api(ctxA, 'POST', '/registro', { nombre: 'Estudiante ultra', correo, clave: 'clave-ficticia-e2e-1' });
  await api(ctxA, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/arduino-led-serie', { codigo: '// l1' }, json.csrf);
  await api(ctxA, 'PUT', '/borradores/arduino-potenciometro-pwm', { codigo: '// l6' }, json.csrf);
  const pa = await ctxA.newPage();
  for (const [id, name] of [[L7, 'ultra-solucion'], [L8, 'alerta-solucion']]) {
    await pa.goto(`${LABA}?leccion=${id}`);
    await pa.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
    assert.match(await pa.textContent('#cuenta-estado'), /aún no tiene copia/, id);
    await setCode(pa, fx(name));
    await pa.click('#btn-save');
    await pa.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
    assert.match(await check(pa), /^Reto superado/, id);   // compila por la API del aula
  }
  assert.equal((await remote(ctxA, L7)).codigo, fx('ultra-solucion'));
  assert.equal((await remote(ctxA, L8)).codigo, fx('alerta-solucion'));
  assert.equal((await remote(ctxA, 'arduino-led-serie')).codigo, '// l1');
  assert.equal((await remote(ctxA, 'arduino-potenciometro-pwm')).codigo, '// l6');
  for (const id of ['arduino-protoboard-semaforo', 'arduino-pwm-brillo', 'arduino-boton-entrada', 'arduino-boton-flanco']) assert.equal(await remote(ctxA, id), null, id);
  const ctxB = await context();
  const otro = await api(ctxB, 'POST', '/registro', { nombre: 'Otro', correo: `ultra.otro.${sufijo}@example.com`, clave: 'clave-ficticia-e2e-2' });
  await api(ctxB, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, otro.json.csrf);
  assert.equal(await remote(ctxB, L7), null);
  assert.equal(await remote(ctxB, L8), null);
  const ctxC = await context(devices['iPhone 13']);
  await api(ctxC, 'POST', '/sesion', { correo, clave: 'clave-ficticia-e2e-1' });
  const pc = await ctxC.newPage();
  await pc.goto(`${LABA}?leccion=${L8}`);
  await pc.waitForFunction(() => /Código recuperado de tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  assert.equal(await code(pc), fx('alerta-solucion'));
  log('cuenta: borradores propios de las lecciones 7 y 8, aislados por estudiante; los anteriores intactos; compilación por el aula; recuperación en móvil');
  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
}

assert.deepEqual(errors, []);
await browser.close();
log('sin errores de JavaScript en la página');
