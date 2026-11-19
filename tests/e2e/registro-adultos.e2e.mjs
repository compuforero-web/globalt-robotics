// Prueba de navegador del registro de ADULTOS (Chromium, escritorio y móvil) contra el Compose de desarrollo:
// API + PostgreSQL + nginx + buzón SMTP de pruebas (correos en services/aula-api/dev/buzon; nunca reales) y
// textos de PRUEBA. No la ejecuta CI.
//
//   AULA_FASE=cerrado node tests/e2e/registro-adultos.e2e.mjs   # API con AULA_REGISTRO_ABIERTO=false
//   AULA_FASE=abierto node tests/e2e/registro-adultos.e2e.mjs   # API con AULA_REGISTRO_ABIERTO=true
//
// Opcional: AULA_SITIO (http://127.0.0.1:8180), AULA_DB_CONTENEDOR (globalt-aula-dev-db-1), AULA_SHOTS=carpeta,
// AULA_PREVIAS=correo1,correo2 (cuentas creadas con la versión anterior, clave AULA_PREVIA_CLAVE) para comprobar
// la transición: aceptar los documentos al entrar y conservar inscripciones y avances de Arduino, Web y Python.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { enlaceDe, esperarCorreo, fallarCorreo } from './cuenta-prueba.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const SITIO = (process.env.AULA_SITIO || 'http://127.0.0.1:8180').replace(/\/$/, '');
const FASE = process.env.AULA_FASE || 'abierto';
const DB = process.env.AULA_DB_CONTENEDOR || 'globalt-aula-dev-db-1';
const SHOTS = process.env.AULA_SHOTS || '';
const PREVIAS = (process.env.AULA_PREVIAS || '').split(',').filter(Boolean);
const PREVIA_CLAVE = process.env.AULA_PREVIA_CLAVE || 'clave-anterior-123';
const CLAVE = 'clave-adulta-e2e-1';
const sufijo = Date.now().toString(36);
const log = (...a) => console.log('✔', ...a);
const sql = (q) => execFileSync('docker', ['exec', DB, 'psql', '-U', 'aula', '-d', 'aula', '-At', '-c', q], { encoding: 'utf8' }).trim();
const conteos = () => sql("SELECT (SELECT count(*) FROM usuarios)||'/'||(SELECT count(*) FROM registros_pendientes)||'/'||(SELECT count(*) FROM autorizaciones)");

const browser = await chromium.launch();
const errores = [];
async function contexto(opciones) {
  const ctx = await browser.newContext(opciones);
  ctx.on('page', (p) => p.on('pageerror', (e) => errores.push(e.message)));
  return ctx;
}
async function foto(p, nombre) { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${nombre}.png`, fullPage: true }); }
async function sinDesborde(p) { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desborde horizontal'); }
const peticionesAula = (p) => { const lista = []; p.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/api/aula/')) lista.push(r.url()); }); return lista; };

const PERFILES = [['escritorio', { viewport: { width: 1366, height: 900 } }], ['movil', { ...devices['Pixel 7'] }]];

try {
  if (FASE === 'cerrado') {
    for (const [nombre, opciones] of PERFILES) {
      const ctx = await contexto(opciones);
      const p = await ctx.newPage();
      await p.goto(SITIO + '/aula/?curso=course-web');
      await p.locator('#registro-cerrado').waitFor();
      assert.equal(await p.isVisible('#tab-registro'), false);
      assert.equal(await p.locator('#btn-invitado').getAttribute('href'), '../games/laboratorio-web/index.html');
      const r = await ctx.request.post(SITIO + '/api/aula/registro', { headers: { Origin: SITIO }, data: {
        nombre: 'Intento', correo: `cerrado.${sufijo}@example.com`, clave: CLAVE, mayor_de_edad: true, terminos: 'prueba-1', datos: 'prueba-1' } });
      assert.equal(r.status(), 403);
      await sinDesborde(p);
      await foto(p, `cerrado-${nombre}`);
      await p.click('#btn-invitado');
      await p.waitForURL(/laboratorio-web/);
      await ctx.close();
      log(nombre, 'registro cerrado: sin pestaña «Crear cuenta», 403 en la API y «Probar sin cuenta» al laboratorio');
    }
  } else {
    for (const [nombre, opciones] of PERFILES) {
      const correo = `adulta.${nombre}.${sufijo}@example.com`;
      // 1. Menor: vuelve a la práctica de invitado sin escribir ni enviar nada.
      let ctx = await contexto(opciones);
      let p = await ctx.newPage();
      const enviadas = peticionesAula(p);
      const antes = conteos();
      await p.goto(SITIO + '/aula/?curso=course-python');
      await p.locator('#paso-edad:visible').waitFor();   // con curso elegido abre «Crear cuenta»
      assert.match(await p.textContent('#eleccion'), /Python desde Cero/);
      assert.equal(await p.isVisible('#form-registro [name=correo]'), false);
      await p.click('#btn-menor');
      await p.locator('#aviso-menor:visible').waitFor();
      assert.equal(await p.locator('input:visible').count(), 0, 'ningún campo de datos para menores');
      await sinDesborde(p);
      await foto(p, `menor-${nombre}`);
      await p.click('#btn-invitado-menor');
      await p.waitForURL(/laboratorio-python/);
      await p.waitForLoadState('networkidle');
      assert.deepEqual(enviadas, [], 'la salida de menor no envía nada');
      assert.equal(conteos(), antes, 'la salida de menor no crea registros');
      await ctx.close();
      log(nombre, 'menor: vuelve a «Practicar sin cuenta» sin enviar datos ni crear registros');

      // 2. Adulto: edad → datos mínimos → casillas sin marcar → correo → enlace con el curso elegido.
      ctx = await contexto(opciones);
      p = await ctx.newPage();
      await p.goto(SITIO + '/aula/?curso=course-python');
      await p.click('#btn-adulto');
      const f = p.locator('#form-registro');
      assert.equal(await f.locator('input').count(), 5, 'nombre/alias, correo, contraseña y dos casillas');
      assert.equal(await f.locator('[name=terminos]').isChecked(), false);
      assert.equal(await f.locator('[name=datos]').isChecked(), false);
      assert.equal(await p.isVisible('#aviso-textos-prueba'), true);
      assert.match(await f.locator('#doc-datos').getAttribute('href'), /documento\.html\?tipo=datos&version=prueba-1/);
      await f.locator('[name=nombre]').fill('Alias Adulto');
      await f.locator('[name=correo]').fill(correo);
      await f.locator('[name=clave]').fill(CLAVE);
      const sinCasillas = peticionesAula(p);
      await f.locator('button[type=submit]').click();
      await p.waitForTimeout(300);
      assert.deepEqual(sinCasillas, [], 'sin marcar las casillas no se envía');
      await sinDesborde(p);
      await foto(p, `registro-${nombre}`);
      // Fallo del correo y reintento
      fallarCorreo(true);
      await f.locator('[name=terminos]').check();
      await f.locator('[name=datos]').check();
      await f.locator('button[type=submit]').click();
      await p.locator('#error-form', { hasText: 'No pudimos enviar el correo' }).waitFor();
      assert.equal(sql(`SELECT count(*) FROM registros_pendientes WHERE correo = '${correo}'`), '0');
      fallarCorreo(false);
      await f.locator('button[type=submit]').click();
      await p.locator('#vista-correo:visible').waitFor();
      assert.match(await p.textContent('#correo-mensaje'), /te enviamos un correo/);
      const primero = enlaceDe(await esperarCorreo(correo, 1), 'verificar');
      assert.ok(primero.startsWith(SITIO + '/aula/?curso=course-python#verificar='), primero);
      await p.click('#btn-reenviar');
      await p.locator('#estado', { hasText: 'enlace nuevo' }).waitFor();
      const segundo = enlaceDe(await esperarCorreo(correo, 2), 'verificar');
      assert.notEqual(segundo, primero);
      await foto(p, `correo-${nombre}`);
      log(nombre, 'adulto: edad, datos mínimos, casillas sin marcar, fallo del correo sin guardar nada, reintento y reenvío');

      // 3. Documento consultable
      const doc = await ctx.newPage();
      await doc.goto(SITIO + '/aula/documento.html?tipo=datos&version=prueba-1');
      await doc.locator('#texto:visible').waitFor();
      assert.match(await doc.textContent('#texto'), /TEXTO PROVISIONAL SOLO PARA PRUEBAS/);
      assert.equal(await doc.isVisible('#aviso-prueba'), true);
      assert.match(await doc.textContent('#huella'), /^[0-9a-f]{64}$/);
      await sinDesborde(doc);
      await foto(doc, `documento-${nombre}`);
      await doc.close();

      // 4. Enlace sustituido, contraseña equivocada, verificación y regreso al curso elegido.
      const q = await ctx.newPage();
      await q.goto(primero);
      await q.locator('#vista-enlace:visible').waitFor();
      assert.ok(!q.url().includes('#'), 'el token se quita de la barra de direcciones');
      await q.fill('#form-enlace [name=clave]', CLAVE);
      await q.click('#btn-enlace');
      await q.locator('#error-enlace', { hasText: 'venció o ya se usó' }).waitFor();
      await q.goto(segundo);
      await q.fill('#form-enlace [name=clave]', 'otra-clave-123');
      await q.click('#btn-enlace');
      await q.locator('#error-enlace', { hasText: 'no coincide' }).waitFor();
      await q.fill('#form-enlace [name=clave]', CLAVE);
      await q.click('#btn-enlace');
      await q.locator('#vista-cursos:visible').waitFor();
      await q.locator('#estado', { hasText: 'Correo confirmado' }).waitFor();
      assert.match(await q.textContent('#eleccion'), /Curso elegido: Python desde Cero/);
      const confirmar = q.locator('#catalogo [data-inscribir="course-python"]');
      assert.equal(await confirmar.textContent(), 'Confirmar inscripción');
      assert.equal(await q.locator('#catalogo .curso').first().getAttribute('class'), 'curso');
      assert.match(await q.locator('#catalogo .curso h3').first().textContent(), /Python/);   // primero en la lista
      await foto(q, `verificado-${nombre}`);
      await confirmar.click();
      await q.locator('#mis-cursos [data-curso="course-python"]').waitFor();
      await q.locator('#eleccion', { hasText: 'Ya estás inscrito' }).waitFor();
      const csrf = (await (await ctx.request.get(SITIO + '/api/aula/sesion')).json()).csrf;
      const repetida = await ctx.request.post(SITIO + '/api/aula/inscripciones', { headers: { Origin: SITIO, 'X-CSRF-Token': csrf }, data: { curso_id: 'course-python' } });
      assert.equal(repetida.status(), 200);
      assert.equal((await repetida.json()).nueva, false);
      assert.equal(sql(`SELECT count(*) FROM inscripciones i JOIN usuarios u ON u.id = i.usuario_id WHERE u.correo = '${correo}'`), '1');
      assert.equal(sql(`SELECT string_agg(a.tipo || ':' || a.version || ':' || a.via, ',' ORDER BY a.tipo) FROM autorizaciones a JOIN usuarios u ON u.id = a.usuario_id WHERE u.correo = '${correo}'`),
        'datos:prueba-1:registro,terminos:prueba-1:registro');
      await sinDesborde(q);
      // Enlace reutilizado
      const r2 = await ctx.newPage();
      await r2.goto(segundo);
      await r2.fill('#form-enlace [name=clave]', CLAVE);
      await r2.click('#btn-enlace');
      await r2.locator('#error-enlace', { hasText: 'venció o ya se usó' }).waitFor();
      await r2.close();
      log(nombre, 'verificación: enlace sustituido y reutilizado rechazados, contraseña obligatoria, evidencia y vuelta al curso elegido; inscripción repetida sin duplicar');

      // 5. Correo duplicado: misma respuesta y solo un aviso (sin enlace).
      const d = await ctx.newPage();
      await d.goto(SITIO + '/aula/?curso=course-web');
      await d.locator('#vista-cursos:visible').waitFor();   // sesión abierta en este contexto
      const ctx2 = await contexto(opciones);
      const d2 = await ctx2.newPage();
      await d2.goto(SITIO + '/aula/?curso=course-web');
      await d2.click('#btn-adulto');
      await d2.fill('#form-registro [name=nombre]', 'Otra Persona');
      await d2.fill('#form-registro [name=correo]', correo.toUpperCase());
      await d2.fill('#form-registro [name=clave]', 'clave-de-otra-123');
      await d2.check('#form-registro [name=terminos]');
      await d2.check('#form-registro [name=datos]');
      await d2.click('#form-registro button[type=submit]');
      await d2.locator('#vista-correo:visible').waitFor();
      const aviso = await esperarCorreo(correo, 3);
      assert.match(aviso.cuerpo, /ya\s+tiene una cuenta/);
      assert.equal(enlaceDe(aviso, 'verificar'), null);
      assert.equal(sql(`SELECT count(*) FROM usuarios WHERE correo = '${correo}'`), '1');
      log(nombre, 'correo duplicado: misma pantalla «Revisa tu correo», aviso sin enlace y ninguna cuenta nueva');

      // 6. Recuperación de contraseña desde la pantalla de acceso (otro navegador), conservando el curso.
      await d2.goto(SITIO + '/aula/?curso=course-web');
      await d2.click('#tab-entrar');
      await d2.click('#btn-olvido');
      await d2.fill('#form-recuperar [name=correo]', correo);
      await d2.click('#form-recuperar button[type=submit]');
      await d2.locator('#estado', { hasText: 'te enviamos un correo' }).waitFor();
      const rec = enlaceDe(await esperarCorreo(correo, 4), 'restablecer');
      assert.ok(rec.startsWith(SITIO + '/aula/?curso=course-web#restablecer='), rec);
      await d2.goto(rec);
      await d2.locator('#etq-clave2:visible').waitFor();
      await d2.fill('#form-enlace [name=clave]', 'nueva-clave-adulta-2');
      await d2.fill('#form-enlace [name=clave2]', 'nueva-clave-distinta');
      await d2.click('#btn-enlace');
      await d2.locator('#error-enlace', { hasText: 'no coinciden' }).waitFor();
      await d2.fill('#form-enlace [name=clave2]', 'nueva-clave-adulta-2');
      await d2.click('#btn-enlace');
      await d2.locator('#vista-cursos:visible').waitFor();
      assert.match(await d2.textContent('#eleccion'), /Desarrollo Web/);
      await foto(d2, `recuperada-${nombre}`);
      await d.reload();
      await d.locator('#vista-acceso:visible').waitFor();   // la sesión del otro navegador se cerró
      await d.click('#tab-entrar');                          // con curso elegido se abre «Crear cuenta»
      await d.fill('#form-entrar [name=correo]', correo);
      await d.fill('#form-entrar [name=clave]', CLAVE);
      await d.click('#form-entrar button[type=submit]');
      await d.locator('#error-form', { hasText: 'incorrectos' }).waitFor();
      await d.fill('#form-entrar [name=clave]', 'nueva-clave-adulta-2');
      await d.click('#form-entrar button[type=submit]');
      await d.locator('#mis-cursos [data-curso="course-python"]').waitFor();
      await d2.goto(rec);
      await d2.fill('#form-enlace [name=clave]', 'otra-mas-123456');
      await d2.fill('#form-enlace [name=clave2]', 'otra-mas-123456');
      await d2.click('#btn-enlace');
      await d2.locator('#error-enlace', { hasText: 'venció o ya se usó' }).waitFor();
      await ctx2.close();
      log(nombre, 'recuperación: enlace de un solo uso con el curso, sesiones anteriores cerradas, contraseña nueva');

      // 7. Enlace vencido
      const vencido = `vencido.${nombre}.${sufijo}@example.com`;
      const v = await ctx.newPage();
      await v.goto(SITIO + '/aula/');
      await v.locator('#vista-cursos:visible, #vista-acceso:visible').first().waitFor();
      if (await v.isVisible('#vista-cursos')) { await v.click('#btn-salir'); await v.locator('#vista-acceso:visible').waitFor(); }
      await v.click('#tab-registro');
      await v.click('#btn-adulto');
      await v.fill('#form-registro [name=nombre]', 'Vence');
      await v.fill('#form-registro [name=correo]', vencido);
      await v.fill('#form-registro [name=clave]', CLAVE);
      await v.check('#form-registro [name=terminos]');
      await v.check('#form-registro [name=datos]');
      await v.click('#form-registro button[type=submit]');
      await v.locator('#vista-correo:visible').waitFor();
      const enlaceVencido = enlaceDe(await esperarCorreo(vencido, 1), 'verificar');
      sql(`UPDATE registros_pendientes SET expira_en = now() - interval '1 minute' WHERE correo = '${vencido}'`);
      await v.goto(enlaceVencido);
      await v.fill('#form-enlace [name=clave]', CLAVE);
      await v.click('#btn-enlace');
      await v.locator('#error-enlace', { hasText: 'venció o ya se usó' }).waitFor();
      assert.equal(sql(`SELECT count(*) FROM usuarios WHERE correo = '${vencido}'`), '0');
      await foto(v, `vencido-${nombre}`);
      await ctx.close();
      log(nombre, 'enlace vencido: rechazado y sin cuenta');
    }

    // 8. Cuentas de la versión anterior: aceptan los documentos al entrar y conservan inscripciones y avances.
    for (const [i, correo] of PREVIAS.entries()) {
      const [nombre, opciones] = PERFILES[i % PERFILES.length];
      assert.equal(sql(`SELECT origen || ':' || (SELECT count(*) FROM autorizaciones a WHERE a.usuario_id = u.id) FROM usuarios u WHERE correo = '${correo}'`), 'anterior:0');
      const ctx = await contexto(opciones);
      const p = await ctx.newPage();
      await p.goto(SITIO + '/aula/');
      await p.fill('#form-entrar [name=correo]', correo);
      await p.fill('#form-entrar [name=clave]', PREVIA_CLAVE);
      await p.click('#form-entrar button[type=submit]');
      await p.locator('#vista-autorizacion:visible').waitFor();
      assert.equal(await p.locator('#lista-autorizacion input:checked').count(), 0);
      assert.equal(await p.locator('#lista-autorizacion input').count(), 2);
      const bloqueada = await ctx.request.get(SITIO + '/api/aula/mis-cursos');
      assert.equal(bloqueada.status(), 403);
      await sinDesborde(p);
      await foto(p, `transicion-${nombre}`);
      for (const c of await p.locator('#lista-autorizacion input').all()) await c.check();
      await p.click('#form-autorizacion button[type=submit]');
      await p.locator('#vista-cursos:visible').waitFor();
      const arduino = p.locator('#mis-cursos [data-curso="course-arduino"]');
      await arduino.locator('.progreso__resumen').waitFor();
      assert.match(await arduino.locator('.progreso__resumen').textContent(), /^1 de 15/);
      assert.equal(await arduino.locator('[data-leccion="arduino-pwm-brillo"]').getAttribute('data-estado'), 'en-curso');
      if (correo.includes('todo')) {
        for (const curso of ['course-web', 'course-python']) {
          const panel = p.locator(`#mis-cursos [data-curso="${curso}"]`);
          await panel.locator('[data-estado="completada"]').first().waitFor();
          assert.equal(await panel.locator('[data-estado="completada"]').count(), 1, curso);
          assert.equal(await panel.locator('[data-estado="en-curso"]').count(), 1, curso);
        }
      }
      assert.equal(sql(`SELECT string_agg(a.via, ',') FROM autorizaciones a JOIN usuarios u ON u.id = a.usuario_id WHERE u.correo = '${correo}'`),
        'cuenta-existente,cuenta-existente');
      await foto(p, `transicion-cursos-${nombre}`);
      await ctx.close();
      log(nombre, `cuenta anterior ${correo}: acepta documentos (sin autorizaciones previas) y conserva inscripciones y avances`);
    }

    // 9. Invitado: los tres laboratorios funcionan sin cuenta y no envían avance a la API.
    for (const [nombre, opciones] of PERFILES) {
      const ctx = await contexto(opciones);
      const p = await ctx.newPage();
      const enviadas = peticionesAula(p);
      for (const lab of ['laboratorio-arduino', 'laboratorio-web', 'laboratorio-python']) {
        await p.goto(`${SITIO}/games/${lab}/index.html`);
        await p.waitForLoadState('networkidle');
        await sinDesborde(p);
      }
      assert.deepEqual(enviadas, []);
      await ctx.close();
      log(nombre, 'invitado: laboratorios de Arduino, Web y Python sin cuenta y sin enviar nada');
    }
  }
  assert.deepEqual(errores, [], 'errores de JavaScript en las páginas');
  console.log(`Registro de adultos (${FASE}): OK`);
} finally {
  fallarCorreo(false);
  await browser.close();
}
