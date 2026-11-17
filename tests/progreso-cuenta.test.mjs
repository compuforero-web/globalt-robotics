// Pruebas del módulo de progreso por cuenta del laboratorio (cola pendiente separada por cuenta).
import test from 'node:test';
import assert from 'node:assert/strict';

const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
  key: (i) => [...almacen.keys()][i],
  get length() { return almacen.size; },
};
const pc = await import('../games/laboratorio-arduino/src/progreso-cuenta.js');
const { MANIFEST } = await import('../games/laboratorio-arduino/src/lessons/index.js');
const L1 = 'arduino-led-serie', L2 = 'arduino-protoboard-semaforo', L3 = 'arduino-pwm-brillo';
const err = (status) => Object.assign(new Error('x'), { status });
const apiDe = (correo, registrar = async (d) => ({ progreso: { leccion_id: d.leccion_id } })) => {
  const envios = [];
  return { envios, sesion: async () => ({ usuario: { correo } }), registrar: async (d) => { envios.push(d); return registrar(d); } };
};

test('claves distintas por cuenta, sin el correo y estables', async () => {
  const a = await pc.claveCuenta('Ana@Example.com'), a2 = await pc.claveCuenta(' ana@example.com '), b = await pc.claveCuenta('beto@example.com');
  assert.equal(a, a2);
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(await pc.claveCuenta(''), null);
});

test('anotar fusiona: completada y pasos vistos nunca se pierden; datos inválidos se ignoran', async () => {
  almacen.clear();
  const a = await pc.claveCuenta('ana@example.com');
  assert.ok(pc.anotar(a, L1, { paso: 2, vistos: [0, 1] }));
  assert.ok(pc.anotar(a, L1, { paso: 3, completada: true }));
  assert.ok(pc.anotar(a, L1, { paso: 1 }));
  const e = pc.pendientes(a)[L1];
  assert.deepEqual([e.paso, e.vistos, e.completada, e.seq], [1, [0, 1, 2, 3], true, 3]);
  assert.equal(pc.anotar(a, 'NO VALIDA', { paso: 0 }), false);
  assert.equal(pc.anotar(a, L1, { paso: 99 }), false);
  assert.equal(pc.anotar(null, L1, { paso: 0 }), false);
  // Basura en el almacenamiento no se envía.
  localStorage.setItem(pc.PREFIJO + a, JSON.stringify({ ...JSON.parse(localStorage.getItem(pc.PREFIJO + a)), '__proto__x': { paso: 1 }, [L2]: { paso: 'x' } }));
  assert.deepEqual(Object.keys(pc.pendientes(a)), [L1]);
  // La clave del registro local sin cuenta no se usa nunca.
  assert.ok(![...almacen.keys()].includes('globalt.laboratorio.arduino.v1'));
});

test('enviar solo manda la cola de la cuenta con sesión', async () => {
  almacen.clear();
  const a = await pc.claveCuenta('ana@example.com'), b = await pc.claveCuenta('beto@example.com');
  pc.anotar(a, L1, { paso: 1, completada: true });
  pc.anotar(b, L2, { paso: 0 });
  const comoBeto = apiDe('beto@example.com');
  assert.equal((await pc.enviar(a, comoBeto)).estado, 'otra-cuenta');
  assert.deepEqual(comoBeto.envios, []);
  assert.equal((await pc.enviar(b, comoBeto)).estado, 'al-dia');
  assert.deepEqual(comoBeto.envios.map((d) => d.leccion_id), [L2]);
  assert.deepEqual(pc.pendientes(b), {});
  assert.deepEqual(Object.keys(pc.pendientes(a)), [L1]);   // la de Ana sigue esperando a Ana
  const comoAna = apiDe('ana@example.com');
  assert.equal((await pc.enviar(a, comoAna)).estado, 'al-dia');
  assert.equal(comoAna.envios[0].completada, true);
  assert.ok(!('usuario_id' in comoAna.envios[0]));
});

test('errores: la cola se conserva y se clasifica; 422 no bloquea', async () => {
  almacen.clear();
  const a = await pc.claveCuenta('ana@example.com');
  pc.anotar(a, L1, { paso: 1 });
  for (const [status, estado] of [[0, 'error'], [503, 'error'], [429, 'error'], [401, 'sin-sesion'], [403, 'sin-permiso'], [405, 'no-disponible'], [404, 'no-disponible']]) {
    const r = await pc.enviar(a, apiDe('ana@example.com', async () => { throw err(status); }));
    assert.equal(r.estado, estado, String(status));
    assert.deepEqual(Object.keys(pc.pendientes(a)), [L1]);
  }
  const sinRed = { sesion: async () => { throw err(0); }, registrar: async () => assert.fail() };
  assert.equal((await pc.enviar(a, sinRed)).estado, 'error');
  assert.equal((await pc.enviar(a, apiDe('ana@example.com', async () => { throw err(422); }))).estado, 'al-dia');
  assert.deepEqual(pc.pendientes(a), {});
});

test('una anotación llegada durante el envío no se borra', async () => {
  almacen.clear();
  const a = await pc.claveCuenta('ana@example.com');
  pc.anotar(a, L1, { paso: 1 });
  let primera = true;
  const api = apiDe('ana@example.com', async (d) => {
    if (primera) { primera = false; pc.anotar(a, L1, { paso: 2, completada: true }); }
    return { progreso: { leccion_id: d.leccion_id } };
  });
  const r = await pc.enviar(a, api);
  assert.equal(r.estado, 'al-dia');
  assert.deepEqual(api.envios.map((d) => [d.paso, d.completada]), [[1, false], [2, true]]);
});

test('combinar, última lección y «Continuar»', () => {
  const servidor = { lecciones: [
    { leccion_id: L1, estado: 'completada', paso: 5, vistos: [0, 5], visto_en: '2026-11-01T00:00:00Z', completada_en: '2026-11-01T00:00:00Z' },
    { leccion_id: L2, estado: 'en-curso', paso: 1, vistos: [1], visto_en: '2026-11-02T00:00:00Z', completada_en: null }] };
  let mapa = pc.combinar(servidor, {});
  assert.equal(pc.ultima(mapa), L2);
  assert.equal(pc.continuarCon(MANIFEST, mapa), L2);
  mapa = pc.combinar(servidor, { [L2]: { paso: 3, vistos: [3], visto_en: '2026-11-03T00:00:00Z', completada: true, seq: 1 } });
  assert.deepEqual([mapa.get(L2).estado, mapa.get(L2).paso, mapa.get(L2).vistos, mapa.get(L2).pendiente], ['completada', 3, [1, 3], true]);
  assert.equal(pc.continuarCon(MANIFEST, mapa), L3);   // la siguiente sin completar
  // Una entrada pendiente antigua no retrocede el paso ni quita la finalización del servidor.
  mapa = pc.combinar(servidor, { [L1]: { paso: 0, vistos: [1], visto_en: '2026-10-01T00:00:00Z', completada: false, seq: 1 } });
  assert.deepEqual([mapa.get(L1).estado, mapa.get(L1).paso, mapa.get(L1).vistos], ['completada', 5, [0, 1, 5]]);
  assert.equal(pc.continuarCon(MANIFEST, new Map()), L1);
  const todo = new Map(MANIFEST.map((m, i) => [m.id, { estado: 'completada', visto_en: new Date(2026, 0, i + 1).toISOString() }]));
  assert.equal(pc.continuarCon(MANIFEST, todo), MANIFEST.at(-1).id);
});
