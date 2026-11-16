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

assert.deepEqual(errors, []);
await browser.close();
console.log('Todas las comprobaciones del laboratorio pasaron.');
