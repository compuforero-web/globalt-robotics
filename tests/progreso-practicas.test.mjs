// Pruebas unitarias del progreso por cuenta de las prácticas Web y Python (games/laboratorio-web/progreso-cuenta.js).
// node --test tests/progreso-practicas.test.mjs   — sin red: API simulada, almacenamiento en memoria. Datos ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';

function almacen() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i], _m: m };
}
globalThis.localStorage = almacen();
globalThis.sessionStorage = almacen();
const oyentes = {};
globalThis.addEventListener = (t, f) => { (oyentes[t] ||= []).push(f); };
const canales = [];
globalThis.BroadcastChannel = class { constructor() { canales.push(this); } postMessage(d) { for (const c of canales) if (c !== this) c.onmessage?.({ data: d }); } close() {} };

const pc = await import('../games/laboratorio-web/progreso-cuenta.js');

class Err extends Error { constructor(status) { super('e' + status); this.status = status; } }
/** API simulada: un «servidor» con varias cuentas; red cortable; registra duplicados. */
function servidor() {
  const s = { sesion: null, red: true, datos: {}, inscrito: { 'ana@example.com': ['course-web', 'course-python'], 'beto@example.com': ['course-web'] }, posts: [] };
  const curso = (id) => Object.entries(pc.CURSOS).find(([, c]) => c.practicas.some((p) => p.id === id))?.[0];
  s.cliente = {
    sesion: async () => { if (!s.red) throw new Err(0); if (!s.sesion) throw new Err(401); return { usuario: { nombre: s.sesion.split('@')[0], correo: s.sesion } }; },
    misCursos: async () => {
      if (!s.red) throw new Err(0);
      if (!s.sesion) throw new Err(401);
      return { cursos: (s.inscrito[s.sesion] || []).map((id) => ({ id, progreso: { evaluacion: 'navegador', lecciones: Object.entries(s.datos[s.sesion] || {})
        .filter(([l]) => curso(l) === id).map(([l, e]) => ({ leccion_id: l, ...e })) } })) };
    },
    registrar: async (d) => {
      if (!s.red) throw new Err(0);
      if (!s.sesion) throw new Err(401);
      if (!(s.inscrito[s.sesion] || []).includes(curso(d.leccion_id))) throw new Err(403);
      s.posts.push({ cuenta: s.sesion, ...d });
      const mio = (s.datos[s.sesion] ||= {});
      const previo = mio[d.leccion_id];
      mio[d.leccion_id] = { estado: previo?.estado === 'completada' || d.completada ? 'completada' : 'en-curso', visto_en: d.visto_en };
      return { progreso: { leccion_id: d.leccion_id, ...mio[d.leccion_id] } };
    },
  };
  return s;
}

test('manifiestos: cinco prácticas por curso con espacio de nombres propio y enlaces correctos', () => {
  assert.deepEqual(Object.keys(pc.CURSOS), ['course-web', 'course-python']);
  for (const [id, c] of Object.entries(pc.CURSOS)) {
    assert.equal(c.practicas.length, 5);
    for (const p of c.practicas) assert.match(p.id, id === 'course-web' ? /^web-/ : /^python-/);
  }
  assert.equal(pc.CURSOS['course-web'].enlace(pc.practica('course-web', 'rejilla')), 'games/laboratorio-web/index.html#rejilla');
  assert.equal(pc.CURSOS['course-python'].enlace(pc.practica('course-python', 'python-funciones')),
    'games/laboratorio-python/index.html?practica=python-funciones');
});

test('cola por cuenta: separada, sin duplicados y conserva «completada»', async () => {
  const a = await pc.claveCuenta('ana@example.com');
  const b = await pc.claveCuenta('BETO@example.com ');
  assert.notEqual(a, b);
  assert.equal(b, await pc.claveCuenta('beto@example.com'));
  assert.ok(![...localStorage._m.keys()].some((k) => k.includes('@')));
  pc.anotar(a, 'web-estructura', { completada: true });
  pc.anotar(a, 'web-estructura');                 // visita posterior: no quita la finalización
  pc.anotar(a, 'web-estructura');
  assert.equal(Object.keys(pc.pendientes(a)).length, 1);
  assert.equal(pc.pendientes(a)['web-estructura'].completada, true);
  assert.deepEqual(pc.pendientes(b), {});
  assert.equal(pc.anotar(null, 'web-estructura'), false);
  assert.equal(pc.anotar(a, 'NO VALIDO'), false);
  localStorage.setItem(pc.PREFIJO + a, JSON.stringify({ ...pc.pendientes(a), 'mal id': {}, x: 3 }));   // datos dañados
  assert.deepEqual(Object.keys(pc.pendientes(a)), ['web-estructura']);
  localStorage.removeItem(pc.PREFIJO + a);
});

test('enviar: solo a la cuenta con sesión, reintento tras corte de red, sin duplicar', async () => {
  const s = servidor();
  const a = await pc.claveCuenta('ana@example.com');
  pc.anotar(a, 'python-variables', { completada: true });
  s.sesion = 'beto@example.com';                                   // otra cuenta en el navegador compartido
  assert.equal((await pc.enviar(a, s.cliente)).estado, 'otra-cuenta');
  assert.equal(s.posts.length, 0);
  s.sesion = null;
  assert.equal((await pc.enviar(a, s.cliente)).estado, 'sin-sesion');
  s.sesion = 'ana@example.com'; s.red = false;
  assert.equal((await pc.enviar(a, s.cliente)).estado, 'error');
  assert.ok(pc.pendientes(a)['python-variables']);                 // sigue en la cola
  s.red = true;
  const [r1, r2] = await Promise.all([pc.enviar(a, s.cliente), pc.enviar(a, s.cliente)]);   // envíos simultáneos
  assert.equal(r1.estado, 'al-dia'); assert.equal(r2.estado, 'al-dia');
  assert.equal(s.posts.length, 1);
  assert.deepEqual(pc.pendientes(a), {});
  assert.equal(s.datos['ana@example.com']['python-variables'].estado, 'completada');
});

test('enviar: 403 y API sin soporte conservan la cola', async () => {
  const s = servidor();
  s.sesion = 'beto@example.com';
  const b = await pc.claveCuenta('beto@example.com');
  pc.anotar(b, 'python-archivos');                                 // Beto no está inscrito en Python
  assert.equal((await pc.enviar(b, s.cliente)).estado, 'sin-permiso');
  assert.ok(pc.pendientes(b)['python-archivos']);
  const viejo = { ...s.cliente, registrar: async () => { throw new Err(404); } };
  assert.equal((await pc.enviar(b, viejo)).estado, 'no-disponible');
  localStorage.removeItem(pc.PREFIJO + b);
});

test('combinar y continuar', () => {
  const P = pc.CURSOS['course-web'].practicas;
  const vacio = pc.combinar({ lecciones: [] });
  assert.equal(pc.continuarCon(P, vacio).id, 'web-estructura');
  const m = pc.combinar({ lecciones: [
    { leccion_id: 'web-estructura', estado: 'completada', visto_en: '2026-11-01T10:00:00Z' },
    { leccion_id: 'web-rejilla', estado: 'en-curso', visto_en: '2026-11-02T10:00:00Z' }] },
  { 'web-rejilla': { completada: true, visto_en: '2026-11-03T10:00:00Z' } });
  assert.equal(m.get('web-rejilla').estado, 'completada');
  assert.equal(m.get('web-rejilla').pendiente, true);
  assert.equal(pc.continuarCon(P, m).id, 'web-adaptable');         // última completada → siguiente sin completar
  const m2 = pc.combinar({ lecciones: [{ leccion_id: 'web-eventos', estado: 'en-curso', visto_en: '2026-11-05T10:00:00Z' },
    { leccion_id: 'web-estructura', estado: 'completada', visto_en: '2026-11-01T10:00:00Z' }] });
  assert.equal(pc.continuarCon(P, m2).id, 'web-eventos');          // última visitada sin completar
  const todo = pc.combinar({ lecciones: P.map((p, i) => ({ leccion_id: p.id, estado: 'completada', visto_en: `2026-11-0${i + 1}T00:00:00Z` })) });
  assert.equal(pc.continuarCon(P, todo).id, 'web-publicacion');
});

test('laboratorio: invitado, sin inscripción y cuenta inscrita', async () => {
  const s = servidor();
  let c = await pc.conectarLaboratorio('course-web', { cliente: s.cliente });
  assert.equal(c.modo, 'invitado'); assert.equal(c.espacio, '');
  c.visitar('web-estructura');
  assert.equal(await c.completar('web-estructura'), 'invitado');
  assert.equal(s.posts.length, 0);
  assert.match(c.aviso().avance, /invitado/i);

  s.sesion = 'beto@example.com';
  c = await pc.conectarLaboratorio('course-python', { cliente: s.cliente });
  assert.equal(c.inicio, 'sin-inscripcion'); assert.equal(c.modo, 'invitado');
  assert.match(c.aviso().avance, /no estás inscrito/);

  s.sesion = 'ana@example.com';
  c = await pc.conectarLaboratorio('course-web', { cliente: s.cliente });
  assert.equal(c.modo, 'cuenta');
  assert.equal(c.espacio, '.cuenta.' + await pc.claveCuenta('ana@example.com'));
  c.visitar('web-rejilla');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.estado('web-rejilla'), 'en-curso');
  assert.equal(await c.completar('web-rejilla'), 'registrado');
  assert.equal(c.estado('web-rejilla'), 'completada');
  assert.equal(c.aviso().tipo, 'ok');
  assert.match(c.aviso().borrador, /solo en este navegador/);
});

test('laboratorio: sin red queda pendiente solo para la cuenta y se recupera al volver', async () => {
  const s = servidor();
  oyentes.online = [];   // cada página tiene un solo controlador; aquí se descartan los de pruebas anteriores
  s.sesion = 'ana@example.com';
  const c = await pc.conectarLaboratorio('course-python', { cliente: s.cliente });
  s.red = false;
  assert.equal(await c.completar('python-condicionales'), 'pendiente');
  assert.equal(c.estado('python-condicionales'), 'completada');
  assert.equal(c.aviso().tipo, 'error');
  assert.ok(c.aviso().reintentar);
  // Recarga sin red: la pestaña recuerda su cuenta y sigue en su espacio.
  const offline = await pc.conectarLaboratorio('course-python', { cliente: s.cliente });
  assert.equal(offline.inicio, 'sin-conexion'); assert.equal(offline.modo, 'cuenta'); assert.equal(offline.espacio, c.espacio);
  s.red = true;
  for (const f of oyentes.online || []) f();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.datos['ana@example.com']['python-condicionales'].estado, 'completada');
  assert.deepEqual(pc.pendientes(c.clave), {});
});

test('laboratorio: cambio de cuenta o cierre de sesión detiene el registro', async () => {
  const s = servidor();
  s.sesion = 'ana@example.com';
  const c = await pc.conectarLaboratorio('course-web', { cliente: s.cliente });
  s.sesion = 'beto@example.com';                                   // otra persona entra en el mismo navegador
  assert.equal(await c.completar('web-eventos'), 'no-registrado');
  assert.equal(c.modo, 'detenido');
  assert.ok(!s.datos['beto@example.com']?.['web-eventos'] && !s.datos['ana@example.com']?.['web-eventos']);
  assert.deepEqual(pc.pendientes(await pc.claveCuenta('beto@example.com')), {});

  s.sesion = 'ana@example.com';
  const d = await pc.conectarLaboratorio('course-web', { cliente: s.cliente });
  pc.avisarSesion('sesion-cerrada');                              // el aula cerró sesión en otra pestaña
  assert.equal(d.modo, 'detenido');
  assert.equal(await d.completar('web-eventos'), 'no-registrado');
  assert.ok(d.aviso().recargar);
});

test('sin conexión y sin cuenta conocida: invitado explícito; el historial de invitado nunca se envía', async () => {
  sessionStorage._m.clear();
  const s = servidor();
  s.red = false;
  const c = await pc.conectarLaboratorio('course-web', { cliente: s.cliente });
  assert.equal(c.inicio, 'error'); assert.equal(c.modo, 'invitado');
  assert.match(c.aviso().avance, /no se sumará a ninguna cuenta/);
  localStorage.setItem('globalt.taller-web.v1.estructura', JSON.stringify({ done: true, html: '<h1>x</h1>' }));
  s.red = true; s.sesion = 'ana@example.com';
  const d = await pc.conectarLaboratorio('course-web', { cliente: s.cliente });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(d.estado('web-estructura'), 'sin-comenzar');
  assert.equal(s.posts.length, 0);                                  // nada del historial de invitado se envió
});
