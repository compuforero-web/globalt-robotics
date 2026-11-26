// Recorrido del ensayo de octavo sobre la réplica dedicada, en el mismo orden que la guía PDF del profesor:
// clase de la cartilla (19, 20 y 21 cm), bloqueo y desbloqueo de la segunda fase con compilación real, y dos familias
// que se registran desde un celular, confirman el correo en el buzón de ensayo y ven solo a su estudiante.
// ENSAYO_ORIGEN es la dirección que usa el celular (la IP pasada a ensayo.sh iniciar); el profesor usa 127.0.0.1.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const local = 'http://127.0.0.1:18180';
const celular = process.env.ENSAYO_ORIGEN || local;
const navegador = await chromium.launch();
try {
  // 1. Profesor en el equipo del aula.
  const profesor = await navegador.newPage();
  await profesor.goto(local + '/aula/');
  await profesor.click('#tab-entrar');
  await profesor.fill('#form-entrar [name=correo]', 'profesor.octavo@example.com');
  await profesor.fill('#form-entrar [name=clave]', readFileSync('.ensayo-octavo/profesor', 'utf8'));
  await profesor.click('#form-entrar button');
  await profesor.locator('#form-autorizacion:visible').waitFor();
  for (const casilla of await profesor.locator('#form-autorizacion input[type=checkbox]').all()) await casilla.check();
  await profesor.click('#form-autorizacion button');
  await profesor.locator('#vista-cursos:visible').waitFor();

  // 2. Clase de la cartilla: la regla «20 cm o menos» en el límite exacto.
  await profesor.goto(local + '/programa/octavo.html');
  await profesor.getByRole('link', { name: 'Abrir el reto de 19, 20 y 21 cm' }).click();
  await profesor.locator('#umbral').fill('20');
  await profesor.locator('#op').selectOption('lt');
  for (const [cm, accion] of [[19, 'El robot se detiene.'], [20, 'El robot avanza.'], [21, 'El robot avanza.']]) {
    await profesor.locator('#dist').fill(String(cm));
    assert.equal(await profesor.locator('#accion').innerText(), accion);
  }
  await profesor.click('#test');
  assert.equal(await profesor.locator('#result').innerText(), 'Revisa el caso de 20 cm. Tu robot debería detenerse.');
  await profesor.locator('#op').selectOption('le');
  await profesor.locator('#dist').fill('20');
  assert.equal(await profesor.locator('#accion').innerText(), 'El robot se detiene.');
  await profesor.click('#test');
  assert.match(await profesor.locator('#result').innerText(), /^Reto superado/);

  // 3. Fase 1 con el código inicial (incorrecto para el reto): la fase 2 sigue bloqueada.
  await profesor.goto(local + '/programa/octavo.html');
  await profesor.getByRole('link', { name: /Abrir la primera fase/ }).click();
  await profesor.locator('#lesson-picker').getByText('2. ', { exact: false }).waitFor();
  await profesor.click('#btn-check');
  await profesor.getByText('El reto aún no se cumple.', { exact: true }).waitFor({ timeout: 90000 });
  assert.match(await profesor.locator('#lesson-picker').innerText(), /Pendiente de la fase anterior/);
  assert.equal(await profesor.locator('#lesson-picker a[data-lesson="arduino-ultrasonico-alerta"]').count(), 0);
  await profesor.goto(local + '/games/laboratorio-arduino/index.html?grado=8&leccion=arduino-ultrasonico-alerta');
  await profesor.getByText('Completa las fases en orden con el botón «Comprobar reto».', { exact: true }).waitFor();

  // 4. Programa correcto: la fase 2 se habilita y abre.
  await profesor.getByRole('link', { name: 'Abrir mi fase disponible' }).click();
  await profesor.locator('.code-editor__input').fill(readFileSync('tests/fixtures/laboratorio/ultra-solucion.ino', 'utf8'));
  await profesor.click('#btn-check');
  const fase2 = profesor.locator('#lesson-picker a[data-lesson="arduino-ultrasonico-alerta"]');
  await fase2.waitFor({ timeout: 90000 });
  assert.match(await profesor.locator('#lesson-picker').innerText(), /Superada/);
  await fase2.click();
  await profesor.locator('#lesson-picker').getByText('Octavo · Fase 2 de 5', { exact: true }).waitFor();

  // 5. Dos familias desde el celular, cada una con su estudiante y su observación.
  const familias = [
    { alumno: 'Estudiante Sol', nombre: 'Familia Sol', correo: 'familia.sol@example.com',
      observacion: 'Explicó por qué se detiene a 20 cm.' },
    { alumno: 'Estudiante Viento', nombre: 'Familia Viento', correo: 'familia.viento@example.com',
      observacion: 'Midió 19, 20 y 21 cm y corrigió su predicción.' },
  ];
  await profesor.goto(local + '/aula/familias.html');
  for (const f of familias) {
    await profesor.locator('#alumno').selectOption({ label: f.alumno + ' · 8°' });
    await profesor.locator('[name=titulo]').fill('¿Cuándo debe frenar el robot?');
    await profesor.locator('[name=fecha]').fill('2026-11-30');
    await profesor.locator('[name=observacion]').fill(f.observacion);
    await profesor.locator('#actividad button').click();
    await profesor.getByText('Actividad publicada.', { exact: true }).waitFor();
    const resumen = profesor.getByText('Invitar a un acudiente', { exact: true });
    if (!await profesor.locator('#invitacion').isVisible()) await resumen.click();
    await profesor.locator('#invitacion [name=correo]').fill(f.correo);
    await profesor.locator('#invitacion button').click();
    await profesor.locator('#generado:visible').waitFor();
    f.codigo = await profesor.locator('#generado').inputValue();
  }
  const clave = 'Solo-ensayo-octavo-2027';
  for (const [i, f] of familias.entries()) {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const tel = await ctx.newPage();
    await tel.goto(celular + '/aula/');
    await tel.click('#tab-registro');
    await tel.click('#btn-adulto');
    const form = tel.locator('#form-registro');
    await form.locator('[name=nombre]').fill(f.nombre);
    await form.locator('[name=correo]').fill(f.correo);
    await form.locator('[name=clave]').fill(clave);
    await form.locator('[name=confirmacion]').fill(clave);
    await form.locator('[name=terminos]').check();
    await form.locator('[name=datos]').check();
    await form.locator('button[type=submit]').click();
    await tel.locator('#vista-correo:visible').waitFor();
    // Buzón de ensayo en el mismo celular: el correo exacto muestra el botón de confirmación.
    await tel.goto(celular + '/buzon-ensayo/');
    await tel.locator('[name=correo]').fill(f.correo);
    await tel.getByRole('button', { name: 'Buscar mis mensajes' }).click();
    const confirmar = tel.getByRole('link', { name: 'Confirmar mi correo' }).first();
    await confirmar.waitFor();
    assert.ok((await confirmar.getAttribute('href')).startsWith(celular + '/aula/'));
    assert.doesNotMatch(await tel.locator('main').innerText(), new RegExp(familias[1 - i].correo));
    await confirmar.click();
    await tel.locator('#form-enlace [name=clave]').fill(clave);
    await tel.click('#btn-enlace');
    await tel.getByRole('link', { name: 'Seguimiento familiar' }).click();
    if (i === 1) {   // E2 de la guía: el código de otra familia no vincula
      await tel.locator('#vinculo [name=codigo]').fill(familias[0].codigo);
      await tel.locator('#vinculo button').click();
      await tel.getByText('Revisa el código y el correo verificado de tu cuenta.', { exact: true }).waitFor();
      assert.equal(await tel.locator('#historial article').count(), 0);
    }
    await tel.locator('#vinculo [name=codigo]').fill(f.codigo);
    await tel.locator('#vinculo button').click();
    await tel.getByText(f.observacion, { exact: true }).waitFor();
    const historial = await tel.locator('#historial').innerText();
    assert.equal(await tel.locator('#historial article').count(), 1);
    assert.match(historial, new RegExp(f.alumno));
    assert.doesNotMatch(historial, new RegExp(familias[1 - i].alumno));
    assert.doesNotMatch(historial, new RegExp(familias[1 - i].observacion));
    assert.equal(await tel.locator('#profesor').isVisible(), false);
    await tel.reload();
    await tel.getByText(f.observacion, { exact: true }).waitFor();
    assert.equal(await tel.locator('#historial article').count(), 1);
    await ctx.close();
  }
} finally {
  await navegador.close();
}
