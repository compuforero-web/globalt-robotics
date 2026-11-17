// Prueba manual de extremo a extremo de las lecciones con pulsador (4 «Leer un pulsador» y 5 «Flancos y
// antirrebote»): pulsador interactivo (ratón, teclado y toque), guion del reto, evaluación, borradores por lección
// y móvil. No la ejecuta CI: necesita Chromium y el compilador (ver services/compilador-arduino/README.md).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/botones.e2e.mjs
// Opcional: AULA_SITIO=http://127.0.0.1:8180 (sitio con la API del aula en el mismo origen y la API ya actualizada
//           con las lecciones nuevas): borradores por lección en la cuenta. Crea cuentas @example.com.
//           LAB_SHOTS=carpeta para capturas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const LAB = process.env.LAB_URL || 'http://localhost:8080/games/laboratorio-arduino/index.html';
const SITIO = (process.env.AULA_SITIO || '').replace(/\/$/, '');
const SHOTS = process.env.LAB_SHOTS || '';
const KEY = 'globalt.laboratorio.arduino.v1';
const L1 = 'arduino-led-serie';
const L4 = 'arduino-boton-entrada';
const L5 = 'arduino-boton-flanco';
const FIX = new URL('../fixtures/laboratorio/', import.meta.url);
const fx = (name) => readFileSync(new URL(name + '.ino', FIX), 'utf8');
const log = (...a) => console.log('✔', ...a);

const browser = await chromium.launch();
const errors = [];
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ...options });
  ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  return ctx;
}
const url = (id) => (id ? `${LAB}?leccion=${id}` : LAB);
async function open(page, id) {
  await page.goto(url(id));
  await page.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
}
const setCode = (p, code) => p.locator('.code-editor__input').fill(code);
const code = (p) => p.inputValue('.code-editor__input');
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"lessons":{}}').lessons, KEY);
const monitor = (p) => p.textContent('#monitor');
const state = (p) => p.textContent('.btn-ctl__state');
async function run(p) {
  await p.click('#btn-run');
  await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 20000 });
  await p.waitForFunction(() => /pull-up|flotante|salida/.test(document.querySelector('.btn-ctl__state').textContent), null, { timeout: 5000 });
  await p.waitForTimeout(200);
}
async function check(p, timeout = 60000) {
  await p.click('#btn-check');
  await p.waitForFunction(() => /Reto superado|Todavía no|necesita/.test(document.querySelector('#eval-result').textContent), null, { timeout });
  return p.textContent('#eval-result');
}
async function mouseHold(p, ms) {
  const b = await p.locator('.btn-ctl__press').boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(ms);
  await p.mouse.up();
}

// ---------- 1. Lección 4 en escritorio: pulsador con ratón y teclado, pull-up, flotante y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L4);
  assert.match(await p.textContent('.lab-top__course'), /Lección 4/);
  assert.match(await p.textContent('.lab__lesson-title'), /pulsador/i);
  assert.equal(await p.locator('.lesson-picker__list a').count(), 14);
  assert.match(await p.textContent('.lesson-picker__prev'), /Lección 2/);
  assert.equal(await p.locator('#circuit svg .c-btn').count(), 1);
  assert.equal(await p.locator('.btn-ctl__script').count(), 1);
  assert.match(await state(p), /pulsa Ejecutar/);
  // Pulsar sin simulación: avisa y no rompe nada.
  await mouseHold(p, 100);
  assert.match(await state(p), /no está en marcha/);

  // Código inicial (práctica): imprime D2 cada 200 ms. Suelto = 1 (pull-up); pulsado con el ratón = 0.
  await run(p);
  // Al arrancar, D2 es INPUT unos microsegundos (hasta que setup() ejecuta pinMode): se espera al pull-up.
  await p.waitForFunction(() => /Suelto · D2 = HIGH · entrada con pull-up/.test(document.querySelector('.btn-ctl__state').textContent), null, { timeout: 3000 });
  await p.waitForFunction(() => /D2 = 1/.test(document.querySelector('#monitor').textContent), null, { timeout: 5000 });
  const b = await p.locator('.btn-ctl__press').boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  await p.waitForFunction(() => /Pulsado · D2 = LOW/.test(document.querySelector('.btn-ctl__state').textContent), null, { timeout: 3000 });
  assert.equal(await p.getAttribute('.btn-ctl__press', 'aria-pressed'), 'true');
  assert.equal(await p.locator('.c-btn.is-pressed').count(), 1);
  await p.waitForFunction(() => /D2 = 0/.test(document.querySelector('#monitor').textContent), null, { timeout: 3000 });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/boton-escritorio-pulsado.png` });
  await p.mouse.up();
  await p.waitForFunction(() => /Suelto · D2 = HIGH/.test(document.querySelector('.btn-ctl__state').textContent), null, { timeout: 3000 });
  log('lección 4: el pulsador (ratón) cambia D2 en el chip emulado: HIGH suelto con pull-up, LOW pulsado');

  // Solución: el LED sigue al botón pulsado con el teclado (Espacio mantenido) y solo se escribe al cambiar.
  await setCode(p, fx('boton-solucion'));
  await run(p);
  assert.equal(await p.locator('.c-led.is-on').count(), 0);
  await p.focus('.btn-ctl__press');
  await p.keyboard.down(' ');
  await p.waitForFunction(() => document.querySelectorAll('.c-led.is-on').length === 1, null, { timeout: 3000 });
  await p.waitForTimeout(600);
  await p.keyboard.up(' ');
  await p.waitForFunction(() => document.querySelectorAll('.c-led.is-on').length === 0, null, { timeout: 3000 });
  await p.waitForTimeout(400);
  assert.equal((await monitor(p)).trim(), 'Pulsado\nSuelto');
  log('lección 4: Espacio mantenido enciende el LED de D13; un solo «Pulsado»/«Suelto» por cambio');

  // Un pin sin pull-up se ve flotante (ejemplo de la lección, cargado con «Probar en el editor»).
  await p.click('.steps__btn[data-step="1"]');
  await p.click('[data-example="flotante"][data-act="try"]');
  await p.click('#example-dialog button[value="replace"]');
  await run(p);
  await p.waitForFunction(() => /flotante/.test(document.querySelector('.btn-ctl__state').textContent), null, { timeout: 3000 });
  await p.waitForTimeout(1500);
  const values = new Set((await monitor(p)).trim().split('\n'));
  assert.ok(values.has('0') && values.has('1'), [...values].join(','));
  assert.equal(await p.locator('.pin-dot[data-pin="2"].is-floating').count(), 1);
  await p.click('#btn-stop');
  log('lección 4: INPUT sin pull-up → D2 flotante, digitalRead devuelve 0 y 1 al azar');

  // Guion del reto en tiempo real: el pulsador se mueve solo.
  await setCode(p, fx('boton-solucion'));
  await p.click('#btn-clear');
  await p.click('.btn-ctl__script');
  await p.waitForFunction(() => (document.querySelector('#monitor').textContent.match(/Suelto\n/g) || []).length >= 5, null, { timeout: 12000 });
  assert.deepEqual((await monitor(p)).trim().split('\n'), Array(5).fill(['Pulsado', 'Suelto']).flat());
  await p.click('#btn-stop');
  log('lección 4: «Reproducir guion del reto» aplica las 5 pulsaciones del guion en tiempo real');

  // Evaluación: solución aprueba; sin pull-up, lógica sin invertir y mensajes repetidos suspenden con explicación.
  assert.match(await check(p), /^Reto superado/);
  assert.equal((await stored(p))[L4].completedAt !== undefined, true);
  for (const [name, re] of [['boton-sin-pullup', /INPUT_PULLUP/], ['boton-invertido', /lógica es invertida/], ['boton-repite', /no apareció ninguna línea|sin cambio del botón/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log('lección 4: la solución aprueba; sin pull-up, lógica invertida y mensajes repetidos suspenden con su explicación');
  await ctx.close();
}

// ---------- 2. Lección 5: rebote real con pulsaciones manuales, guion y reto ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L5);
  assert.match(await p.textContent('.lab-top__course'), /Lección 5/);
  assert.match(await p.textContent('.btn-ctl__help'), /rebota/);
  await run(p);
  for (let i = 0; i < 3; i++) { await mouseHold(p, 180); await p.waitForTimeout(250); }
  await p.waitForTimeout(300);
  const counts = (await monitor(p)).match(/Contadas: \d+/g) || [];
  assert.ok(counts.length > 3, `el contador sin antirrebote debe contar de más: ${counts.length}`);
  log(`lección 5: 3 pulsaciones manuales con rebote → el código inicial cuenta ${counts.length}`);

  await setCode(p, fx('flanco-solucion'));
  await run(p);
  for (let i = 0; i < 3; i++) { await mouseHold(p, 180); await p.waitForTimeout(250); }
  await p.waitForTimeout(300);
  assert.equal((await monitor(p)).trim(), 'Pulsaciones: 1\nPulsaciones: 2\nPulsaciones: 3');
  assert.equal(await p.locator('.c-led.is-on').count(), 1);
  log('lección 5: con antirrebote, 3 pulsaciones con rebote = 3 cuentas y el LED alternado');

  const t0 = Date.now();
  assert.match(await check(p), /^Reto superado/);
  const ms = Date.now() - t0;
  for (const [name, re] of [['flanco-sin-antirrebote', /rebotes/], ['flanco-al-soltar', /al soltar/], ['flanco-lento', /no se detectó/]]) {
    await setCode(p, fx(name));
    const r = await check(p);
    assert.match(r, /Todavía no/, name);
    assert.match(r, re, name);
  }
  log(`lección 5: la solución aprueba (${ms} ms con compilación); sin antirrebote, al soltar y espera larga suspenden`);
  await ctx.close();
}

// ---------- 3. Borradores locales por lección y cambio de lección ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L1);
  const l1 = await code(p);
  await open(p, L4);
  await setCode(p, '// mi lectura del botón');
  await p.click('#btn-save');
  await open(p, L5);
  await setCode(p, '// mi contador');
  if (!(await p.locator('.lesson-picker__box').evaluate((d) => d.open))) await p.click('.lesson-picker__box > summary');
  await p.click(`.lesson-picker__list a[data-lesson="${L4}"]`);
  assert.equal(await p.locator('#switch-dialog[open]').count(), 1);
  await p.click('#switch-dialog button[value="save"]');
  await p.waitForURL(/leccion=arduino-boton-entrada/);
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await code(p), '// mi lectura del botón');
  const s = await stored(p);
  assert.equal(s[L4].code, '// mi lectura del botón');
  assert.equal(s[L5].code, '// mi contador');
  assert.equal(s[L1]?.code, undefined);   // abrir la lección 1 solo recuerda el paso, no crea código
  await open(p, L1);
  assert.equal(await code(p), l1);
  log('borradores locales: cada lección conserva su código; «Guardar y cambiar» funciona; la lección 1 intacta');
  await ctx.close();
}

// ---------- 4. Móvil: toque mantenido, sin desbordamiento ----------
for (const device of ['Pixel 7', 'iPhone 13']) {
  const ctx = await context({ ...devices[device] });
  const m = await ctx.newPage();
  for (const id of [L4, L5]) {
    await open(m, id);
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${device} ${id}`);
    const w = m.viewportSize().width;
    for (const sel of ['#circuit svg', '.btn-ctl__press']) {
      const box = await m.locator(sel).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= w, `${device} ${id} ${sel}`);
    }
    const press = await m.locator('.btn-ctl__press').boundingBox();
    assert.ok(press.height >= 44, 'objetivo táctil de al menos 44 px');
  }
  // Toque mantenido (eventos táctiles reales por CDP) con la solución de la lección 4.
  await open(m, L4);
  await setCode(m, fx('boton-solucion'));
  await run(m);
  await m.locator('.btn-ctl__press').scrollIntoViewIfNeeded();
  const box = await m.locator('.btn-ctl__press').boundingBox();
  const cdp = await ctx.newCDPSession(m);
  const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
  await m.waitForFunction(() => document.querySelectorAll('.c-led.is-on').length === 1, null, { timeout: 3000 });
  await m.waitForTimeout(700);
  assert.equal(await m.locator('.c-led.is-on').count(), 1, 'el LED sigue encendido mientras se mantiene el toque');
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/boton-movil-${device.replace(/\s/g, '-')}.png` });   // sin fullPage: cambiaría el viewport con el dedo apoyado
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await m.waitForFunction(() => document.querySelectorAll('.c-led.is-on').length === 0, null, { timeout: 3000 });
  await m.waitForTimeout(300);
  assert.equal((await monitor(m)).trim(), 'Pulsado\nSuelto');
  log(`móvil (${device}): lecciones 4 y 5 sin desbordamiento; el toque mantenido pulsa y suelta una sola vez`);
  await ctx.close();
}

// ---------- 5. Cuenta del aula: un borrador por lección (opcional) ----------
if (SITIO) {
  const LABA = SITIO + '/games/laboratorio-arduino/index.html';
  const sufijo = Date.now().toString(36);
  async function api(ctx, method, path, data, csrf) {
    const r = await ctx.request.fetch(SITIO + '/api/aula' + path, { method, data, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
    return { status: r.status(), json: r.status() === 204 ? null : await r.json() };
  }
  const remote = async (ctx, id) => (await api(ctx, 'GET', '/borradores/' + id)).json.borrador;
  const ctxA = await context();
  const correo = `botones.${sufijo}@example.com`;
  const { json } = await api(ctxA, 'POST', '/registro', { nombre: 'Estudiante botones', correo, clave: 'clave-ficticia-e2e-1' });
  await api(ctxA, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  const pa = await ctxA.newPage();
  const openA = async (id) => {
    await pa.goto(`${LABA}?leccion=${id}`);
    await pa.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
  };
  for (const id of [L4, L5]) {
    await openA(id);
    assert.match(await pa.textContent('#cuenta-estado'), /aún no tiene copia/);
    await setCode(pa, `// cuenta ${id}`);
    await pa.click('#btn-save');
    await pa.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
  }
  assert.equal(await remote(ctxA, L1), null);
  assert.equal((await remote(ctxA, L4)).codigo, `// cuenta ${L4}`);
  assert.equal((await remote(ctxA, L5)).codigo, `// cuenta ${L5}`);
  // Compilar y comprobar a través de la API del aula (sesión, inscripción y CSRF).
  await openA(L5);
  await setCode(pa, fx('flanco-solucion'));
  assert.match(await check(pa), /^Reto superado/);
  // Otro estudiante no ve estos borradores; otro navegador del mismo estudiante recupera el de su lección.
  const ctxB = await context();
  const otro = await api(ctxB, 'POST', '/registro', { nombre: 'Otro estudiante', correo: `botones.otro.${sufijo}@example.com`, clave: 'clave-ficticia-e2e-2' });
  await api(ctxB, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, otro.json.csrf);
  assert.equal(await remote(ctxB, L4), null);
  assert.equal(await remote(ctxB, L5), null);
  const ctxC = await context(devices['Pixel 7']);
  await api(ctxC, 'POST', '/sesion', { correo, clave: 'clave-ficticia-e2e-1' });
  const pc = await ctxC.newPage();
  await pc.goto(`${LABA}?leccion=${L4}`);
  await pc.waitForFunction(() => /Código recuperado de tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  assert.equal(await code(pc), `// cuenta ${L4}`);
  log('cuenta: lecciones 4 y 5 con borrador propio, aislado por estudiante; compilación por el aula; recuperación en móvil');
  await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
}

assert.deepEqual(errors, []);
await browser.close();
log('sin errores de JavaScript en la página');
