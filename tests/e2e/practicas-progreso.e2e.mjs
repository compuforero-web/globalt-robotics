// Prueba manual de extremo a extremo: progreso por cuenta de Desarrollo Web y Python desde Cero
// (laboratorios + panelPracticas del aula). No la ejecuta CI: necesita Chromium, la API del aula con PostgreSQL
// y el sitio en el mismo origen, con course-web y course-python en la base (migración 0005, o insertados
// solo en la preparación del banco de pruebas).
// Uso: AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/practicas-progreso.e2e.mjs   (AULA_SHOTS=carpeta para capturas)
// Crea cuentas ficticias @example.com con el registro abierto del banco local.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const SITIO = (process.env.AULA_SITIO || 'http://127.0.0.1:8180').replace(/\/$/, '');
const AULA = SITIO + '/aula/index.html';
const WEB = SITIO + '/games/laboratorio-web/index.html';
const PY = SITIO + '/games/laboratorio-python/index.html';
const SHOTS = process.env.AULA_SHOTS || '';
const COLA = 'globalt.aula.practicas-pendiente.v1.';
const CLAVE = 'clave-ficticia-e2e-1';
const fx = (n) => readFileSync(new URL('../fixtures/laboratorio-python/' + n, import.meta.url), 'utf8');
const ESTRUCTURA = '<header><h1>Expo</h1></header><main class="proyectos"><article><h2>A</h2><p>Uno</p></article><article><h2>B</h2><p>Dos</p></article></main>';
const REJILLA = '.proyectos{display:grid;grid-template-columns:1fr 1fr;gap:16px}';
const sufijo = Date.now().toString(36);
const log = (...a) => console.log('✔', ...a);

const browser = await chromium.launch();
const errores = [];
async function contexto(opciones = {}) {
  const ctx = await browser.newContext(opciones);
  ctx.on('page', (p) => p.on('pageerror', (e) => errores.push(e.message)));
  return ctx;
}
async function api(ctx, metodo, ruta, datos, csrf) {
  const r = await ctx.request.fetch(SITIO + '/api/aula' + ruta, {
    method: metodo, data: datos, headers: { Origin: SITIO, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) } });
  return { status: r.status(), json: r.status() === 204 ? null : await r.json() };
}
const creador = await contexto();
async function cuenta(nombre, cursos) {
  const correo = `prac-${nombre}.${sufijo}@example.com`;
  const { json } = await api(creador, 'POST', '/registro', { nombre: 'Estudiante ' + nombre, correo, clave: CLAVE });
  for (const c of cursos) await api(creador, 'POST', '/inscripciones', { curso_id: c }, json.csrf);
  await api(creador, 'DELETE', '/sesion', null, json.csrf);
  return correo;
}
/** Estado en el servidor de la cuenta con sesión en ese contexto: { leccion: estado }. */
async function servidor(ctx, curso) {
  const { status, json } = await api(ctx, 'GET', '/mis-cursos');
  if (status !== 200) return null;
  const c = json.cursos.find((x) => x.id === curso);
  return c ? Object.fromEntries(c.progreso.lecciones.map((l) => [l.leccion_id, l.estado])) : null;
}
async function entrarAula(p, correo) {
  await p.goto(AULA);
  await p.waitForSelector('#form-entrar:not([hidden])');
  await p.fill('#form-entrar [name=correo]', correo);
  await p.fill('#form-entrar [name=clave]', CLAVE);
  await p.click('#form-entrar button[type=submit]');
  await p.waitForSelector('#vista-cursos:not([hidden])');
}
async function salirAula(p) {
  await p.click('#btn-salir');
  await p.waitForSelector('#vista-acceso:not([hidden])');
}
// Lee el panel real tras volver a entrar al aula.
async function panel(p, curso) {
  await p.goto(AULA);
  const tarjeta = p.locator('#mis-cursos [data-curso="' + curso + '"][data-estado="listo"]');
  await tarjeta.waitFor();
  return tarjeta.evaluate(el => {
    return { estado: el.dataset.estado, texto: el.textContent,
      filas: Object.fromEntries([...el.querySelectorAll('.leccion')].map((l) => [l.dataset.leccion, l.dataset.estado])),
      enlaces: [...el.querySelectorAll('.leccion a')].map((a) => a.getAttribute('href')),
      continuar: el.querySelector('.btn-continuar')?.getAttribute('href') };
  });
}
const colas = (p) => p.evaluate((pre) => Object.keys(localStorage).filter((k) => k.startsWith(pre)), COLA);
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const sincronizado = (p) => p.waitForFunction((pre) => /Avance sincronizado/.test(document.querySelector('#cuenta-avance').textContent)
  && !Object.keys(localStorage).some((k) => k.startsWith(pre)), COLA, { timeout: 15000 });

// ---------- Laboratorio web ----------
async function abrirWeb(p, id) {
  await p.goto(`${WEB}#${id}`);
  await p.waitForFunction((id) => document.querySelector('#ruta [aria-current=step]') && location.hash === '#' + id
    && !document.querySelector('#cuenta').hidden, id);
}
async function editarWeb(p, archivo, codigo) {
  await p.click(`[data-file="${archivo}"]`);
  await p.locator('#codigo').fill(codigo);
}
async function comprobarWeb(p) {
  await p.click('#evaluar');
  await p.waitForFunction(() => /^Reto completado|^Todavía queda/.test(document.querySelector('#estado').textContent), null, { timeout: 15000 });
  await p.waitForFunction(() => !document.querySelector('#evaluar').disabled);
  return p.textContent('#estado');
}
// ---------- Laboratorio Python ----------
async function abrirPy(p, id) {
  await p.goto(`${PY}?practica=${id}`);
  await p.waitForFunction(() => document.querySelector('#interprete').dataset.tipo === 'listo', null, { timeout: 120000 });
}
async function comprobarPy(p, codigo) {
  await p.click('[data-archivo="programa.py"]');
  await p.locator('.editor__texto').fill(codigo);
  await p.click('#btn-comprobar');
  await p.waitForSelector('.casos__fin', { timeout: 120000 });
  await p.waitForFunction(() => !document.querySelector('#btn-comprobar').disabled, null, { timeout: 30000 });
  return p.textContent('#resultado');
}

const A = await cuenta('ana', ['course-web', 'course-python']);
const B = await cuenta('beto', ['course-web', 'course-python']);
const C = await cuenta('caro', []);   // sin inscripción

// 1. Invitado (computador compartido): los retos se marcan solo en este navegador y no se envía nada.
const compartido = await contexto({ viewport: { width: 1280, height: 900 } });
const posts = [];
compartido.on('response', (r) => {   // solo envíos aceptados por el servidor (los intentos sin red no cuentan)
  if (r.request().method() === 'POST' && r.url().endsWith('/api/aula/mis-cursos') && r.status() === 200) posts.push(r.request().postDataJSON());
});
const lab = await compartido.newPage();
await abrirWeb(lab, 'estructura');
assert.match(await lab.textContent('#cuenta'), /Modo invitado/);
assert.match(await lab.textContent('#cuenta-borrador'), /invitado: guardado solo en este navegador/);
assert.match(await comprobarWeb(lab), /Todavía queda/);          // reto fallido
await editarWeb(lab, 'html', ESTRUCTURA);
assert.equal(await comprobarWeb(lab), 'Reto completado.');
assert.match(await lab.textContent('#avance'), /^1 de 5 retos completados\.$/);
const py = await compartido.newPage();
await abrirPy(py, 'python-variables');
assert.match(await py.textContent('#cuenta'), /Modo invitado/);
assert.match(await comprobarPy(py, fx('p1-solucion.py')), /¡Reto superado!/);
assert.match(await py.textContent('#estado-reto'), /solo en este navegador/);
assert.equal(posts.length, 0);
log('invitado: retos web y Python marcados solo en este navegador; nada enviado al aula');

// 2. Ana entra en el mismo navegador: el historial de invitado NO se le atribuye y sus borradores van aparte.
const aula = await compartido.newPage();
await entrarAula(aula, A);
await abrirWeb(lab, 'rejilla');
await lab.reload();
await lab.waitForFunction(() => /Avance sincronizado/.test(document.querySelector('#cuenta-avance').textContent), null, { timeout: 15000 });
assert.match(await lab.textContent('#cuenta-borrador'), /separado para tu cuenta \(Estudiante ana\)/);
assert.match(await lab.textContent('#avance'), /^0 de 5 retos completados en tu cuenta\.$/);
assert.deepEqual(await servidor(compartido, 'course-web'), { 'web-rejilla': 'en-curso' });   // visita registrada
await abrirWeb(lab, 'estructura');
assert.equal(await lab.isVisible('#copiar-invitado'), true);       // se ofrece copiar SOLO el código, no se hace solo
assert.equal(await lab.inputValue('#codigo'), await lab.evaluate(() => '<header>Feria de robótica</header>\n<main>\n  <!-- Presenta aquí tus dos proyectos -->\n</main>'));
await sincronizado(lab);
assert.deepEqual(await servidor(compartido, 'course-web'), { 'web-rejilla': 'en-curso', 'web-estructura': 'en-curso' });
assert.ok(!posts.some((d) => d.completada));
log('cuenta en navegador compartido: visitas registradas, historial de invitado no atribuido, borradores separados');

// 3. Reto fallido y aprobado en ambos cursos: solo la aprobación completa.
await abrirWeb(lab, 'rejilla');
assert.match(await comprobarWeb(lab), /Todavía queda/);
await sincronizado(lab);
assert.equal((await servidor(compartido, 'course-web'))['web-rejilla'], 'en-curso');
await editarWeb(lab, 'css', REJILLA);
assert.equal(await comprobarWeb(lab), 'Reto completado y guardado en tu cuenta.');
assert.equal((await servidor(compartido, 'course-web'))['web-rejilla'], 'completada');
await py.reload();
await py.waitForFunction(() => document.querySelector('#interprete').dataset.tipo === 'listo', null, { timeout: 120000 });
assert.match(await py.textContent('#cuenta-avance'), /sincronizado con tu cuenta/);
assert.equal(await py.locator('.practicas__ok').count(), 0);        // el ✓ de invitado no pasa a la cuenta
assert.match(await comprobarPy(py, fx('p1-fallo.py')), /casos correctos/);
assert.equal((await servidor(compartido, 'course-python'))['python-variables'], 'en-curso');
assert.match(await comprobarPy(py, fx('p1-solucion.py')), /¡Reto superado!/);
await py.waitForFunction(() => /guardado en tu cuenta/.test(document.querySelector('#estado-reto').textContent));
assert.equal((await servidor(compartido, 'course-python'))['python-variables'], 'completada');
log('reto fallido → «En curso»; aprobado → «Completada», en Web y en Python');

// 4. Pérdida de red y recuperación: queda pendiente solo para la cuenta y se envía al volver (sin duplicar).
await abrirWeb(lab, 'estructura');
await sincronizado(lab);
await compartido.setOffline(true);
await editarWeb(lab, 'html', ESTRUCTURA);
assert.match(await comprobarWeb(lab), /Sin conexión: queda pendiente/);
assert.match(await lab.textContent('#cuenta-avance'), /Sin conexión con el aula: 1 práctica/);
assert.equal((await colas(lab)).length, 1);
await compartido.setOffline(false);
await sincronizado(lab);
assert.equal((await servidor(compartido, 'course-web'))['web-estructura'], 'completada');
const completados = posts.filter((d) => d.completada && d.leccion_id === 'web-estructura').length;
assert.equal(completados, 1);
log('sin red: pendiente en la cola de la cuenta; al volver la conexión se envía una sola vez');

// 5. Panel del aula: estado por práctica y «Continuar» a la práctica correcta.
let pw = await panel(aula, 'course-web');
assert.equal(pw.estado, 'listo');
assert.deepEqual(pw.filas, { 'web-estructura': 'completada', 'web-rejilla': 'completada', 'web-adaptable': 'sin-comenzar',
  'web-eventos': 'sin-comenzar', 'web-publicacion': 'sin-comenzar' });
assert.equal(pw.continuar, WEB + '#adaptable');
assert.match(pw.texto, /2 de 5 prácticas completadas/);
assert.match(pw.texto, /no es una evaluación verificada por el servidor/);
let pp = await panel(aula, 'course-python');
assert.equal(pp.filas['python-variables'], 'completada');
assert.equal(pp.continuar, PY + '?practica=python-condicionales');
assert.ok(pp.enlaces.every((h, i) => h.endsWith(['python-variables', 'python-condicionales', 'python-funciones', 'python-archivos', 'python-asistente'][i])));
if (SHOTS) await aula.screenshot({ path: `${SHOTS}/aula-panel-escritorio.png`, fullPage: true });
log('panel: estados por práctica, «Continuar» a adaptable y a python-condicionales');

// 6. Pendiente en el aula: el panel lo envía (solo para la cuenta con sesión).
await compartido.setOffline(true);
await abrirWeb(lab, 'eventos');
await lab.waitForFunction(() => /Sin conexión/.test(document.querySelector('#cuenta-avance').textContent));
await compartido.setOffline(false);
await lab.close();
pw = await panel(aula, 'course-web');
assert.equal(pw.filas['web-eventos'], 'en-curso');
assert.equal(pw.continuar, WEB + '#eventos');
assert.equal((await colas(aula)).length, 0);
log('panel: envía lo pendiente de la cuenta y «Continuar» vuelve a la última visitada sin completar');

// 7. Cierre de sesión con el laboratorio abierto: deja de registrar para esa cuenta.
const lab2 = await compartido.newPage();
await abrirWeb(lab2, 'adaptable');
await sincronizado(lab2);
await salirAula(aula);
await lab2.waitForFunction(() => /Se cerró la sesión/.test(document.querySelector('#cuenta-avance').textContent));
assert.equal(await lab2.isVisible('#cuenta-recargar'), true);
await editarWeb(lab2, 'css', '.proyectos{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:480px){.proyectos{grid-template-columns:1fr}}');
assert.match(await comprobarWeb(lab2), /no se guardó en ninguna cuenta/);
log('cierre de sesión: la pestaña del laboratorio se detiene y no registra en ninguna cuenta');

// 8. Beto entra en el mismo navegador: no ve el avance ni los borradores de Ana; nada de Ana se le envía.
await entrarAula(aula, B);
await lab2.reload();
await lab2.waitForFunction(() => /Estudiante beto/.test(document.querySelector('#cuenta-borrador').textContent), null, { timeout: 15000 });
assert.match(await lab2.textContent('#avance'), /^0 de 5/);
await lab2.click('[data-file="css"]');
assert.doesNotMatch(await lab2.inputValue('#codigo'), /max-width:480px/);
await sincronizado(lab2);
assert.deepEqual(await servidor(compartido, 'course-web'), { 'web-adaptable': 'en-curso' });
assert.deepEqual(await servidor(compartido, 'course-python'), {});
log('segunda cuenta en el mismo navegador: datos separados');

// 9. Segundo navegador: Ana recupera su avance.
const otro = await contexto({ viewport: { width: 1280, height: 900 } });
const aulaOtro = await otro.newPage();
await entrarAula(aulaOtro, A);
pw = await panel(aulaOtro, 'course-web');
assert.equal(pw.filas['web-estructura'], 'completada');
assert.equal(pw.filas['web-rejilla'], 'completada');
const labOtro = await otro.newPage();
await abrirWeb(labOtro, 'estructura');
await labOtro.waitForFunction(() => /^2 de 5 retos completados en tu cuenta/.test(document.querySelector('#avance').textContent), null, { timeout: 15000 });
log('otro navegador: Ana recupera su progreso de la cuenta');

// 10. Acceso sin inscripción: modo invitado explícito; nada llega a la cuenta.
const ctxC = await contexto({ viewport: { width: 1280, height: 900 } });
const aulaC = await ctxC.newPage();
await entrarAula(aulaC, C);
const labC = await ctxC.newPage();
await abrirWeb(labC, 'estructura');
assert.match(await labC.textContent('#cuenta-avance'), /no estás inscrito en este curso/);
await editarWeb(labC, 'html', ESTRUCTURA);
assert.equal(await comprobarWeb(labC), 'Reto completado.');
assert.equal((await api(ctxC, 'POST', '/mis-cursos', { leccion_id: 'web-estructura', paso: 0 })).status, 403);   // sin CSRF/inscripción
assert.deepEqual((await api(ctxC, 'GET', '/mis-cursos')).json.cursos, []);
assert.equal(await aulaC.locator('#mis-cursos [data-curso="course-web"]').count(), 0);
log('sin inscripción: invitado explícito; la cuenta no recibe nada');

// 11. Móvil (Pixel 7): Beto en su teléfono, sin desbordes, y aprueba un reto.
const movil = await contexto({ ...devices['Pixel 7'] });
const aulaM = await movil.newPage();
await entrarAula(aulaM, B);
const labM = await movil.newPage();
await abrirWeb(labM, 'estructura');
assert.ok(await sinDesborde(labM), 'laboratorio web desborda en móvil');
await editarWeb(labM, 'html', ESTRUCTURA);
assert.equal(await comprobarWeb(labM), 'Reto completado y guardado en tu cuenta.');
const pyM = await movil.newPage();
await abrirPy(pyM, 'python-variables');
assert.ok(await sinDesborde(pyM), 'laboratorio Python desborda en móvil');
assert.match(await comprobarPy(pyM, fx('p1-fallo.py')), /casos correctos/);
assert.match(await pyM.textContent('#estado-reto'), /Reto pendiente/);
pw = await panel(aulaM, 'course-web');
assert.equal(pw.filas['web-estructura'], 'completada');
assert.ok(await sinDesborde(aulaM), 'aula desborda en móvil');
if (SHOTS) {
  await aulaM.screenshot({ path: `${SHOTS}/aula-panel-movil.png`, fullPage: true });
  await labM.screenshot({ path: `${SHOTS}/lab-web-movil.png` });
  await pyM.screenshot({ path: `${SHOTS}/lab-python-movil.png` });
}
log('móvil: sin desbordes, reto web aprobado y Python fallido sin completar');

assert.deepEqual(errores, []);
await browser.close();
console.log('\nTodo correcto.');
