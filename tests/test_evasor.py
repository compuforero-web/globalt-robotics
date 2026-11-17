"""Lección 14: integra modelos existentes con HEX reales, sin reconocer texto de soluciones."""
import unittest
from test_laboratorio import node


class EvasorDecisionTests(unittest.TestCase):
    def test_real_programs(self):
        node('''
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordFast } from './games/laboratorio-arduino/src/sim-worker.js';
import L from './games/laboratorio-arduino/src/lessons/evasor-decision.js';
const fails = {
  'evasor-bloqueante': 'sensor', 'evasor-ej-estados': 'pines', 'evasor-ejemplo': 'avanzar',
  'evasor-giro-corto': 'giro', 'evasor-mapa-antiguo': 'pines', 'evasor-medida-lenta': 'sensor',
  'evasor-retroceso-corto': 'retroceso', 'evasor-siempre-avanza': 'parada',
  'evasor-sin-eco-avanza': 'sin-eco', 'evasor-sin-fuerza': 'motores', 'evasor-sin-parada': 'parada',
};
for (const name of ['evasor-solucion', 'evasor-izquierda', ...Object.keys(fails)]) {
  const hex = readFileSync('tests/fixtures/laboratorio/' + name + '.hex', 'utf8');
  const t = recordFast(hex, L.evaluation.durationMs, L.pins, L.evaluation.stimulus);
  const result = L.evaluation.evaluate(t);
  assert.equal(result.passed, !(name in fails), name + ': ' + JSON.stringify(result));
  if (name in fails) assert.equal(result.checks.find(c => c.id === fails[name]).ok, false, name);
}
''')

    def test_other_distances_and_times_are_read_from_pins(self):
        node('''
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordFast } from './games/laboratorio-arduino/src/sim-worker.js';
import L from './games/laboratorio-arduino/src/lessons/evasor-decision.js';
import { DECISION, decisionStimulus } from './games/laboratorio-arduino/src/lessons/evasor-eval.js';
// Otros instantes y límites de histéresis: 25 inicia evasión, 40 no la termina, 41 sí.
const script = DECISION.script.map(({t,cm}) => ({t: t * 1.03, cm: cm === 18 ? 25 : cm === 32 || cm === 38 ? 40 : cm === 75 || cm === 90 ? 41 : cm}));
for (const name of ['evasor-solucion', 'evasor-izquierda']) {
 const hex = readFileSync('tests/fixtures/laboratorio/' + name + '.hex', 'utf8');
 const stimulus = decisionStimulus(script);
 const t = recordFast(hex, L.evaluation.durationMs, L.pins, stimulus);
 const r = L.evaluation.evaluate(t);
 assert.equal(r.passed, true, JSON.stringify(r));
 assert.ok(t.sonar.echoes.some(e=>e.cm===25));
 assert.ok(t.motor.samples.some(s=>s.v[0]*s.v[1]<0));
}
const blank = { durationMs: DECISION.durationMs, pins: [], serial: [], windows: [] };
assert.equal(L.evaluation.evaluate(blank).passed, false);
''')

    def test_content_hints_and_map(self):
        node('''
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import L from './games/laboratorio-arduino/src/lessons/evasor-decision.js';
import { MANIFEST } from './games/laboratorio-arduino/src/lessons/index.js';
import { PIN_MAPS, pinMapProblems } from './games/laboratorio-arduino/src/motor.js';
assert.equal(L.numero, 14);
assert.equal(MANIFEST.at(-1).id, L.id);
assert.deepEqual(pinMapProblems(PIN_MAPS.robot, {7:'TRIG',8:'ECHO',9:'servo'}), []);
assert.equal(readFileSync('tests/fixtures/laboratorio/evasor-ejemplo.ino', 'utf8'), L.exampleCode);
assert.equal(readFileSync('tests/fixtures/laboratorio/evasor-ej-estados.ino', 'utf8'), L.examples.estados.code);
assert.match(L.html(), /ruedas al aire/);
for (const id of ['pines','sensor','avanzar','parada','retroceso','giro','sin-eco','motores']) {
 assert.equal(L.guide.chooseTopic({lastChecks:[{id,ok:false}]}).topic, id);
 assert.ok(L.guide.hintText(id,0).text.length>30);
 assert.ok(L.guide.hintText(id,1).last);
}
assert.equal(L.guide.chooseTopic({compileError:{errorLine:4}}).topic,'compilar');
assert.equal(L.guide.chooseTopic({completed:true}).topic,'superado');
''')
