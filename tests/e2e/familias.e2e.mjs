// Réplica con base y buzón exclusivos de CI.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { crearCuenta } from './cuenta-prueba.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const sitio = process.env.AULA_SITIO;
assert.equal(new URL(sitio).hostname, '127.0.0.1');
const browser = await chromium.launch();
try {
  async function cuenta(nombre) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 850 } });
    const correo = nombre + '@example.com';
    assert.equal((await crearCuenta(ctx, sitio, {nombre, correo, clave: 'solo-replica-2027'})).status, 200);
    return ctx.newPage();
  }
  const profesor = await cuenta('profesor-ficticio');
  execFileSync('python', ['-c', [
    'import os, psycopg',
    'with psycopg.connect(os.environ["AULA_DATABASE_URL"]) as db:',
    '    assert db.execute("UPDATE usuarios SET rol=%s WHERE correo=%s", ("administrador","profesor-ficticio@example.com")).rowcount == 1',
  ].join('\n')]);
  await profesor.goto(sitio + '/aula/');
  await profesor.getByRole('link', { name: 'Seguimiento familiar' }).click();
  for (const nombre of ['alfa', 'beta']) {
    const alias = 'Estudiante ' + nombre;
    const familiar = await cuenta('acudiente-' + nombre);
    await profesor.getByText('Agregar estudiante', { exact: true }).first().click();
    await profesor.locator('#alta [name=nombre]').fill(alias);
    await profesor.locator('#alta [name=grado]').fill('8');
    await profesor.locator('#alta button').click();
    await profesor.getByRole('heading', {name: alias + ' · 8°'}).waitFor();
    await profesor.locator('#alta').locator('..').locator('summary').click();
    await profesor.locator('[name=titulo]').fill('¿Cuándo debe frenar el robot?');
    await profesor.locator('[name=fecha]').fill('2026-11-25');
    await profesor.locator('[name=observacion]').fill('Observación individual de ' + alias);
    await profesor.locator('#actividad button').click();
    await profesor.getByText('Actividad publicada.', {exact:true}).waitFor();
    await profesor.getByText('Invitar a un acudiente', {exact:true}).click();
    await profesor.locator('[name=correo]').fill('acudiente-' + nombre + '@example.com');
    await profesor.locator('#invitacion button').click();
    await profesor.locator('#generado:visible').waitFor();
    const codigo = await profesor.locator('#generado').inputValue();
    await profesor.getByText('Invitar a un acudiente', {exact:true}).click();
    await familiar.goto(sitio + '/aula/familias.html');
    await familiar.locator('[name=codigo]').fill(codigo);
    await familiar.locator('#vinculo button').click();
    await familiar.getByText('Observación individual de ' + alias).waitFor();
    assert.equal(await familiar.locator('#historial article').count(), 1);
    assert.equal(await familiar.locator('#profesor').isVisible(), false);
    await familiar.reload();
    await familiar.getByText('Observación individual de ' + alias).waitFor();
  }
} finally {
  await browser.close();
}
