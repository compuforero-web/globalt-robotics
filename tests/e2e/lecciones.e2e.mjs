// Prueba manual de extremo a extremo de las lecciones 2 (semáforo) y 3 (PWM) y del cambio entre lecciones.
// No la ejecuta CI: necesita Chromium y el compilador (ver services/compilador-arduino/README.md).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/lecciones.e2e.mjs
// Opcional: AULA_SITIO=http://127.0.0.1:8180 (sitio con la API del aula en el mismo origen y la API ya
//           actualizada con las lecciones nuevas): borradores por lección en la cuenta. Crea cuentas @example.com.
//           LAB_SHOTS=carpeta para capturas · LAB_LARGA=1 ejecuta la prueba de 60 s de PWM en tiempo real.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const LAB = process.env.LAB_URL || 'http://localhost:8080/games/laboratorio-arduino/index.html';
const SITIO = (process.env.AULA_SITIO || '').replace(/\/$/, '');
const SHOTS = process.env.LAB_SHOTS || '';
const KEY = 'globalt.laboratorio.arduino.v1';
const L1 = 'arduino-led-serie';
const L2 = 'arduino-protoboard-semaforo';
const L3 = 'arduino-pwm-brillo';
const log = (...a) => console.log('✔', ...a);

const SEMAFORO = `const int VERDE = 2, AMARILLO = 3, ROJO = 4;
void fase(int pin, const char *nombre, unsigned long ms) {
  digitalWrite(VERDE, LOW); digitalWrite(AMARILLO, LOW); digitalWrite(ROJO, LOW);
  digitalWrite(pin, HIGH);
  Serial.println(nombre);
  delay(ms);
}
void setup() { pinMode(VERDE, OUTPUT); pinMode(AMARILLO, OUTPUT); pinMode(ROJO, OUTPUT); Serial.begin(9600); }
void loop() { fase(VERDE, "Verde", 3000); fase(AMARILLO, "Amarillo", 1000); fase(ROJO, "Rojo", 3000); }
`;
const SEMAFORO_SOLAPE = SEMAFORO.replace('digitalWrite(VERDE, LOW); digitalWrite(AMARILLO, LOW); digitalWrite(ROJO, LOW);\n  digitalWrite(pin, HIGH);',
  'digitalWrite(pin, HIGH); delay(150);\n  if (pin != VERDE) digitalWrite(VERDE, LOW); if (pin != AMARILLO) digitalWrite(AMARILLO, LOW); if (pin != ROJO) digitalWrite(ROJO, LOW);');
const RESPIRA = `const int LED = 9;
void setup() { }
void loop() {
  for (int v = 0; v <= 255; v++) { analogWrite(LED, v); delay(4); }
  for (int v = 255; v >= 0; v--) { analogWrite(LED, v); delay(4); }
}
`;
const ESCALONES = 'void setup() { }\nvoid loop() { analogWrite(9, 0); delay(1000); analogWrite(9, 255); delay(1000); }\n';
const fijo = (v) => `void setup() { }\nvoid loop() { analogWrite(9, ${v}); delay(100); }\n`;

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
  await page.waitForFunction(() => document.querySelector('#service').dataset.kind !== '' || document.querySelector('.lab__work').hidden);
}
const setCode = (p, code) => p.locator('.code-editor__input').fill(code);
const code = (p) => p.inputValue('.code-editor__input');
const stored = (p) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{"lessons":{}}').lessons, KEY);
async function check(p, timeout = 60000) {
  await p.click('#btn-check');
  await p.waitForFunction(() => /Reto superado|Todavía no|necesita/.test(document.querySelector('#eval-result').textContent), null, { timeout });
  return p.textContent('#eval-result');
}
async function pickLesson(p, id) {
  if (!(await p.locator('.lesson-picker__box').evaluate((d) => d.open))) await p.click('.lesson-picker__box > summary');
  await p.click(`.lesson-picker__list a[data-lesson="${id}"]`);
}

// ---------- 1. Selector, URL y cambio protegido ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p);
  assert.equal(await p.textContent('.lab-top__course'), 'Electrónica y C++ con Arduino · Lección 1');
  assert.match(await p.textContent('.lesson-picker__box > summary'), /Lección 1 de 5/);
  assert.equal(await p.locator('.lesson-picker__list a').count(), 5);
  assert.equal(await p.getAttribute(`.lesson-picker__list a[data-lesson="${L1}"]`, 'aria-current'), 'page');
  assert.equal(await p.locator('.lesson-picker__prev').count(), 0);   // la lección 1 no tiene previas

  // Cambios sin guardar → el diálogo; «Seguir aquí» no cambia nada.
  await setCode(p, '// lección 1 sin guardar\nvoid setup(){}\nvoid loop(){}\n');
  await pickLesson(p, L2);
  assert.ok(await p.isVisible('#switch-dialog'));
  assert.match(await p.textContent('#switch-dialog-desc'), /Protoboard y varias salidas/);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => /Sigues en esta lección/.test(document.querySelector('#status').textContent));
  assert.equal(new URL(p.url()).search, '');
  assert.equal(await code(p), '// lección 1 sin guardar\nvoid setup(){}\nvoid loop(){}\n');
  assert.equal((await stored(p))[L1]?.code, undefined);
  log('cambios sin guardar: el diálogo permite seguir en la lección sin perder nada');

  // «Guardar y cambiar»: se guarda en la lección 1 y se abre la 2 con su propio código.
  await pickLesson(p, L2);
  await p.click('#switch-dialog button[value="save"]');
  await p.waitForURL(/leccion=arduino-protoboard-semaforo/);
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await p.textContent('.lab-top__course'), 'Electrónica y C++ con Arduino · Lección 2');
  assert.match(await code(p), /Lección 2: semáforo/);
  assert.equal((await stored(p))[L1].code, '// lección 1 sin guardar\nvoid setup(){}\nvoid loop(){}\n');
  assert.equal((await stored(p))[L2]?.code, undefined);
  assert.match(await p.textContent('.lesson-picker__prev'), /Lección 1/);
  log('«Guardar y cambiar»: código de la lección 1 guardado; la 2 abre su ejemplo');

  // «Descartar y cambiar»: la 2 no guarda nada; la 3 se abre.
  await setCode(p, '// borrador de la 2 que se descarta');
  await pickLesson(p, L3);
  await p.click('#switch-dialog button[value="discard"]');
  await p.waitForURL(/leccion=arduino-pwm-brillo/);
  await p.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.match(await code(p), /Lección 3: brillo con PWM/);
  assert.equal((await stored(p))[L2]?.code, undefined);
  log('«Descartar y cambiar»: nada se guarda en la lección 2');

  // Sin cambios: el cambio es directo y la lección 1 recupera su código.
  await pickLesson(p, L1);
  await p.waitForURL(/leccion=arduino-led-serie/);
  assert.equal(await code(p), '// lección 1 sin guardar\nvoid setup(){}\nvoid loop(){}\n');
  // Navegación del historial: atrás vuelve a la 3 con su ejemplo intacto.
  await p.goBack();
  await p.waitForFunction(() => document.querySelector('.lab-top__course').textContent.endsWith('Lección 3'));
  assert.match(await code(p), /Lección 3/);
  log('sin cambios: cambio directo; cada lección conserva su propio código');

  // Identificador desconocido: no se monta nada ni se escribe nada.
  const before = await p.evaluate(() => JSON.stringify({ ...localStorage }));
  const calls = [];
  p.on('request', (r) => { if (r.url().includes('/api/')) calls.push(r.method() + ' ' + r.url()); });
  for (const bad of ['no-existe', 'ARDUINO-PWM-BRILLO', '%3Cscript%3Ealert(1)%3C%2Fscript%3E']) {
    await p.goto(`${LAB}?leccion=${bad}`);
    await p.waitForSelector('#unknown-lesson');
    assert.equal(await p.isVisible('.lab__work'), false);
    assert.equal(await p.locator('.lesson-picker__list a').count(), 5);
    assert.match(await p.textContent('#unknown-lesson'), /No hay ninguna lección/);
    assert.equal(await p.locator('#unknown-lesson script').count(), 0);
  }
  assert.equal(await p.evaluate(() => JSON.stringify({ ...localStorage })), before);
  assert.deepEqual(calls, []);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/leccion-desconocida.png` });
  await p.click(`.lesson-picker__list a[data-lesson="${L2}"]`);
  await p.waitForURL(/leccion=arduino-protoboard-semaforo/);
  log('lección desconocida: sin editor, sin llamadas al aula ni cambios en el navegador');
  await ctx.close();
}

// ---------- 2. Semáforo: simulación del HEX, reto y fallo explicado ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L2);
  // Pista del paso actual con el ejemplo sin tocar.
  await p.click('[data-act="hint"]');
  assert.match(await p.textContent('.guide__text'), /sobre la protoboard/);
  // El ejemplo inicial: solo el verde, y se ve en el circuito.
  await p.click('#btn-run');
  await p.waitForSelector('.c-led--green.is-on', { timeout: 15000 });
  assert.equal(await p.locator('.c-led--yellow.is-on, .c-led--red.is-on').count(), 0);
  await p.click('#btn-stop');
  // La solución: las luces se turnan sin coincidir.
  await setCode(p, SEMAFORO);
  await p.click('#btn-run');
  await p.waitForFunction(() => document.querySelector('#monitor').textContent.includes('Verde'), null, { timeout: 15000 });
  let maxOn = 0;
  const seen = new Set();
  for (let i = 0; i < 45; i++) {
    const on = await p.$$eval('.c-led.is-on', (els) => els.map((e) => e.dataset.pin));
    on.forEach((x) => seen.add(x));
    maxOn = Math.max(maxOn, on.length);
    if (seen.size === 3) break;
    await p.waitForTimeout(200);
  }
  assert.deepEqual([...seen].sort(), ['2', '3', '4']);   // verde, amarillo y rojo (empieza a los 4 s)
  assert.ok(maxOn <= 1, 'dos LED a la vez en la ilustración');
  assert.match(await p.textContent('#monitor'), /Verde\nAmarillo\nRojo/);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/semaforo-escritorio.png` });
  await p.click('#btn-stop');
  log('semáforo: el circuito sigue a los pines del HEX, sin dos luces a la vez');

  let result = await check(p);
  assert.match(result, /^Reto superado/, result);
  assert.match(await p.textContent('#progress-state'), /Reto superado/);
  assert.match(await p.textContent('.guide__text'), /dos ciclos completos/);
  await setCode(p, SEMAFORO_SOLAPE);
  result = await check(p);
  assert.match(result, /Todavía no/);
  assert.match(result, /a la vez durante/);
  assert.match(await p.textContent('#progress-state'), /Reto superado/);   // un fallo posterior no borra el registro
  await p.click('[data-act="hint"]');
  assert.match(await p.textContent('.guide__text'), /luces a la vez|tiempos/);
  log('semáforo: la solución aprueba; el solape suspende con su explicación');
  await p.reload();
  assert.match(await p.textContent(`.lesson-picker__list a[data-lesson="${L2}"]`), /Superado/);
  await ctx.close();
}

// ---------- 3. PWM: medición, brillo, reto y rendimiento ----------
{
  const ctx = await context();
  const p = await ctx.newPage();
  await open(p, L3);
  const meter = async () => [await p.textContent('.pwm-meter__value'), await p.textContent('.pwm-meter__freq')];
  for (const [v, pct, freq] of [[64, '25 %', /PWM a 490 Hz/], [191, '75 %', /PWM a 490 Hz/], [255, '100 %', /salida continua/], [0, '0 %', /salida continua/]]) {
    await setCode(p, fijo(v));
    await p.click('#btn-run');
    await p.waitForFunction((t) => document.querySelector('.pwm-meter__value').textContent === t, pct, { timeout: 15000 });
    await p.waitForTimeout(300);
    const [value, f] = await meter();
    assert.equal(value, pct);
    assert.match(f, freq);
    const b = Number(await p.$eval('.c-led', (e) => e.style.getPropertyValue('--b')));
    assert.ok(Math.abs(b - v / 255) < 0.02, `brillo ${b} para ${v}`);
    assert.equal(await p.locator('.c-led.is-on').count(), v ? 1 : 0);
    const dot = await p.textContent('.pin-dot[data-pin="9"]');
    if (v && v < 255) assert.match(dot, new RegExp(pct)); else assert.doesNotMatch(dot, /%/);
    if (SHOTS && v === 64) await p.screenshot({ path: `${SHOTS}/pwm-escritorio.png` });
    await p.click('#btn-stop');
  }
  log('PWM: % y frecuencia medidos en D9; 0 y 255 sin frecuencia; brillo del LED según lo medido');

  // Reto: se compila antes para medir solo la evaluación.
  await setCode(p, RESPIRA);
  await p.click('#btn-compile');
  await p.waitForFunction(() => /Compilado/.test(document.querySelector('#status').textContent), null, { timeout: 20000 });
  const t0 = Date.now();
  let result = await check(p);
  const evalMs = Date.now() - t0;
  assert.match(result, /^Reto superado/, result);
  assert.ok(evalMs < 5000, `evaluación de 6 s simulados en ${evalMs} ms`);
  await setCode(p, ESCALONES);
  result = await check(p);
  assert.match(result, /Todavía no/);
  assert.match(result, /saltó/);
  log(`PWM: la respiración aprueba (evaluación en ${evalMs} ms); los saltos suspenden con explicación`);

  // Tiempo real con PWM en dos pines: la interfaz responde, el tiempo simulado sigue al reloj y la memoria no crece.
  const largo = process.env.LAB_LARGA ? 60000 : 15000;
  await setCode(p, `void setup() { }
void loop() { for (int v = 1; v < 255; v++) { analogWrite(9, v); analogWrite(5, 255 - v); delay(8); } }
`);
  await p.click('#btn-run');
  await p.waitForFunction(() => document.querySelector('#sim-state').textContent === 'En ejecución', null, { timeout: 15000 });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  const heap = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize').value;
  await p.evaluate(() => { window.__lag = 0; let last = performance.now(); window.__lagTimer = setInterval(() => { const now = performance.now(); window.__lag = Math.max(window.__lag, now - last - 50); last = now; }, 50); });
  await p.waitForTimeout(3000);
  const heap1 = await heap();
  const sim1 = parseFloat((await p.textContent('#sim-time')).replace('t = ', ''));
  await p.waitForTimeout(largo);
  const sim2 = parseFloat((await p.textContent('#sim-time')).replace('t = ', ''));
  const heap2 = await heap();
  const lag = await p.evaluate(() => window.__lag);
  assert.ok(sim2 - sim1 > largo / 1000 * 0.9, `tiempo simulado ${sim1} → ${sim2}`);
  assert.ok(lag < 250, `bloqueo de la interfaz: ${lag} ms`);
  assert.ok(heap2 - heap1 < 15e6, `memoria ${heap1} → ${heap2}`);
  assert.match(await p.textContent('.pin-dot[data-pin="5"]'), /%/);
  await p.click('#btn-stop');
  log(`tiempo real con PWM en D9 y D5 (${largo / 1000} s): simulación ${(sim2 - sim1).toFixed(1)} s, bloqueo máx. ${Math.round(lag)} ms, memoria ${((heap2 - heap1) / 1e6).toFixed(1)} MB`);
  await ctx.close();
}

// ---------- 4. Móvil: cada lección sin desbordamiento; selector y diálogo dentro de la pantalla ----------
{
  const ctx = await context({ ...devices['Pixel 7'] });
  const m = await ctx.newPage();
  for (const id of [L1, L2, L3]) {
    await open(m, id);
    await m.click('.lesson-picker__box > summary');
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), id);
    const svg = await m.locator('#circuit svg').boundingBox();
    assert.ok(svg.x >= 0 && svg.x + svg.width <= 412, id);
    if (SHOTS) await m.screenshot({ path: `${SHOTS}/movil-${id}.png`, fullPage: true });
  }
  await setCode(m, '// cambio');
  await m.click(`.lesson-picker__list a[data-lesson="${L1}"]`);
  const box = await m.locator('#switch-dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 412, JSON.stringify(box));
  await m.click('#switch-dialog button[value="cancel"]');
  await ctx.close();
  log('móvil: tres lecciones sin desbordamiento; selector y diálogo dentro de la pantalla');
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
  const correo = `lecciones.${sufijo}@example.com`;
  const { json } = await api(ctxA, 'POST', '/registro', { nombre: 'Estudiante lecciones', correo, clave: 'clave-ficticia-e2e-1' });
  await api(ctxA, 'POST', '/inscripciones', { curso_id: 'course-arduino' }, json.csrf);
  const pa = await ctxA.newPage();
  const openA = async (id) => {
    await pa.goto(`${LABA}?leccion=${id}`);
    await pa.waitForFunction(() => !/Conectando/.test(document.querySelector('#cuenta-estado').textContent));
  };
  const saveA = async (text) => {
    await setCode(pa, text);
    await pa.click('#btn-save');
    await pa.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
  };
  for (const id of [L2, L3]) {
    await openA(id);
    assert.match(await pa.textContent('#cuenta-estado'), /aún no tiene copia/);
    await saveA(`// cuenta ${id}`);
  }
  assert.equal(await remote(ctxA, L1), null);
  assert.equal((await remote(ctxA, L2)).codigo, `// cuenta ${L2}`);
  assert.equal((await remote(ctxA, L3)).codigo, `// cuenta ${L3}`);
  log('cuenta: cada lección guarda su propio borrador; la lección 1 no se toca');

  // «Guardar y cambiar» también sube a la cuenta antes de salir.
  await setCode(pa, `// cuenta ${L3} v2`);
  await pickLesson(pa, L2);
  await pa.click('#switch-dialog button[value="save"]');
  await pa.waitForURL(/leccion=arduino-protoboard-semaforo/);
  assert.equal((await remote(ctxA, L3)).codigo, `// cuenta ${L3} v2`);
  assert.equal((await remote(ctxA, L3)).version, 2);
  log('cuenta: «Guardar y cambiar» sube el código antes de cambiar');

  // Conflicto solo en la lección donde ocurre.
  const ctxB = await context(devices['Pixel 5']);
  await api(ctxB, 'POST', '/sesion', { correo, clave: 'clave-ficticia-e2e-1' });
  const pb = await ctxB.newPage();
  await pb.goto(`${LABA}?leccion=${L2}`);
  await pb.waitForFunction(() => /Código recuperado de tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  await setCode(pb, `// ${L2} desde el móvil`);
  await pb.click('#btn-save');
  await pb.waitForFunction(() => /Guardado en tu cuenta\./.test(document.querySelector('#cuenta-estado').textContent));
  await openA(L2);   // este navegador tenía la versión anterior
  assert.equal(await pa.isVisible('#cuenta-eleccion'), true);
  assert.equal(await code(pa), `// cuenta ${L2}`);
  await openA(L3);
  assert.equal(await pa.isVisible('#cuenta-eleccion'), false);
  assert.match(await pa.textContent('#cuenta-estado'), /Sincronizado/);
  log('conflicto de versiones aislado a su lección');

  // Lección desconocida con sesión: ninguna llamada a borradores.
  const calls = [];
  pa.on('request', (r) => { if (r.url().includes('/borradores/')) calls.push(r.url()); });
  await pa.goto(`${LABA}?leccion=arduino-servo-posiciones`);
  await pa.waitForSelector('#unknown-lesson');
  await pa.waitForTimeout(500);
  assert.deepEqual(calls, []);
  log('lección desconocida con sesión: sin llamadas a borradores');

  // API anterior (sin las lecciones nuevas): aviso y guardado solo local, sin errores.
  const pc = await ctxA.newPage();
  await pc.route(`**/api/aula/borradores/${L3}`, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Lección no disponible."}' }));
  await pc.goto(`${LABA}?leccion=${L3}`);
  await pc.waitForFunction(() => /todavía no se guarda en tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  await setCode(pc, '// solo local');
  await pc.click('#btn-save');
  assert.equal((await pc.evaluate((k) => JSON.parse(localStorage.getItem(k)).lessons, KEY))[L3].code, '// solo local');
  assert.equal(await pc.isVisible('#btn-cuenta-reintentar'), false);
  if (SHOTS) await pc.locator('#editor-zone').screenshot({ path: `${SHOTS}/api-anterior.png` });
  log('API sin la lección: aviso claro y guardado local');

  // Aprobar es local: la cuenta solo guarda código.
  await openA(L3);
  await pa.click('#btn-usar-local').catch(() => {});
  await setCode(pa, RESPIRA);
  assert.match(await check(pa), /^Reto superado/);
  await pa.waitForFunction(() => /Guardado en tu cuenta/.test(document.querySelector('#cuenta-estado').textContent));
  const b3 = await remote(ctxA, L3);
  assert.deepEqual(Object.keys(b3).sort(), ['actualizado_en', 'codigo', 'version']);
  assert.match(await pa.textContent('.progress-note'), /solo en este navegador/);
  log('reto superado: el resultado queda en el navegador; la cuenta guarda solo el código');
  await ctxA.close();
  await ctxB.close();
}

assert.deepEqual(errors, []);
await browser.close();
console.log('Todas las comprobaciones de las lecciones pasaron.');
