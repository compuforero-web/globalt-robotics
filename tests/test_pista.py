"""Pista: geometría y programas reales. Preparar HEX con scripts/prepare-pista-fixtures.py."""
import json
from pathlib import Path
import subprocess
import unittest
from test_laboratorio import node

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / 'tests/fixtures/laboratorio'
READY = all((FIX / (n + '.hex')).is_file() for n in ('pista-solucion', 'pista-izquierda', 'pista-ignora-obstaculo',
    'pista-muy-lento', 'pista-solo-gira', 'pista-sin-sensor', 'pista-ejemplo', 'pista-ej-umbral'))

class PistaTests(unittest.TestCase):
    def run_world(self, name, track='patio', duration=60000):
        script = """
import {readFileSync} from 'node:fs';
import {recordFast} from './games/laboratorio-arduino/src/sim-worker.js';
import {pistaStimulus,evaluatePista} from './games/laboratorio-arduino/src/lessons/pista-eval.js';
const name=NAME,track=TRACK,duration=DURATION;
const t=recordFast(readFileSync('tests/fixtures/laboratorio/'+name+'.hex','utf8'),duration,[2,4,5,6,7,10,11],pistaStimulus(track));
console.log(JSON.stringify({world:t.world,checks:evaluatePista([t]).checks.filter(c=>c.id.startsWith(track+'-')),
 windows:t.windows.length,serialBytes:t.serial.length,samples:t.motor.samples.length,echoes:t.sonar.echoes.length,
 distances:t.sonar.distances.map(d=>d.cm)}));
""".replace('NAME',json.dumps(name)).replace('TRACK',json.dumps(track)).replace('DURATION',str(duration))
        return json.loads(node(script))

    @unittest.skipUnless(READY, 'requiere generar los HEX de pista con el compilador real')
    def test_two_strategies_complete_three_tracks(self):
        for name in ('pista-solucion','pista-izquierda'):
            for track in ('patio','columnas','pasillos'):
                with self.subTest(name=name,track=track):
                    r=self.run_world(name,track)
                    self.assertTrue(all(c['ok'] for c in r['checks']),r)
                    self.assertEqual(r['world']['collisions'],0)
                    self.assertGreaterEqual(r['world']['pathM'],6)
                    self.assertEqual(r['windows'],0)
                    self.assertLessEqual(r['serialBytes'],20000)
                    self.assertLessEqual(r['samples'],1201)

    @unittest.skipUnless(READY, 'requiere generar los HEX de pista con el compilador real')
    def test_blind_forward_fails_on_real_contact(self):
        r=self.run_world('pista-ignora-obstaculo')
        checks={c['id']:c['ok'] for c in r['checks']}
        self.assertTrue(checks['patio-sensor'])
        self.assertFalse(checks['patio-colisiones'])
        self.assertFalse(checks['patio-bloqueo'])

    @unittest.skipUnless(READY, 'requiere generar los HEX de pista con el compilador real')
    def test_failures_and_examples_have_measured_consequences(self):
        r=self.run_world('pista-solo-gira',duration=10000)
        self.assertLess(r['world']['pathM'],0.02);self.assertGreater(r['world']['maxIdleMs'],3000)
        r=self.run_world('pista-muy-lento',duration=10000)
        self.assertLess(r['world']['pathM'],0.1)
        r=self.run_world('pista-sin-sensor',duration=10000)
        self.assertEqual(r['echoes'],0);self.assertGreater(r['world']['collisions'],0)
        for name in ('pista-ejemplo','pista-ej-umbral'):
            r=self.run_world(name,duration=4000)
            self.assertEqual(r['world']['pathM'],0)
            self.assertGreater(r['world']['maxIdleMs'],3000)
            self.assertGreater(r['echoes'],20)

    @unittest.skipUnless(READY, 'requiere generar los HEX de pista con el compilador real')
    def test_echoes_follow_motion_deterministically(self):
        a=self.run_world('pista-ignora-obstaculo',duration=2500)
        b=self.run_world('pista-ignora-obstaculo',duration=2500)
        self.assertEqual(a,b)
        self.assertGreater(a['world']['x'],0.9)
        self.assertGreater(a['distances'][1],a['distances'][-1]+20)

    def test_world_geometry(self):
        subprocess.run(['node','--test','tests/robot-world.test.mjs'],cwd=ROOT,check=True)

    def test_content_and_hints(self):
        node("""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import L from './games/laboratorio-arduino/src/lessons/evasor-pista.js';
import {MANIFEST} from './games/laboratorio-arduino/src/lessons/index.js';
assert.equal(L.numero,15);assert.equal(MANIFEST.at(-1).id,L.id);
assert.equal(L.evaluation.runs.length,3);
assert.equal(readFileSync('tests/fixtures/laboratorio/pista-ejemplo.ino','utf8'),L.exampleCode);
assert.equal(readFileSync('tests/fixtures/laboratorio/pista-ej-umbral.ino','utf8'),L.examples.umbral.code);
for(const id of ['duracion','colisiones','recorrido','bloqueo','sensor','pines']){
 assert.equal(L.guide.chooseTopic({lastChecks:[{id:'patio-'+id,ok:false}]}).topic,id);
 assert.ok(L.guide.hintText(id,0).text.length>30);assert.equal(L.guide.hintText(id,1).last,true);
}
assert.equal(L.guide.chooseTopic({compileError:{errorLine:2}}).topic,'compilar');
assert.equal(L.guide.chooseTopic({completed:true}).topic,'superado');
assert.match(L.html(),/90 s/);
""")
