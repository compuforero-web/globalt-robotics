// Necesita un servidor local con compilación real; no usa respuestas de compilación simuladas.
// LAB_URL=http://127.0.0.1:8080/games/laboratorio-arduino/index.html node tests/e2e/evasor-decision.e2e.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.env.LAB_URL || 'http://127.0.0.1:8080/games/laboratorio-arduino/index.html';
const ID = 'arduino-evasor-decision';
const KEY = 'globalt.laboratorio.arduino.v1';
const fx = n => readFileSync(new URL(`../fixtures/laboratorio/${n}.ino`, import.meta.url), 'utf8');
const launchOptions = {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  ...(process.env.LAB_SINGLE_PROCESS === '1' ? { args: ['--single-process', '--no-zygote', '--disable-gpu', '--in-process-gpu'] } : {}),
};
let browser;
try {
 for (const [name, options] of [['desktop', {viewport:{width:1440,height:1000}}], ['mobile', devices['Pixel 7']]]) {
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(`${BASE}?leccion=${ID}`);
  await page.waitForFunction(()=>document.querySelector('#service').dataset.kind !== '');
  assert.equal(await page.locator('.lesson-picker__list a').count(),15);
  assert.equal(await page.locator('#circuit [data-bench]').count(),2);
  assert.equal(await page.locator('#circuit .c-motor').count(),2);
  assert.equal(await page.evaluate(()=>new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size===document.querySelectorAll('[id]').length),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.click('#btn-run');
  await page.waitForFunction(()=>document.querySelector('#monitor').textContent.includes('Distancia:'));
  const range=page.locator('.sonar-ctl__range');
  await range.fill('18'); await range.dispatchEvent('input');
  await page.waitForFunction(()=>document.querySelector('#monitor').textContent.includes('Distancia: 18'));
  for (const node of await page.locator('.motor-read__order').all()) assert.match(await node.textContent(), /libre/);
  await page.click('#btn-stop');
  await page.locator('.code-editor__input').fill(fx('evasor-solucion'));
  await page.click('#btn-save');
  const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).lessons['arduino-evasor-decision'],KEY);
  assert.equal(before.code,fx('evasor-solucion'));
  await page.click('#btn-check');
  await page.waitForFunction(()=>/^Reto superado/.test(document.querySelector('#eval-result').textContent),null,{timeout:60000});
  await page.reload();
  assert.equal(await page.inputValue('.code-editor__input'),fx('evasor-solucion'));
  await page.click('#btn-run');
  await page.waitForFunction(()=>document.querySelector('.motor-read__order').textContent.includes('adelante'));
  await page.locator('.sonar-ctl__check').check();
  await page.waitForFunction(()=>[...document.querySelectorAll('.motor-read__order')].every(n=>/freno|libre/.test(n.textContent)));
  await page.locator('.sonar-ctl__check').uncheck();
  await page.waitForFunction(()=>document.querySelector('.motor-read__order').textContent.includes('adelante'));
  await page.click('#btn-stop');
  await page.locator('.code-editor__input').fill(fx('evasor-sin-eco-avanza'));
  await page.click('#btn-check');
  await page.waitForFunction(()=>/^Todavía no/.test(document.querySelector('#eval-result').textContent),null,{timeout:60000});
  assert.match(await page.textContent('#eval-result'), /Sin eco/);
  // Guardar otro borrador no modifica la lección anterior; después volvemos al banco.
  page.on('dialog',d=>d.accept());
  await page.goto(`${BASE}?leccion=arduino-led-serie`);
  const other=await page.inputValue('.code-editor__input');
  assert.notEqual(other,fx('evasor-solucion'));
  await page.goto(`${BASE}?leccion=${ID}`);
  assert.equal(await page.inputValue('.code-editor__input'),fx('evasor-solucion'));
  assert.deepEqual(errors,[]);
  if(process.env.LAB_SHOTS) await page.locator('#circuit').screenshot({path:`${process.env.LAB_SHOTS}/evasor-${name}.png`});
  console.log(`OK ${name}: circuito, pines, sensor interactivo, compilación real, reto, sin eco y borrador aislado`);
  await context.close();
  await browser.close();
 }
} finally { await browser?.close(); }
