// Réplica local, registro abierto, base de datos exclusiva de pruebas.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { enlaceDe, esperarCorreo } from './cuenta-prueba.mjs';
const origin = process.env.AULA_SITIO || 'http://127.0.0.1:8180';
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
    await page.locator('#paso-edad:visible').waitFor();
    await page.click('#btn-adulto');
    const email = randomUUID() + '@example.com';
    const password = 'prueba-inscripcion-263';
    await page.fill('#form-registro [name=nombre]', 'Estudiante de prueba');
    await page.fill('#form-registro [name=correo]', email);
    await page.fill('#form-registro [name=clave]', password);
    const confirmar = page.locator('#registro-confirmacion');
    await confirmar.fill(password + 'x');
    await page.click('#ver-claves');
    assert.equal(await confirmar.getAttribute('type'), 'text');
    await page.waitForFunction(() => document.querySelector('#registro-clave').type === 'password');
    assert.equal(await confirmar.getAttribute('type'), 'password');
    await page.check('#form-registro [name=terminos]');
    await page.check('#form-registro [name=datos]');
    await page.click('#form-registro button[type=submit]');
    assert.match(await confirmar.evaluate(c => c.validationMessage), /no coinciden/);
    assert.equal(await page.locator('#form-registro [name=correo]').inputValue(), email);
    await confirmar.fill(password);
    await page.click('#form-registro button[type=submit]');
    await page.locator('#vista-correo:visible').waitFor();
    await page.goto(enlaceDe(await esperarCorreo(email, 1), 'verificar'));   // vuelve con ?curso= del enlace
    await page.fill('#form-enlace [name=clave]', password);
    await page.click('#btn-enlace');
    await page.locator('#catalogo [data-inscribir="' + id + '"]').waitFor();
    assert.equal(await page.locator('#mis-cursos .curso').count(), 0);
    await page.getByRole('button', {name:'Confirmar inscripción'}).click();
    const lab = page.locator('#mis-cursos .btn-continuar');
    await lab.waitFor();
    assert.match(await lab.getAttribute('href'), new RegExp('laboratorio-' + id.slice(7)));
    assert.equal(await page.locator('#mis-cursos .leccion').count(), 5);
    const segunda = page.locator('#mis-cursos .leccion a').nth(1);
    const destino = await segunda.getAttribute('href');
    await segunda.click();
    await page.waitForFunction(() => document.querySelector('#cuenta-avance')?.textContent.includes('Avance sincronizado'));
    await page.goto(origin + '/aula/');
    await lab.waitFor();
    assert.equal(await lab.getAttribute('href'), destino);
    await page.click('#btn-salir');
    await page.click('#tab-entrar');
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
