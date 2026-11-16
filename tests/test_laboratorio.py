"""Laboratorio Arduino: emulación de HEX reales, evaluación del reto, ayudas y servicio de compilación."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'games/laboratorio-arduino/src'
FIX = ROOT / 'tests/fixtures/laboratorio'


def node(script):
    return subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                          capture_output=True, text=True, timeout=120).stdout


class EmulationTests(unittest.TestCase):
    """Los HEX de tests/fixtures/laboratorio se generaron con el servicio (fuentes .ino al lado)."""

    def evaluate(self, name):
        out = node(f'''
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ evaluateChallenge, serialLines, EVAL_DURATION_MS }} from './games/laboratorio-arduino/src/challenge.js';
const trace = {{ pins: [], serial: [], durationMs: EVAL_DURATION_MS }};
const r = new NanoRunner(readFileSync('{FIX}/{name}.hex', 'utf8'), {{
  onPin: (pin, high, t) => trace.pins.push({{ pin, high, t }}),
  onSerial: (byte, t, baud) => trace.serial.push({{ byte, t, baud }}) }});
r.runFor(EVAL_DURATION_MS);
console.log(JSON.stringify({{ ...evaluateChallenge(trace), lines: serialLines(trace.serial).slice(0, 4) }}));
''')
        return json.loads(out)

    def test_solution_passes(self):
        result = self.evaluate('solucion')
        self.assertTrue(result['passed'], result)
        self.assertEqual(result['lines'][:2], ['Latido 1', 'Latido 2'])

    def test_example_runs_but_does_not_pass(self):
        result = self.evaluate('ejemplo')
        self.assertFalse(result['passed'])
        self.assertEqual(result['lines'][:2], ['Hola, soy tu Arduino Nano', 'LED encendido'])
        checks = {c['id']: c['ok'] for c in result['checks']}
        self.assertEqual(checks, {'blink': False, 'on': False, 'off': False, 'baud': True, 'serial': False})

    def test_wrong_timing_serial_and_baud_fail(self):
        self.assertFalse({c['id']: c['ok'] for c in self.evaluate('ritmo-incorrecto')['checks']}['on'])
        checks = {c['id']: c['ok'] for c in self.evaluate('sin-serial')['checks']}
        self.assertTrue(checks['on'] and checks['off'])
        self.assertFalse(checks['baud'] or checks['serial'])
        self.assertFalse({c['id']: c['ok'] for c in self.evaluate('baudios-115200')['checks']}['baud'])

    def test_invalid_hex_is_rejected(self):
        node('''
import assert from 'node:assert/strict';
import { parseIntelHex } from './games/laboratorio-arduino/src/nano-runner.js';
assert.throws(() => parseIntelHex('hola'));
assert.throws(() => parseIntelHex(':0100000000FE\\n'));          // suma de control incorrecta
assert.throws(() => parseIntelHex(':020000000C945E\\n'));          // falta el registro final
assert.equal(parseIntelHex(':020000000C945E\\n:00000001FF\\n')[0], 0x940C);
''')


class InterfaceModuleTests(unittest.TestCase):
    def test_highlight_help_progress_and_guide(self):
        node('''
import assert from 'node:assert/strict';
import { highlightCpp } from './games/laboratorio-arduino/src/cpp-highlight.js';
import { explainDiagnostic } from './games/laboratorio-arduino/src/compiler-help.js';
const html = highlightCpp('void loop() { // <b>\\n  Serial.println("<x>"); }');
assert.ok(!html.includes('<b>') && html.includes('&lt;x&gt;'));
assert.match(html, /tok-kw">void/); assert.match(html, /tok-fn">Serial/);
assert.match(explainDiagnostic("expected ‘;’ before ‘}’ token"), /punto y coma/);
assert.match(explainDiagnostic("‘digitalWrit’ was not declared in this scope"), /digitalWrit/);
assert.match(explainDiagnostic("undefined reference to `loop'"), /loop\\(\\)/);
assert.equal(explainDiagnostic('mensaje desconocido'), null);

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const p = await import('./games/laboratorio-arduino/src/progress.js');
p.saveCode('l', 'void setup(){}');
p.recordAttempt('l'); p.markCompleted('l', 'x');
p.clearCode('l');
const lesson = p.getLesson('l');
assert.equal(lesson.code, undefined); assert.equal(lesson.attempts, 1); assert.ok(lesson.completedAt);
store.set('globalt.laboratorio.arduino.v1', '{roto');
assert.deepEqual(p.getLesson('l'), {});

const { preparedHelp } = await import('./games/laboratorio-arduino/src/guide.js');
const hint = preparedHelp.respond('hint', { level: 0 }).text;
assert.match(hint, /Pista 1 de 5/);
assert.doesNotMatch(preparedHelp.respond('hint', { level: 4 }).text, /delay\\(200\\)/);   // no entrega la solución
const fail = preparedHelp.respond('eval-fail', { checks: [{ id: 'on', ok: false }, { id: 'baud', ok: true }] });
assert.doesNotMatch(fail.text, /superado/);
assert.match(preparedHelp.respond('compile-error', { diagnostics: [{ tipo: 'error', linea: 3, mensaje: "expected ‘;’ before ‘}’ token" }] }).text, /línea 3/);
''')


spec = importlib.util.spec_from_file_location('compilador', ROOT / 'services/compilador-arduino/server.py')
compilador = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compilador)


class CompilerServiceTests(unittest.TestCase):
    def test_validation_blocks_file_reads(self):
        self.assertIsNone(compilador.validar('#include <Servo.h>\nvoid setup(){}\nvoid loop(){}'))
        for code in ['#include "/etc/passwd"', '#include <../../x.h>', 'asm(".incbin \\"/etc/hosts\\"");',
                     '#if __has_include(<x>)\n#endif', '', 'a' * 40000, 'void setup(){}\0']:
            self.assertIsNotNone(compilador.validar(code), code[:30])

    def test_prototypes_and_diagnostics(self):
        protos = compilador.prototipos('void setup(){ parpadear(200); }\nvoid loop(){ if (x) { } }\n'
                                       '// void falsa(int a) {\nvoid parpadear(int ms) {\n}\n')
        self.assertEqual(protos, 'void parpadear(int ms);')
        diags = compilador.diagnosticos("sketch.ino:3:1: error: expected ';' before '}' token\n"
                                        "include/Arduino.h:1:1: note: ignorada\n"
                                        "main.cpp:(.text+0x8): undefined reference to `loop'")
        self.assertEqual(diags[0], {'linea': 3, 'columna': 1, 'tipo': 'error', 'mensaje': "expected ';' before '}' token"})
        self.assertEqual(diags[1]['linea'], None)
        self.assertEqual(len(diags), 2)

    @unittest.skipUnless(shutil.which('avr-g++') and os.environ.get('COMPILADOR_NUCLEO'),
                         'requiere avr-gcc y COMPILADOR_NUCLEO (ver services/compilador-arduino/README.md)')
    def test_real_compilation(self):
        compilador.NUCLEO = Path(os.environ['COMPILADOR_NUCLEO'])
        ok = compilador.compilar((FIX / 'solucion.ino').read_text())
        self.assertTrue(ok['ok'], ok['salida'])
        self.assertTrue(ok['hex'].startswith(':'))
        bad = compilador.compilar('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n')
        self.assertFalse(bad['ok'])
        self.assertEqual(bad['diagnosticos'][0]['linea'], 3)
        self.assertNotIn('/tmp/', bad['salida'])

    def test_timeout_kills_process(self):
        with self.assertRaises(TimeoutError):
            compilador.ejecutar(['sleep', '5'], Path('/tmp'), 1)


class CatalogTests(unittest.TestCase):
    def test_arduino_course_opens_internal_lab(self):
        data = json.loads((ROOT / 'data/catalogo-inicial.json').read_text())
        course = next(c for c in data['courses'] if c['id'] == 'course-arduino')
        self.assertEqual(course['link'], 'games/laboratorio-arduino/index.html')
        self.assertTrue((ROOT / course['link']).is_file())
        node('''
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { migrateLocalCourses } = await import('./src/data/course-catalog-migration.js');
const old = [{ id: 'course-arduino', title: 'Mi título', link: 'https://wokwi.com/projects/new/arduino-nano' },
             { id: 'otro', link: 'https://example.invalid' }];
const result = migrateLocalCourses(old);
assert.equal(result[0].link, 'games/laboratorio-arduino/index.html');
assert.equal(result[0].title, 'Mi título');
assert.deepEqual(result[1], old[1]);
const custom = [{ id: 'course-arduino', link: 'https://mi-enlace.invalid' }];
store.clear();
assert.deepEqual(migrateLocalCourses(custom), custom);
''')


if __name__ == '__main__':
    unittest.main()
