"""Práctica física de octavo: el programa del carrito, compilado con el servicio real, sobre los modelos del laboratorio.

CI (pista.yml) regenera tests/fixtures/laboratorio/carrito-octavo.hex desde deploy/ensayo-octavo/carrito_octavo antes
de esta prueba, así que siempre se simula la fuente actual. La prueba física con el kit la hace el profesor.
"""
import json
import re
import unittest
from test_laboratorio import ROOT, node

INO = ROOT / 'deploy/ensayo-octavo/carrito_octavo/carrito_octavo.ino'
HEX = ROOT / 'tests/fixtures/laboratorio/carrito-octavo.hex'


class CarritoOctavoTests(unittest.TestCase):
    def test_mapa_de_pines_y_regla(self):
        fuente = INO.read_text()
        constantes = dict((k, int(v)) for k, v in re.findall(r'\b([A-Z][A-Z0-9_]*) = (\d+)', fuente))
        self.assertEqual({k: constantes[k] for k in ('TRIG', 'ECO', 'IN1', 'IN2', 'ENA', 'IN3', 'IN4', 'ENB')},
                         {'TRIG': 7, 'ECO': 8, 'IN1': 2, 'IN2': 4, 'ENA': 5, 'IN3': 10, 'IN4': 11, 'ENB': 6})
        mapa = (ROOT / 'games/laboratorio-arduino/src/motor.js').read_text()
        self.assertIn("{ id: 'A', name: 'Motor izquierdo', in1: 2, in2: 4, en: 5 }", mapa)
        self.assertIn("{ id: 'B', name: 'Motor derecho', in1: 10, in2: 11, en: 6 }", mapa)
        self.assertEqual(constantes['LIMITE_CM'], 20)
        self.assertIn('lectura <= LIMITE_CM', fuente)
        # El reto de evasión (fase 4) es otra actividad y conserva su umbral de 25 cm.
        self.assertIn('Al detectar 25 cm o menos',
                      (ROOT / 'games/laboratorio-arduino/src/lessons/evasor-decision.js').read_text())

    def test_lecturas_ordenes_y_sin_eco(self):
        out = node('''
import { readFileSync } from 'node:fs';
import { recordFast } from './games/laboratorio-arduino/src/sim-worker.js';
import { decisionStimulus } from './games/laboratorio-arduino/src/lessons/evasor-eval.js';
import { timedSerialLines } from './games/laboratorio-arduino/src/challenge.js';
const casos = [100, 19, 20, 20.4, 20.6, 20.9, 21, null, 100, 5];
const script = casos.map((cm, i) => ({ t: i === 0 ? 0 : 3000 + (i - 1) * 1000, cm }));
const t = recordFast(readFileSync('tests/fixtures/laboratorio/carrito-octavo.hex', 'utf8'), 3000 + (casos.length - 1) * 1000,
                     [2, 4, 5, 6, 7, 10, 11], decisionStimulus(script));
const lineas = timedSerialLines(t.serial);
const res = script.slice(1).map(({ t: t0, cm }) => {
  const v = t.motor.samples.filter(s => s.t >= t0 + 300 && s.t < t0 + 1000).map(s => s.v);
  return { cm, linea: lineas.filter(l => l.t >= t0 + 300 && l.t < t0 + 1000).at(-1)?.text,
           motores: v.every(([a, b]) => a > 0.2 && b > 0.2) ? 'avanzan' : v.every(([a, b]) => a === 0 && b === 0) ? 'detenidos' : 'mixto' };
});
const quieto = !t.motor.samples.some(s => s.t < 2990 && (s.v[0] || s.v[1]));
console.log(JSON.stringify({ quieto, primera: lineas[0]?.text, res }));
''')
        d = json.loads(out)
        self.assertTrue(d['quieto'], 'los motores no deben moverse en la espera inicial de 3 s')
        self.assertIn('lectura <= 20 cm', d['primera'])
        esperado = {19: ('19,0', 19, 'PARAR'), 20: ('20,0', 20, 'PARAR'), 20.4: ('20,4', 20, 'PARAR'),
                    20.6: ('20,6', 21, 'AVANZAR'), 20.9: ('20,9', 21, 'AVANZAR'), 21: ('21,0', 21, 'AVANZAR'),
                    5: ('5,0', 5, 'PARAR')}
        for caso in d['res']:
            cm, linea = caso['cm'], caso['linea']
            if cm is None:
                self.assertEqual(linea, 'Eco: sin eco | Distancia: -- | Lectura usada: -- | Orden: PARAR (sin eco)')
                self.assertEqual(caso['motores'], 'detenidos')
            elif cm == 100:
                self.assertTrue(linea.endswith('Lectura usada: 100 cm | Orden: AVANZAR'), linea)
                self.assertEqual(caso['motores'], 'avanzan')
            else:
                dist, lectura, orden = esperado[cm]
                self.assertRegex(linea, rf'^Eco: \d+ us \| Distancia: {dist} cm \| Lectura usada: {lectura} cm \| '
                                        rf'Orden: {orden}$')
                self.assertEqual(caso['motores'], 'detenidos' if orden == 'PARAR' else 'avanzan', cm)

    def test_guia_separa_regla_lectura_orden_y_posicion(self):
        guia = (ROOT / 'deploy/ensayo-octavo/guia/generar_guia.py').read_text()
        b5 = guia[guia.index("Prueba('B5'"):guia.index("extra=[('sineco'")]
        for columna in ("('regla', 'Distancia marcada con regla", "('lectura', 'Lectura usada", "('orden', 'Orden enviada",
                        "('final', 'Posición final del carrito"):
            self.assertIn(columna, b5)
        for fila in ("('19', '19 cm')", "('20', '20 cm')", "('20_9', '20,9 cm')", "('21', '21 cm')"):
            self.assertIn(fila, b5)
        for ident in ('B2', 'B5', 'C1', 'D4'):
            self.assertRegex(guia, rf"Prueba\('{ident}', '[^']+', corto=True")
        self.assertIn('25 cm o menos', guia[guia.index('F. Demostración adicional'):])


if __name__ == '__main__':
    unittest.main()
