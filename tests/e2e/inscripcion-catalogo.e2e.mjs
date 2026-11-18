// Réplica local, registro abierto, base de datos exclusiva de pruebas.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = 'http://127.0.0.1:8182';
const browser = await chromium.launch();
try {
  for (const [width, id] of [[380, 'course-python'], [1366, 'course-web']]) {
    const context = await browser.newContext({viewport:{width, height:900}});
    const page = await context.newPage();
    await page.goto(origin);
    const signup = page.locator('.course-card a', {hasText: /^Inscribirme$/});
    await signup.first().waitFor();
    assert.equal(await signup.count(), 8);
    assert.equal(await page.locator('.course-card a[href="games/laboratorio-arduino/index.html"]').count(), 1);
    await page.locator('.course-card a[href="aula/?curso=' + id + '"]').click();
    await page.locator('#form-registro:visible').waitFor();
    const email = randomUUID() + '@example.com';
    const password = 'prueba-inscripcion-263';
    await page.fill('#form-registro [name=nombre]', 'Estudiante de prueba');
    await page.fill('#form-registro [name=correo]', email);
    await page.fill('#form-registro [name=clave]', password);
    await page.click('#form-registro button');
    await page.locator('#catalogo [data-inscribir="' + id + '"]').waitFor();
    assert.equal(await page.locator('#mis-cursos .curso').count(), 0);
    await page.getByRole('button', {name:'Confirmar inscripción'}).click();
    const lab = page.locator('#mis-cursos a', {hasText:'Abrir laboratorio'});
    await lab.waitFor();
    assert.match(await lab.getAttribute('href'), new RegExp('laboratorio-' + id.slice(7)));
    assert.equal(await page.locator('#mis-cursos .leccion').count(), 0);
    await page.click('#btn-salir');
    await page.fill('#form-entrar [name=correo]', email);
    await page.fill('#form-entrar [name=clave]', password);
    await page.click('#form-entrar button');
    await lab.waitFor();
    assert.equal(await page.locator('#mis-cursos .curso').count(), 1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await context.close();
    console.log(width, id, 'registro, confirmación, acceso y persistencia OK');
  }
} finally { await browser.close(); }
