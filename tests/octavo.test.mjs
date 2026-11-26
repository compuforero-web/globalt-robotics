import test from 'node:test';
import assert from 'node:assert/strict';
import { fases, disponible } from '../games/laboratorio-arduino/src/octavo.js';
import { MANIFEST } from '../games/laboratorio-arduino/src/lessons/index.js';

test('Octavo reutiliza cinco lecciones y exige todas las anteriores', () => {
  assert.equal(new Set(fases).size, 5);
  const aprobadas = new Set();
  const superada = id => aprobadas.has(id);
  for (const [indice, id] of fases.entries()) {
    assert.ok(MANIFEST.some(m => m.id === id));
    assert.ok(disponible(id, superada));
    assert.ok(fases.slice(indice + 1).every(f => !disponible(f, superada)));
    aprobadas.add(id);
  }
  aprobadas.delete(fases[0]);
  assert.equal(disponible(fases.at(-1), superada), false);
  assert.equal(disponible('desconocida', superada), false);
});
