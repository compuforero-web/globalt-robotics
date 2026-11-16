// Prueba manual de extremo a extremo del laboratorio (no la ejecuta CI: necesita Chromium y el compilador).
// Uso: LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html node tests/e2e/laboratorio.e2e.mjs
//      LAB_PENDIENTE_URL=…  (opcional) servidor sin compilador para comprobar «Compilación próximamente»
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// require() encuentra Playwright también cuando está instalado de forma global (NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const URL_LAB = process.env.LAB_URL || 'http://localhost:8080/games/laboratorio-arduino/index.html';
const SHOTS = process.env.LAB_SHOTS || '';
const SOLUTION = `const int LED = 13;
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
const log = (...a) => console.log('✔', ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto(URL_LAB);
await page.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
assert.equal(await page.locator('#service').getAttribute('data-kind'), 'ok');
log('compilador detectado:', await page.textContent('#service'));

const setCode = async (code) => {
  await page.locator('.code-editor__input').fill(code);
};
const status = () => page.textContent('#status');
const checkChallenge = async (p = page) => {
  await p.click('#btn-check');
  await p.waitForFunction(() => !/evaluando/i.test(document.querySelector('#eval-result').textContent), null, { timeout: 30000 });
  return p.textContent('#eval-result');
};

// 1. Ejemplo correcto: compila, ejecuta, LED y monitor responden.
await page.click('#btn-run');
await page.waitForFunction(() => document.querySelector('#monitor').textContent.includes('LED encendido'), null, { timeout: 15000 });
assert.match(await page.textContent('#monitor'), /Hola, soy tu Arduino Nano/);
await page.waitForSelector('.c-led.is-on', { timeout: 3000 });
await page.waitForSelector('.c-led:not(.is-on)', { timeout: 3000 });
log('ejemplo: LED parpadea y el monitor muestra texto ·', await status());
if (SHOTS) await page.screenshot({ path: SHOTS + '/escritorio.png' });

// 2. Detener congela la simulación.
await page.click('#btn-stop');
const t1 = await page.textContent('#sim-time');
await page.waitForTimeout(700);
assert.equal(await page.textContent('#sim-time'), t1);
assert.equal(await page.textContent('#sim-state'), 'Detenida');
log('detener: el tiempo simulado queda en', t1);

// 3. Reiniciar arranca desde cero con el mismo programa.
await page.click('#btn-reset');
await page.waitForFunction(() => document.querySelector('#monitor').textContent.startsWith('Hola'));
log('reiniciar: el programa vuelve a empezar');
await page.click('#btn-stop');

// 4. Ejecutar el ejemplo NO aprueba el reto.
assert.match(await checkChallenge(), /Todavía no/);
log('el ejemplo sin modificar no supera el reto');

// 5. Errores de sintaxis: línea, mensaje original y explicación.
await setCode('void setup() {\n  pinMode(13, OUTPUT)\n}\n\nvoid loop() {\n  digitalWrit(13, HIGH);\n}\n');
assert.equal(await page.textContent('#save-state'), 'Cambios sin guardar');
await page.click('#btn-compile');
await page.waitForSelector('.diag', { timeout: 15000 });
const diags = await page.locator('.diag').allTextContents();
assert.ok(diags.some((d) => /Línea 3/.test(d) && /expected/.test(d) && /punto y coma/.test(d)), diags.join('\n'));
assert.ok(diags.some((d) => /Línea 6/.test(d) && /digitalWrit/.test(d) && /ortografía/.test(d)));
assert.equal(await page.locator('.code-editor__gutter .is-error').count(), 2);
assert.match(await page.textContent('.guide__text'), /línea 3/i);
log('errores de sintaxis con línea, mensaje original y explicación');

// 6. Modificar el parpadeo cambia el comportamiento simulado (medido sobre el LED).
await setCode(`void setup(){ pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, HIGH); delay(100); digitalWrite(13, LOW); delay(100); }\n`);
assert.match(await checkChallenge(), /Encendidos medidos \(ms\): 100, 100, 100/);
log('parpadeo modificado a 100 ms medido por el evaluador');

// 7. Bucle infinito sin delay: la interfaz sigue respondiendo y Detener funciona.
await setCode('void setup(){ Serial.begin(9600); Serial.println("antes"); }\nvoid loop(){ while (true) { } }\n');
await page.click('#btn-run');
await page.waitForFunction(() => document.querySelector('#monitor').textContent.includes('antes'), null, { timeout: 15000 });
await page.waitForTimeout(1500);
const t2 = await page.textContent('#sim-time');
assert.notEqual(t2, 't = 0.0 s');
await page.click('#btn-stop');
assert.equal(await page.textContent('#sim-state'), 'Detenida');
log('bucle infinito: la simulación avanza (', t2, ') y se detiene');

// 8. Solución correcta: el reto se supera y se guarda.
await setCode(SOLUTION);
assert.match(await checkChallenge(), /^Reto superado/);
assert.match(await page.textContent('#progress-state'), /Reto superado/);
assert.match(await page.textContent('.guide__text'), /Reto superado/);
log('solución correcta: reto superado y guía celebra');

// 9. Recuperar el código guardado tras recargar.
await page.reload();
assert.equal(await page.inputValue('.code-editor__input'), SOLUTION);
assert.match(await page.textContent('#progress-state'), /Reto superado/);
log('código y progreso recuperados tras recargar');

// 10. Restaurar ejemplo.
await page.click('#btn-restore');
assert.match(await page.inputValue('.code-editor__input'), /Lección 1/);
await page.reload();
assert.match(await page.inputValue('.code-editor__input'), /Lección 1/);
assert.match(await page.textContent('#progress-state'), /Reto superado/);
log('restaurar ejemplo conserva el registro del reto');

// 11. Guía: minimizar y silenciar no tapan el editor.
await page.click('[data-act="min"]');
assert.ok(await page.isVisible('.guide__chip'));
await page.click('[data-act="max"]');
await page.click('[data-act="mute"]');
assert.equal(await page.getAttribute('[data-act="mute"]', 'aria-pressed'), 'true');
await page.click('[data-act="mute"]');
log('guía minimizable y silenciable');

// 12. Vista móvil sin desplazamiento horizontal y guía sin tapar controles.
const phone = await browser.newContext({ ...devices['Pixel 7'] });
const mobile = await phone.newPage();
await mobile.goto(URL_LAB);
await mobile.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(overflow <= 0, 'desbordamiento horizontal: ' + overflow);
const overlaps = await mobile.evaluate(() => {
  const g = document.querySelector('#guide').getBoundingClientRect();
  return ['#editor', '.toolbar', '#circuit'].some((s) => { const r = document.querySelector(s).getBoundingClientRect(); return !(r.top >= g.bottom || r.bottom <= g.top); });
});
assert.equal(overlaps, false);
await mobile.click('#btn-run');
await mobile.waitForFunction(() => document.querySelector('#monitor').textContent.includes('LED'), null, { timeout: 15000 });
if (SHOTS) { await mobile.locator('#guide').scrollIntoViewIfNeeded(); await mobile.screenshot({ path: SHOTS + '/movil.png', fullPage: true }); }
log('vista móvil: sin desbordamiento, la guía no se superpone, la simulación corre');

// 13. Movimiento reducido: sin animaciones de la guía.
const reduced = await browser.newContext({ reducedMotion: 'reduce' });
const rp = await reduced.newPage();
await rp.goto(URL_LAB);
assert.equal(await rp.evaluate(() => getComputedStyle(document.querySelector('.g-eye')).animationName), 'none');
log('movimiento reducido respetado');

// 14. Sin servicio: aviso para estudiantes, solo se desactivan compilar/ejecutar/comprobar y nunca hay éxito ficticio.
if (process.env.LAB_PENDIENTE_URL) {
  const p2 = await browser.newPage();
  await p2.goto(process.env.LAB_PENDIENTE_URL);
  await p2.waitForFunction(() => document.querySelector('#service').dataset.kind !== '');
  assert.equal(await p2.textContent('#service'), 'Compilación próximamente');
  assert.equal(await p2.textContent('#status'), 'La compilación estará disponible próximamente.');
  for (const id of ['#btn-compile', '#btn-run', '#btn-check']) assert.equal(await p2.isDisabled(id), true, id);
  for (const id of ['#btn-save', '#btn-restore']) assert.equal(await p2.isDisabled(id), false, id);
  assert.equal(await p2.textContent('#sim-state'), 'Detenida');
  assert.doesNotMatch(await p2.textContent('#eval-result'), /superado|aprobado/i);
  log('sin servicio: aviso «Compilación próximamente», acciones de compilación desactivadas y sin aprobar');
}

// 15. Lección guiada: pasos, ejemplos sin sobrescribir, pistas contextuales y errores sin causa inventada.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errors.push(e.message));
  await g.goto(URL_LAB);
  await g.waitForFunction(() => document.querySelector('#service').dataset.kind === 'ok');
  const visibleSteps = () => g.locator('.step:not([hidden])').count();
  assert.equal(await g.locator('.step').count(), 6);
  assert.equal(await visibleSteps(), 1);
  assert.match(await g.textContent('.step:not([hidden]) .step__title'), /circuito/i);

  // Pista contextual del paso actual, progresiva y repetible.
  const hint = async () => { await g.click('[data-act="hint"]'); return g.textContent('.guide__text'); };
  assert.match(await hint(), /Pista 1 de 2 sobre el circuito/);
  assert.match(await hint(), /Pista 2 de 2 sobre el circuito/);
  assert.match(await hint(), /Pista 1 de 2 sobre el circuito/);

  // Recorrer todos los pasos con «Siguiente» y el teclado no aprueba el reto.
  for (let i = 0; i < 5; i++) await g.click('[data-nav="next"]');
  assert.match(await g.textContent('.step:not([hidden]) .step__title'), /reto/i);
  assert.equal(await g.evaluate(() => document.activeElement.classList.contains('step__title')), true);
  assert.match(await g.textContent('.step:not([hidden])'), /Reto/);
  assert.doesNotMatch(await g.textContent('.step:not([hidden])'), /delay\(200\)|delay\(800\)/);
  assert.match(await g.textContent('#progress-state'), /Reto pendiente/);
  assert.equal(await g.evaluate(() => JSON.parse(localStorage.getItem('globalt.laboratorio.arduino.v1')).lessons['arduino-led-serie'].completedAt), undefined);
  assert.equal(await g.locator('.steps__seen:not([hidden])').count(), 5);
  await g.click('[data-nav="next"]');   // en el último paso: repasar desde el paso 1
  assert.match(await g.textContent('.step:not([hidden]) .step__title'), /circuito/i);
  await g.focus('.steps__btn[data-step="0"]');
  await g.keyboard.press('ArrowRight');
  await g.keyboard.press('Enter');
  assert.match(await g.textContent('.step:not([hidden]) .step__title'), /setup/i);
  await g.reload();
  assert.match(await g.textContent('.step:not([hidden]) .step__title'), /setup/i);
  log('lección por pasos: navegación, teclado, repaso y recuerdo del paso sin aprobar el reto');

  // Ejemplo: cancelar no cambia nada; reemplazar no guarda y se puede recuperar el trabajo (incluso sin guardar).
  const mine = '// mi trabajo guardado\nvoid setup(){}\nvoid loop(){}\n';
  await g.locator('.code-editor__input').fill(mine);
  await g.click('#btn-save');
  await g.locator('.code-editor__input').fill(mine + '// cambio sin guardar\n');
  await g.click('.step:not([hidden]) [data-act="try"]');
  assert.ok(await g.isVisible('#example-dialog'));
  await g.keyboard.press('Escape');
  await g.waitForFunction(() => /No se cambió nada/.test(document.querySelector('#status').textContent));
  assert.equal(await g.inputValue('.code-editor__input'), mine + '// cambio sin guardar\n');
  await g.click('.step:not([hidden]) [data-act="try"]');
  await g.click('#example-dialog button[value="replace"]');
  await g.waitForFunction(() => /una sola vez/.test(document.querySelector('.code-editor__input').value));
  assert.equal(await g.textContent('#save-state'), 'Cambios sin guardar');
  assert.equal(await g.evaluate(() => JSON.parse(localStorage.getItem('globalt.laboratorio.arduino.v1')).lessons['arduino-led-serie'].code), mine);
  await g.click('#btn-run');
  await g.waitForFunction(() => document.querySelector('#monitor').textContent.includes('Esto se repite'), null, { timeout: 15000 });
  await g.click('#btn-stop');
  assert.equal((await g.textContent('#monitor')).match(/una sola vez/g).length, 1);
  await g.click('#btn-recover');
  assert.equal(await g.inputValue('.code-editor__input'), mine + '// cambio sin guardar\n');
  log('ejemplo: pide elección, no guarda solo, se ejecuta y el código anterior se recupera');

  // Pistas según el código: ritmo correcto pero sin mensaje → pista sobre el mensaje; contador dentro de loop().
  await g.locator('.code-editor__input').fill('void setup(){ pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop(){ digitalWrite(13, HIGH); delay(200); digitalWrite(13, LOW); delay(800); }\n');
  assert.match(await hint(), /sobre el mensaje/);
  await g.locator('.code-editor__input').fill('void setup(){ pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop(){ int n = 0; n++; digitalWrite(13, HIGH); Serial.print("Latido "); Serial.println(n); delay(200); digitalWrite(13, LOW); delay(800); }\n');
  assert.match(await hint(), /dónde vive el contador/);
  const fail = await (async () => { await g.click('#btn-check'); await g.waitForFunction(() => !/evaluando/i.test(document.querySelector('#eval-result').textContent), null, { timeout: 30000 }); return g.textContent('#eval-result'); })();
  assert.match(fail, /Todavía no/);
  log('pistas contextuales según el código, sin aprobar');

  // Error del compilador: pista sobre la línea; mensaje desconocido → no se inventa causa y se conserva el original.
  await g.locator('.code-editor__input').fill('void setup() {\n  Serial.begin(9600)\n}\nvoid loop() {}\n');
  await g.click('#btn-compile');
  await g.waitForSelector('.diag', { timeout: 15000 });
  assert.match(await hint(), /error del compilador.*línea 3/);
  await g.locator('.code-editor__input').fill('void setup() {\n  int a[2] = {1, 2, 3};\n}\nvoid loop() {}\n');
  await g.click('#btn-compile');
  await g.waitForFunction(() => /initializers/.test(document.querySelector('#diagnostics').textContent), null, { timeout: 15000 });
  const diag = await g.textContent('.diag--error');
  assert.match(diag, /too many initializers/);
  assert.match(diag, /No tengo una explicación preparada/);
  assert.match(await g.textContent('.guide__text'), /No tengo una explicación preparada/);
  log('errores: explicación reconocida o aviso honesto, con el diagnóstico original');
  if (SHOTS) await g.screenshot({ path: SHOTS + '/leccion-escritorio.png', fullPage: true });
  await ctx.close();

  // Móvil: pasos y diálogo sin desbordamiento horizontal.
  const phone2 = await browser.newContext({ ...devices['Pixel 7'] });
  const m = await phone2.newPage();
  await m.goto(URL_LAB);
  await m.click('[data-step="1"]');
  await m.click('.step:not([hidden]) [data-act="try"]');
  const box = await m.locator('#example-dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 412, JSON.stringify(box));
  await m.click('#example-dialog button[value="cancel"]');
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  if (SHOTS) await m.screenshot({ path: SHOTS + '/leccion-movil.png', fullPage: true });
  await phone2.close();
  log('móvil: pasos y diálogo dentro de la pantalla');
}

assert.deepEqual(errors, []);
await browser.close();
console.log('Todas las comprobaciones del laboratorio pasaron.');
