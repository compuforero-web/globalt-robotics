// Prueba manual de extremo a extremo del aula (no la ejecuta CI: necesita Chromium y el entorno Docker).
// Uso: (cd services/aula-api && docker compose up -d) && AULA_URL=http://127.0.0.1:8180/aula/ node tests/e2e/aula.e2e.mjs
// Opcional: AULA_REINICIO=1 reinicia la API y la base a mitad de la prueba para comprobar persistencia.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const URL_AULA = process.env.AULA_URL || 'http://127.0.0.1:8180/aula/';
const SHOTS = process.env.AULA_SHOTS || '';
const sufijo = Date.now().toString(36);
const CLAVE = 'clave-ficticia-e2e-1';
const log = (...a) => console.log('✔', ...a);

const browser = await chromium.launch();
const errores = [];
async function pagina(opciones = {}) {
  const ctx = await browser.newContext(opciones);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_AULA);
  await p.waitForSelector('#vista-acceso:not([hidden]), #vista-cursos:not([hidden])');
  return { ctx, p };
}
async function registrar(p, nombre, correo) {
  await p.click('#tab-registro');
  await p.fill('#form-registro [name=nombre]', nombre);
  await p.fill('#form-registro [name=correo]', correo);
  await p.fill('#form-registro [name=clave]', CLAVE);
  await p.click('#form-registro button[type=submit]');
}

// 1. Registro (móvil) → «Mis cursos» vacío, sin desbordamiento.
const { ctx: ctxA, p: a } = await pagina({ ...devices['Pixel 7'] });
await registrar(a, 'Ana Ficticia', `ana.${sufijo}@example.com`);
await a.waitForSelector('#vista-cursos:not([hidden])');
assert.match(await a.textContent('#mis-cursos'), /Todavía no te has inscrito/);
assert.equal(await a.textContent('#quien'), 'Ana Ficticia');
assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
log('registro en móvil y vista «Mis cursos»');

// 2. Inscripción; el laboratorio solo se enlaza si existe en el servidor.
await a.click('[data-inscribir="course-arduino"]');
await a.waitForSelector('#mis-cursos .curso');
const labExiste = (await a.request.head(new URL('../games/laboratorio-arduino/index.html', URL_AULA).href)).ok();
const textoCurso = await a.textContent('#mis-cursos');
assert.match(textoCurso, /Electrónica y C\+\+ con Arduino/);
if (labExiste) assert.equal(await a.locator('#mis-cursos a', { hasText: 'Abrir laboratorio' }).count(), 1);
else assert.match(textoCurso, /Laboratorio pendiente de publicación/);
assert.match(await a.textContent('#catalogo'), /Ya estás inscrito/);
log('inscripción visible; laboratorio', labExiste ? 'enlazado' : 'marcado como pendiente (no existe en este servidor)');
if (SHOTS) await a.screenshot({ path: SHOTS + '/aula-movil.png', fullPage: true });

// 3. Nada sensible en almacenamiento del navegador; cookie HttpOnly.
assert.deepEqual(await a.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, '']);
const cookie = (await ctxA.cookies()).find((c) => c.name === 'aula_sesion');
assert.ok(cookie.httpOnly && cookie.sameSite === 'Strict' && cookie.path === '/api/aula');
log('sin datos en localStorage/sessionStorage; cookie HttpOnly, SameSite=Strict');

// 4. Recarga y (opcional) reinicio de API + base: la sesión y la inscripción persisten.
if (process.env.AULA_REINICIO) {
  execSync('docker compose restart db api', { cwd: new URL('../../services/aula-api/', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { if ((await a.request.get(new URL('../api/aula/salud', URL_AULA).href)).ok()) break; } catch {} await a.waitForTimeout(500); }
}
await a.reload();
await a.waitForSelector('#mis-cursos .curso');
log(process.env.AULA_REINICIO ? 'persistencia tras reiniciar API y PostgreSQL' : 'persistencia tras recargar');

// 5. Segundo estudiante: no ve los cursos del primero.
const { p: b } = await pagina({ viewport: { width: 1280, height: 900 } });
await registrar(b, 'Beto Ficticio', `beto.${sufijo}@example.com`);
await b.waitForSelector('#vista-cursos:not([hidden])');
assert.match(await b.textContent('#mis-cursos'), /Todavía no te has inscrito/);
log('separación entre estudiantes');

// 6. Correo duplicado.
const { p: c } = await pagina();
await registrar(c, 'Copia', `ana.${sufijo}@example.com`);
await c.waitForFunction(() => document.querySelector('#error-form').textContent);
assert.match(await c.textContent('#error-form'), /Ya existe una cuenta/);
log('correo duplicado rechazado');

// 7. Cerrar sesión; contraseña incorrecta; acceso correcto.
await a.click('#btn-salir');
await a.waitForSelector('#vista-acceso:not([hidden])');
await a.reload();
await a.waitForSelector('#vista-acceso:not([hidden])');
await a.fill('#form-entrar [name=correo]', `ana.${sufijo}@example.com`);
await a.fill('#form-entrar [name=clave]', 'incorrecta-123');
await a.click('#form-entrar button[type=submit]');
await a.waitForFunction(() => document.querySelector('#error-form').textContent);
assert.equal(await a.textContent('#error-form'), 'Correo o contraseña incorrectos.');
await a.fill('#form-entrar [name=clave]', CLAVE);
await a.click('#form-entrar button[type=submit]');
await a.waitForSelector('#mis-cursos .curso');
log('cierre de sesión, contraseña incorrecta y acceso correcto');

assert.deepEqual(errores, []);
await browser.close();
console.log('Todas las comprobaciones del aula pasaron.');
