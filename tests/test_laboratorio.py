"""Laboratorio Arduino: emulación de HEX reales, evaluación del reto, ayudas y servicio de compilación."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
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

    def test_beat_lines_must_match_their_blink_in_time(self):
        # Regresión: imprimir «Latido 1…5» al inicio o fuera del encendido no debe aprobar.
        for name in ('mensajes-al-inicio', 'latido-desfasado'):
            result = self.evaluate(name)
            checks = {c['id']: c['ok'] for c in result['checks']}
            self.assertFalse(result['passed'], name)
            self.assertTrue(checks['on'] and checks['off'] and checks['baud'], name)
            self.assertFalse(checks['serial'], name)

    def test_beat_window_limits(self):
        node('''
import assert from 'node:assert/strict';
import { evaluateChallenge, LINE_BEFORE_MS, LINE_AFTER_MS } from './games/laboratorio-arduino/src/challenge.js';
const rises = [100, 1100, 2100, 3100, 4100];
const pins = rises.flatMap((t) => [{ pin: 13, high: true, t }, { pin: 13, high: false, t: t + 200 }]);
const trace = (offsets) => ({ durationMs: 5000, pins, serial: rises.flatMap((t, i) =>
  [...`Latido ${i + 1}\\r\\n`].map((c, k) => ({ byte: c.charCodeAt(0), t: t + offsets[i] + k, baud: 9615 }))) });
const serialOk = (offsets) => evaluateChallenge(trace(offsets)).checks.find((c) => c.id === 'serial').ok;
assert.equal(serialOk([0, 0, 0, 0, 0]), true);
assert.equal(serialOk([-LINE_BEFORE_MS, LINE_AFTER_MS, 0, 0, 0]), true);
assert.equal(serialOk([0, -LINE_BEFORE_MS - 1, 0, 0, 0]), false);
assert.equal(serialOk([0, 0, LINE_AFTER_MS + 1, 0, 0]), false);
assert.equal(evaluateChallenge(trace([0, 0, 0, 0, 0])).passed, true);
''')

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
        for code in ['#include <Servo.h>\nvoid setup(){}\nvoid loop(){}',
                     '// #include "/etc/passwd"\nvoid setup(){ Serial.println("asm"); }\nvoid loop(){}']:
            self.assertIsNone(compilador.validar(code), code)
        for code in ['#include "/etc/passwd"', '#include <../../x.h>', 'asm(".incbin \\"/etc/hosts\\"");',
                     '#if __has_include(<x>)\n#endif', '', 'a' * 40000, 'void setup(){}\0',
                     # Regresiones: comentarios, continuación de línea, dígrafos y equivalentes del preprocesador.
                     '#/**/include "/etc/passwd"', '# /* x */ include "/etc/passwd"', '#inc\\\nlude "/etc/passwd"',
                     '#\\\ninclude "/etc/passwd"', '%:include "/etc/passwd"', '#import "/etc/passwd"',
                     '#include_next <stdio.h>', '#define F "/etc/passwd"\n#include F', '_Pragma("GCC dependency \\"x\\"")',
                     '#pragma GCC dependency "/etc/passwd"',
                     # Regresiones: ensamblador construido con cadenas concatenadas o escapes.
                     'void f(){ asm(".inc" "bin \\"/etc/hosts\\""); }', 'void f(){ __asm__(".\\x69ncbin x"); }',
                     'void f(){ asm volatile("nop"); }']:
            self.assertIsNotNone(compilador.validar(code), code[:40])

    @unittest.skipUnless(shutil.which('avr-g++') and os.environ.get('COMPILADOR_NUCLEO'),
                         'requiere avr-gcc y COMPILADOR_NUCLEO (ver services/compilador-arduino/README.md)')
    def test_compiler_blocks_reads_that_bypass_text_filter(self):
        """La capa decisiva revisa la salida real del preprocesador y el ensamblador generado."""
        compilador.NUCLEO = Path(os.environ['COMPILADOR_NUCLEO'])
        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as secret:
            secret.write('SECRETO-DE-PRUEBA-42\n')
        path = secret.name
        try:
            loop = '\nvoid setup(){}\nvoid loop(){}\n'
            cases = {
                'comentario': f'#/**/include "{path}"' + loop,
                'continuacion': f'#inc\\\nlude "{path}"' + loop,
                'digrafo': f'%:include "{path}"' + loop,
                'import': f'#import "{path}"' + loop,
                'macro': f'#define F "{path}"\n#include F' + loop,
                'relativa': '#include <' + '../' * 12 + path.lstrip('/') + '>' + loop,
                'asm-concatenado': f'void setup(){{ asm(".inc" "bin \\"{path}\\""); }}\nvoid loop(){{}}',
                'asm-pegado': f'#define P(a,b) a##b\nvoid setup(){{ P(__as,m__)(".\\x69ncbin \\"{path}\\""); }}\nvoid loop(){{}}',
                'asm-macro-gas': f'void setup(){{ asm(".macro m a\\n.inc\\\\a \\"{path}\\"\\n.endm\\nm bin"); }}\nvoid loop(){{}}',
                'seccion': f'__attribute__((used, section(".progmem.x\\n.\\x69ncbin \\"{path}\\"\\n#"))) const char d[2] = {{1,2}};'
                           '\nvoid setup(){ Serial.print((int)*(volatile const char*)d); }\nvoid loop(){}',
            }
            for name, code in cases.items():
                result = compilador.compilar(code)
                self.assertFalse(result['ok'], name)
                self.assertNotIn('hex', result, name)
                self.assertNotIn('SECRETO', json.dumps(result), name)
        finally:
            os.unlink(path)

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

    def test_runner_has_no_preexec_fn(self):
        source = (ROOT / 'services/compilador-arduino/server.py').read_text()
        self.assertNotIn('preexec_fn', source.replace('sin preexec_fn', ''))

    def test_limits_apply_in_parallel_threads(self):
        results = []
        def run():
            results.append(compilador.ejecutar(['sh', '-c', 'ulimit -n; ulimit -t; ulimit -f'], Path('/tmp'), 3))
        threads = [threading.Thread(target=run) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(results), 8)
        for code, text in results:
            self.assertEqual(code, 0)
            nofile, cpu, fsize = text.split()
            self.assertEqual((nofile, cpu), ('64', '3'))
            self.assertEqual(int(fsize) * 512, 16 * 1024 ** 2)   # ulimit -f usa bloques de 512 bytes

    def test_timeout_kills_process_group(self):
        with tempfile.TemporaryDirectory() as carpeta:
            started = time.monotonic()
            with self.assertRaises(TimeoutError):
                compilador.ejecutar(['sh', '-c', 'sleep 30 & echo $! > hijo; sleep 30'], Path(carpeta), 1)
            self.assertLess(time.monotonic() - started, 5)
            child = int((Path(carpeta) / 'hijo').read_text())
            for _ in range(50):
                try:
                    estado = Path(f'/proc/{child}/stat').read_text().rsplit(')', 1)[1].split()[0]
                except FileNotFoundError:
                    break
                if estado == 'Z':   # terminado; falta que init lo recoja
                    break
                time.sleep(0.05)
            else:
                self.fail('el proceso descendiente siguió vivo')

    def test_output_is_bounded_while_running(self):
        started = time.monotonic()
        code, text = compilador.ejecutar(['yes', 'SALIDA'], Path('/tmp'), 15)   # nunca termina por sí solo
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(code, -9)
        self.assertLessEqual(len(text.encode()), compilador.MAX_SALIDA + 200)
        self.assertIn('salida recortada', text)
        code, text = compilador.ejecutar(['head', '-c', '200000', '/dev/zero'], Path('/tmp'), 5)
        self.assertEqual(code, 0)
        self.assertIn('salida recortada: 134464 bytes omitidos', text)


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
