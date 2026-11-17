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



def evaluate_lesson(module, fn, duration, watch, names):
    """Graba la traza de cada HEX con la misma función que usa el Worker y la evalúa (lecciones 2 y 3).
    Un proceso de Node por HEX, en paralelo: el semáforo simula 17 s por programa."""
    def script(name):
        return f"""
import {{ readFileSync }} from 'node:fs';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
import * as M from './games/laboratorio-arduino/src/lessons/{module}';
const t0 = performance.now();
const r = M.{fn}(recordFast(readFileSync('{FIX}/{name}.hex', 'utf8'), M.{duration}, {json.dumps(watch)}));
console.log(JSON.stringify({{ passed: r.passed, checks: Object.fromEntries(r.checks.map((c) => [c.id, c.ok])), details: r.checks.map((c) => c.detail), ms: performance.now() - t0 }}));
"""
    procs = {n: subprocess.Popen(['node', '--input-type=module', '-e', script(n)], cwd=ROOT, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True) for n in names}
    results = {}
    for name, proc in procs.items():
        out, err = proc.communicate(timeout=180)
        if proc.returncode:
            raise AssertionError(f'{name}: {err}')
        results[name] = json.loads(out)
    return results


class LessonTwoThreeTests(unittest.TestCase):
    """Semáforo y PWM: HEX reales compilados con el servicio (fuentes .ino al lado)."""

    def test_semaforo_solutions_pass_and_failures_explain(self):
        r = evaluate_lesson('semaforo-eval.js', 'evaluateSemaforo', 'EVAL_DURATION_MS', [2, 3, 4], [
            'semaforo-solucion', 'semaforo-millis', 'semaforo-solape', 'semaforo-orden', 'semaforo-tiempos',
            'semaforo-sin-serial', 'semaforo-mensaje-tarde', 'semaforo-ejemplo', 'semaforo-ej-prueba-leds',
            'semaforo-ej-mensaje-al-cambiar'])
        self.assertTrue(r['semaforo-solucion']['passed'], r['semaforo-solucion'])
        self.assertTrue(r['semaforo-millis']['passed'], r['semaforo-millis'])   # sin delay(), con otro texto
        expected_fail = {'semaforo-solape': 'solape', 'semaforo-orden': 'orden', 'semaforo-tiempos': 'tiempos',
                         'semaforo-sin-serial': 'baud', 'semaforo-mensaje-tarde': 'serial'}
        for name, check in expected_fail.items():
            self.assertFalse(r[name]['passed'], name)
            self.assertFalse(r[name]['checks'][check], name)
        self.assertEqual(r['semaforo-mensaje-tarde']['checks'], {'orden': True, 'tiempos': True, 'solape': True, 'baud': True, 'serial': False})
        self.assertEqual(r['semaforo-orden']['checks']['serial'], True)
        # Ni el código inicial ni los ejemplos de la lección aprueban.
        for name in ('semaforo-ejemplo', 'semaforo-ej-prueba-leds', 'semaforo-ej-mensaje-al-cambiar'):
            self.assertFalse(r[name]['passed'], name)

    def test_pwm_solutions_pass_and_failures_explain(self):
        r = evaluate_lesson('pwm-eval.js', 'evaluatePwm', 'EVAL_DURATION_MS', [9], [
            'pwm-solucion', 'pwm-millis', 'pwm-pin-sin-pwm', 'pwm-otro-pin', 'pwm-escalones', 'pwm-lento',
            'pwm-sin-extremos', 'pwm-digital', 'pwm-ejemplo', 'pwm-ej-niveles', 'pwm-ej-pin-sin-pwm', 'pwm-ej-subida'])
        self.assertTrue(r['pwm-solucion']['passed'], r['pwm-solucion'])
        self.assertTrue(r['pwm-millis']['passed'], r['pwm-millis'])   # escribe por serie: no es requisito ni estorba
        self.assertEqual(r['pwm-escalones']['checks'], {'pwm': True, 'rango': True, 'ciclos': True, 'suave': False})
        self.assertEqual(r['pwm-lento']['checks'], {'pwm': True, 'rango': True, 'ciclos': False, 'suave': True})
        self.assertFalse(r['pwm-sin-extremos']['checks']['rango'])
        self.assertFalse(r['pwm-digital']['checks']['pwm'])            # PWM a mano a ~100 Hz
        self.assertIn('100 Hz', r['pwm-digital']['details'][0])
        self.assertIn('D8 no tiene PWM', r['pwm-pin-sin-pwm']['details'][0])
        self.assertIn('Hay PWM en D10', r['pwm-otro-pin']['details'][0])
        for name in ('pwm-ejemplo', 'pwm-ej-niveles', 'pwm-ej-pin-sin-pwm', 'pwm-ej-subida'):
            self.assertFalse(r[name]['passed'], name)
        # Rendimiento, medido aparte (sin otros procesos en paralelo): 6 s simulados en pocos segundos.
        alone = evaluate_lesson('pwm-eval.js', 'evaluatePwm', 'EVAL_DURATION_MS', [9], ['pwm-solucion'])
        self.assertLess(alone['pwm-solucion']['ms'], 8000)

    def test_pwm_measurement_by_windows(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
import {{ isPwmWindow }} from './games/laboratorio-arduino/src/pwm.js';
const trace = recordFast(readFileSync('{FIX}/pwm-niveles.hex', 'utf8'), 1400, [9]);
const values = [0, 1, 64, 128, 191, 254, 255];
for (const pin of [9, 3, 5]) {{
  values.forEach((v, i) => {{
    const ws = trace.windows.filter((w) => w.pin === pin && w.t0 >= i * 200 + 40 && w.t1 <= i * 200 + 180);
    if (pin !== 9 && v === 0) {{ assert.equal(ws.length, 0); return; }}   // sin actividad no se registra
    assert.ok(ws.length >= 6, `D${{pin}} valor ${{v}}`);
    for (const w of ws) {{
      assert.ok(Math.abs(w.duty * 100 - v / 2.55) <= 2, `D${{pin}} ${{v}}: ${{w.duty}}`);
      if (v === 0 || v === 255) {{ assert.equal(w.freq, null); assert.equal(isPwmWindow(w), false); }}
      else {{
        const f = pin === 5 ? 976.6 : 490.2;
        assert.ok(Math.abs(w.freq - f) < 5, `D${{pin}} ${{v}}: ${{w.freq}} Hz`);
        assert.equal(isPwmWindow(w), true);
      }}
    }}
  }});
}}
// Las ventanas cubren el tiempo sin huecos y el pin vigilado aparece en todas.
const d9 = trace.windows.filter((w) => w.pin === 9);
assert.equal(d9.length, 70);
d9.forEach((w, k) => {{ if (k) assert.equal(w.t0, d9[k - 1].t1); }});
// Un PWM a ~1 kHz no agota la traza: los flancos de ese pin se limitan y quedan medidos por ventanas.
assert.ok(trace.pins.length < 20000);
assert.ok(trace.truncatedPins.includes(5));
""")

    def test_lesson_one_unchanged_through_new_trace(self):
        """Regresión: la lección 1 evaluada con la traza del Worker da lo mismo que antes."""
        out = node(f"""
import {{ readFileSync }} from 'node:fs';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
import lesson from './games/laboratorio-arduino/src/lessons/led-serie.js';
const res = {{}};
for (const name of ['solucion', 'ejemplo', 'ritmo-incorrecto', 'sin-serial', 'baudios-115200', 'mensajes-al-inicio', 'latido-desfasado']) {{
  const r = lesson.evaluation.evaluate(recordFast(readFileSync('{FIX}/' + name + '.hex', 'utf8'), lesson.evaluation.durationMs, lesson.pins));
  res[name] = Object.fromEntries(r.checks.map((c) => [c.id, c.ok]));
}}
console.log(JSON.stringify(res));
""")
        r = json.loads(out)
        self.assertTrue(all(r['solucion'].values()))
        self.assertEqual(r['ejemplo'], {'blink': False, 'on': False, 'off': False, 'baud': True, 'serial': False})
        self.assertFalse(r['ritmo-incorrecto']['on'])
        self.assertFalse(r['sin-serial']['baud'] or r['sin-serial']['serial'])
        self.assertFalse(r['baudios-115200']['baud'])
        for name in ('mensajes-al-inicio', 'latido-desfasado'):
            self.assertFalse(r[name]['serial'], name)

    def test_manifest_matches_api_and_url_resolution(self):
        import ast
        tree = ast.parse((ROOT / 'services/aula-api/app/main.py').read_text())
        api = next(ast.literal_eval(n.value) for n in tree.body
                   if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'LECCIONES')
        out = node("""
import assert from 'node:assert/strict';
import { MANIFEST, LESSONS, DEFAULT_LESSON_ID, ID_PATTERN, resolveLesson } from './games/laboratorio-arduino/src/lessons/index.js';
assert.equal(resolveLesson('').lesson.id, 'arduino-led-serie');
assert.equal(resolveLesson('?leccion=').lesson.id, 'arduino-led-serie');
assert.equal(resolveLesson('?leccion=arduino-pwm-brillo').lesson.id, 'arduino-pwm-brillo');
for (const bad of ['?leccion=no-existe', '?leccion=ARDUINO-PWM-BRILLO', '?leccion=arduino-pwm-brillo%20', '?leccion=__proto__']) {
  const r = resolveLesson(bad);
  assert.equal(r.lesson, null, bad);
  assert.ok(r.requested);
}
assert.deepEqual(MANIFEST.map((m) => m.numero), [1, 2, 3, 4, 5, 6]);
assert.equal(resolveLesson('?leccion=arduino-potenciometro-pwm').lesson.id, 'arduino-potenciometro-pwm');
assert.equal(resolveLesson('?leccion=arduino-boton-flanco').lesson.id, 'arduino-boton-flanco');
for (const l of LESSONS) {
  assert.match(l.id, ID_PATTERN);
  assert.ok(l.steps.length >= 4 && l.challenge.criteria.length >= 4 && l.evaluation.durationMs > 0, l.id);
  for (const p of l.previas) assert.ok(MANIFEST.some((m) => m.id === p), p);
}
console.log(JSON.stringify({ ids: MANIFEST.map((m) => m.id), def: DEFAULT_LESSON_ID }));
""")
        data = json.loads(out)
        self.assertEqual(data['def'], 'arduino-led-serie')
        self.assertEqual(sorted(data['ids']), sorted(api))
        self.assertEqual(set(api.values()), {'course-arduino'})
        self.assertEqual(data['ids'], ['arduino-led-serie', 'arduino-protoboard-semaforo', 'arduino-pwm-brillo',
                                       'arduino-boton-entrada', 'arduino-boton-flanco', 'arduino-potenciometro-pwm'])

    def test_examples_match_fixtures_and_hints_do_not_solve(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
const fx = (n) => readFileSync('{FIX}/' + n + '.ino', 'utf8');
const S = await import('./games/laboratorio-arduino/src/lessons/semaforo.js');
const P = await import('./games/laboratorio-arduino/src/lessons/pwm-brillo.js');
// Los fixtures compilados son exactamente el código inicial y los ejemplos de cada lección.
assert.equal(fx('semaforo-ejemplo'), S.EXAMPLE_CODE);
for (const [k, e] of Object.entries(S.EXAMPLES)) assert.equal(fx('semaforo-ej-' + k), e.code);
assert.equal(fx('pwm-ejemplo'), P.EXAMPLE_CODE);
for (const [k, e] of Object.entries(P.EXAMPLES)) assert.equal(fx('pwm-ej-' + k), e.code);
// Pistas: temas según el código y la última evaluación.
assert.equal(S.chooseTopic({{ code: S.EXAMPLE_CODE, untouched: true, step: 1 }}).topic, 'paso-1');
assert.equal(S.analyzeCode(S.EXAMPLE_CODE).topic, 'mensajes');
assert.equal(S.analyzeCode(fx('semaforo-solucion')).topic, 'comprobar');
assert.equal(S.analyzeCode(fx('semaforo-sin-serial')).topic, 'baud');
assert.equal(S.chooseTopic({{ code: fx('semaforo-solape'), lastChecks: [{{ id: 'tiempos', ok: true }}, {{ id: 'solape', ok: false }}] }}).topic, 'solape');
assert.equal(S.chooseTopic({{ code: fx('semaforo-mensaje-tarde'), lastChecks: [{{ id: 'serial', ok: false }}] }}).topic, 'momento');
assert.equal(P.analyzeCode('void setup(){{}}\\nvoid loop(){{ digitalWrite(9, HIGH); }}').topic, 'analogwrite');
assert.equal(P.analyzeCode(fx('pwm-pin-sin-pwm')).topic, 'pin');
assert.equal(P.analyzeCode(P.EXAMPLE_CODE).topic, 'bucle');
assert.equal(P.analyzeCode(fx('pwm-solucion')).topic, 'comprobar');
assert.equal(P.chooseTopic({{ code: fx('pwm-lento'), lastChecks: [{{ id: 'pwm', ok: true }}, {{ id: 'rango', ok: true }}, {{ id: 'ciclos', ok: false }}] }}).topic, 'ritmo');
assert.equal(P.chooseTopic({{ code: fx('pwm-solucion'), completed: true }}).topic, 'superado');
// Ninguna pista contiene código completo de una solución.
for (const [M, bad] of [[S, /delay\\(3000\\)[\\s\\S]*delay\\(1000\\)/], [P, /for\\s*\\([\\s\\S]*analogWrite[\\s\\S]*for\\s*\\(/]])
  for (const t of M.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(M.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, bad);
// El monitor serie no es requisito del reto de PWM; sí lo es en el semáforo.
assert.ok(!P.CHALLENGE.criteria.some((c) => /serie|baudios/i.test(c)));
assert.ok(S.CHALLENGE.criteria.some((c) => /9600 baudios/.test(c)));
""")


def evaluate_button(module, names):
    """Graba la traza de cada HEX con el guion de pulsaciones de la lección (el mismo del Worker) y la evalúa."""
    def script(name):
        return f"""
import {{ readFileSync }} from 'node:fs';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
const L = (await import('./games/laboratorio-arduino/src/lessons/{module}')).default;
const t0 = performance.now();
const tr = recordFast(readFileSync('{FIX}/{name}.hex', 'utf8'), L.evaluation.durationMs, L.pins, L.evaluation.stimulus);
const r = L.evaluation.evaluate(tr);
console.log(JSON.stringify({{ passed: r.passed, checks: Object.fromEntries(r.checks.map((c) => [c.id, c.ok])),
  details: Object.fromEntries(r.checks.map((c) => [c.id, c.detail])), ms: performance.now() - t0 }}));
"""
    procs = {n: subprocess.Popen(['node', '--input-type=module', '-e', script(n)], cwd=ROOT, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True) for n in names}
    results = {}
    for name, proc in procs.items():
        out, err = proc.communicate(timeout=180)
        if proc.returncode:
            raise AssertionError(f'{name}: {err}')
        results[name] = json.loads(out)
    return results


class ButtonLessonTests(unittest.TestCase):
    """Lecciones 4 y 5 (2.2 y 2.3 de la ruta): HEX reales con el guion de pulsaciones aplicado al modelo eléctrico."""

    def test_input_model_pullup_floating_and_cycle_precision(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ ButtonModel, buildScript, bounceBurst, rng }} from './games/laboratorio-arduino/src/button.js';
const run = (name, script, ms) => {{
  const edges = [], modes = [];
  const r = new NanoRunner(readFileSync('{FIX}/' + name + '.hex', 'utf8'), {{ onPin: (p, h, t) => {{ if (p === 13) edges.push({{ t, h }}); }} }});
  const b = new ButtonModel(r, {{ pin: 2, seed: 5, onMode: (m, t) => modes.push(m) }});
  b.play(script);
  r.runFor(ms);
  return {{ edges, modes, b }};
}};
// Con INPUT_PULLUP el LED sigue al contacto en microsegundos: el guion se aplica entre instrucciones.
const ok = run('boton-solucion', buildScript([{{ down: 100.25, up: 180.5 }}]).events, 300);
assert.deepEqual(ok.modes, ['input', 'pullup']);
assert.equal(ok.edges.length, 2);
assert.ok(ok.edges[0].h && ok.edges[0].t - 100.25 < 0.05 && ok.edges[0].t >= 100.25, ok.edges[0].t);
assert.ok(!ok.edges[1].h && ok.edges[1].t - 180.5 < 0.05 && ok.edges[1].t >= 180.5, ok.edges[1].t);
// Sin pull-up el pin flota: el LED cambia solo, sin tocar el botón; pulsado, D2 queda fijo en LOW.
const fl = run('boton-sin-pullup', buildScript([{{ down: 200, up: 300 }}]).events, 400);
assert.deepEqual(fl.modes, ['input']);
assert.ok(fl.edges.filter((e) => e.t < 200).length > 20);
assert.equal(fl.edges.filter((e) => e.t > 201 && e.t < 300).length, 0);
// Mismo HEX + mismo guion + misma semilla → misma traza (reproducible).
const again = run('boton-sin-pullup', buildScript([{{ down: 200, up: 300 }}]).events, 400);
assert.deepEqual(again.edges, fl.edges);
// Guion con rebotes: determinista y dentro de los límites de la ruta (3–8 rebotes de 0,2–2 ms).
const a = buildScript([{{ down: 10, up: 90 }}], {{ bounce: true, seed: 9 }});
assert.deepEqual(a, buildScript([{{ down: 10, up: 90 }}], {{ bounce: true, seed: 9 }}));
for (let s = 1; s < 200; s++) {{
  const burst = bounceBurst(0, true, rng(s));
  assert.ok(burst.bounces >= 3 && burst.bounces <= 8);
  assert.equal(burst.events.length, 1 + 2 * burst.bounces);
  burst.events.slice(1).forEach((e, k) => {{ const d = e.t - burst.events[k].t; assert.ok(d >= 0.2 && d <= 2, d); }});
  assert.equal(burst.events.at(-1).closed, true);
}}
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_entrada_solutions_pass_and_failures_explain(self):
        r = evaluate_button('boton-entrada.js', [
            'boton-solucion', 'boton-solucion-bool', 'boton-sin-pullup', 'boton-invertido', 'boton-repite',
            'boton-lento', 'boton-sin-actualizar', 'boton-ejemplo', 'boton-ej-flotante', 'boton-ej-recordar-anterior'])
        for name in ('boton-solucion', 'boton-solucion-bool'):
            self.assertTrue(r[name]['passed'], r[name])
        self.assertEqual(r['boton-sin-pullup']['checks']['entrada'], False)
        self.assertIn('INPUT_PULLUP', r['boton-sin-pullup']['details']['entrada'])
        self.assertIn('cientos de veces', r['boton-sin-pullup']['details']['led'])
        self.assertEqual(r['boton-invertido']['checks'], {'entrada': True, 'led': False, 'baud': True, 'mensajes': True})
        self.assertIn('lógica es invertida', r['boton-invertido']['details']['led'])
        self.assertEqual(r['boton-lento']['checks']['led'], False)
        self.assertIn('tardó', r['boton-lento']['details']['led'])
        self.assertFalse(r['boton-repite']['checks']['mensajes'])
        self.assertEqual(r['boton-sin-actualizar']['checks'], {'entrada': True, 'led': True, 'baud': True, 'mensajes': False})
        for name in ('boton-ejemplo', 'boton-ej-flotante', 'boton-ej-recordar-anterior'):
            self.assertFalse(r[name]['passed'], name)
        alone = evaluate_button('boton-entrada.js', ['boton-solucion'])
        self.assertLess(alone['boton-solucion']['ms'], 8000)

    def test_flanco_solutions_pass_and_failures_explain(self):
        r = evaluate_button('boton-flanco.js', [
            'flanco-solucion', 'flanco-solucion-50', 'flanco-bloqueo', 'flanco-delay', 'flanco-sin-antirrebote',
            'flanco-al-soltar', 'flanco-lento', 'flanco-sin-pullup', 'flanco-sin-led', 'flanco-ejemplo',
            'flanco-ej-millis-sin-bloquear', 'flanco-ej-duracion'])
        for name in ('flanco-solucion', 'flanco-solucion-50', 'flanco-bloqueo', 'flanco-delay'):
            self.assertTrue(r[name]['passed'], r[name])
        self.assertFalse(r['flanco-sin-antirrebote']['checks']['cuenta'])
        self.assertIn('rebotes', r['flanco-sin-antirrebote']['details']['cuenta'])
        self.assertFalse(r['flanco-sin-antirrebote']['checks']['led'])
        self.assertEqual(r['flanco-al-soltar']['checks'], {'entrada': True, 'cuenta': True, 'led': True, 'respuesta': False, 'baud': True})
        self.assertIn('al soltar', r['flanco-al-soltar']['details']['respuesta'])
        self.assertFalse(r['flanco-lento']['checks']['cuenta'])     # la pulsación de 120 ms se pierde
        self.assertFalse(r['flanco-sin-pullup']['checks']['entrada'])
        self.assertEqual(r['flanco-sin-led']['checks']['cuenta'], True)
        self.assertEqual(r['flanco-sin-led']['checks']['led'], False)
        for name in ('flanco-ejemplo', 'flanco-ej-millis-sin-bloquear', 'flanco-ej-duracion'):
            self.assertFalse(r[name]['passed'], name)

    def test_button_evaluators_use_only_the_measured_trace(self):
        """Trazas sintéticas: la decisión depende de lo medido (pulsador, D13, serie), nunca del código."""
        node("""
import assert from 'node:assert/strict';
import { evaluateEntrada, evaluateFlanco, ENTRADA, FLANCO } from './games/laboratorio-arduino/src/lessons/boton-eval.js';
const line = (text, t) => [...text + '\\r\\n'].map((c, k) => ({ byte: c.charCodeAt(0), t: t + k, baud: 9615 }));
const input = { pin: 2, contact: [], modes: [{ t: 0, mode: 'input' }, { t: 0.02, mode: 'pullup' }] };
const changes = ENTRADA.presses.flatMap((p) => [[p.down, true], [p.up, false]]);
const ideal = (delay) => ({ durationMs: ENTRADA.durationMs, input,
  pins: changes.map(([t, h]) => ({ pin: 13, high: h, t: t + delay })),
  serial: changes.flatMap(([t, h]) => line(h ? 'Pulsado' : 'Suelto', t + delay + 1)) });
assert.equal(evaluateEntrada(ideal(1)).passed, true);
assert.equal(evaluateEntrada(ideal(29)).passed, true);
assert.equal(evaluateEntrada(ideal(31)).checks.find((c) => c.id === 'led').ok, false);
assert.equal(evaluateEntrada({ ...ideal(1), input: { ...input, modes: [{ t: 0, mode: 'input' }] } }).passed, false);
const repeated = ideal(1); repeated.serial.push(...line('Suelto', 4700));
assert.equal(evaluateEntrada(repeated).checks.find((c) => c.id === 'mensajes').ok, false);
const P = FLANCO.presses;
const flanco = (offset) => ({ durationMs: FLANCO.durationMs, input,
  pins: P.map((p, k) => ({ pin: 13, high: k % 2 === 0, t: p.stableDown + offset })),
  serial: P.flatMap((p, k) => line('Pulsaciones: ' + (k + 1), p.stableDown + offset)) });
assert.equal(evaluateFlanco(flanco(60)).passed, true);
assert.equal(evaluateFlanco(flanco(61)).checks.find((c) => c.id === 'respuesta').ok, false);
// Sin rastro de ejecución (traza vacía) nunca se aprueba.
assert.equal(evaluateEntrada({ durationMs: 5000, pins: [], serial: [] }).passed, false);
assert.equal(evaluateFlanco({ durationMs: 5500, pins: [], serial: [] }).passed, false);
""")

    def test_button_examples_match_fixtures_and_hints_do_not_solve(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
const fx = (n) => readFileSync('{FIX}/' + n + '.ino', 'utf8');
const E = await import('./games/laboratorio-arduino/src/lessons/boton-entrada.js');
const F = await import('./games/laboratorio-arduino/src/lessons/boton-flanco.js');
assert.equal(fx('boton-ejemplo'), E.EXAMPLE_CODE);
for (const [k, e] of Object.entries(E.EXAMPLES)) assert.equal(fx('boton-ej-' + k), e.code);
assert.equal(fx('flanco-ejemplo'), F.EXAMPLE_CODE);
for (const [k, e] of Object.entries(F.EXAMPLES)) assert.equal(fx('flanco-ej-' + k), e.code);
assert.equal(E.chooseTopic({{ code: E.EXAMPLE_CODE, untouched: true, step: 1 }}).topic, 'paso-1');
assert.equal(E.analyzeCode(fx('boton-sin-pullup')).topic, 'pullup');
assert.equal(E.analyzeCode(E.EXAMPLE_CODE).topic, 'retardo');
assert.equal(E.analyzeCode(fx('boton-solucion')).topic, 'comprobar');
assert.equal(E.chooseTopic({{ code: fx('boton-invertido'), lastChecks: [{{ id: 'entrada', ok: true }}, {{ id: 'led', ok: false, detail: 'Con el botón suelto' }}] }}).topic, 'invertida');
assert.equal(E.chooseTopic({{ code: fx('boton-solucion'), completed: true }}).topic, 'superado');
assert.equal(F.analyzeCode(F.EXAMPLE_CODE).topic, 'texto');
assert.equal(F.analyzeCode(fx('flanco-sin-antirrebote')).topic, 'antirrebote');
assert.equal(F.analyzeCode(fx('flanco-solucion')).topic, 'comprobar');
assert.equal(F.chooseTopic({{ code: fx('flanco-al-soltar'), lastChecks: [{{ id: 'respuesta', ok: false, detail: 'reaccionó al soltar' }}] }}).topic, 'soltar');
assert.equal(F.chooseTopic({{ code: fx('flanco-lento'), lastChecks: [{{ id: 'cuenta', ok: false, detail: 'Alguna pulsación no se detectó' }}] }}).topic, 'lento');
// Ninguna pista ni ejemplo contiene el antirrebote completo (estado aceptado + espera + cuenta).
const solved = /millis\\(\\)[\\s\\S]*Pulsaciones/;
for (const t of F.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(F.hintText(t, i, {{ errorHelp: '' }}).text, solved);
for (const ex of Object.values(F.EXAMPLES)) assert.ok(!/Pulsaciones/.test(ex.code));
for (const t of E.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(E.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, /"Pulsado"[\\s\\S]*"Suelto"/);
for (const ex of Object.values(E.EXAMPLES)) assert.ok(!/Pulsado|Suelto/.test(ex.code));
// La evaluación declara su guion: siempre el mismo y aplicado con el modelo, nunca el texto del programa.
for (const L of [E.default, F.default]) {{
  assert.ok(L.evaluation.stimulus.script.length >= 10 && L.button.pin === 2);
  assert.deepEqual(L.pins, [13]);
}}
assert.equal(E.default.evaluation.stimulus.script.length, 10);
assert.ok(F.default.evaluation.stimulus.script.length > 12 * 7);
""")


class PotLessonTests(unittest.TestCase):
    """Lección 6 (2.4 de la ruta): ADC real de avr8js y PWM de D9 medido, con HEX compilados de verdad."""

    def test_bundle_exports_adc_with_same_version_and_license(self):
        vendor = ROOT / 'games/laboratorio-arduino/vendor'
        text = (vendor / 'avr8js-0.21.1.js').read_text()
        self.assertTrue(text.startswith('/*! avr8js 0.21.1 · MIT License'))
        for name in ('AVRADC', 'adcConfig', 'CPU', 'AVRTimer', 'AVRUSART', 'AVRIOPort', 'PinState'):
            self.assertRegex(text, r'export\{[^}]*\b as %s\b' % name)
        self.assertIn('Permission is hereby granted', (vendor / 'LICENSE-avr8js.txt').read_text())

    def test_adc_extremes_intermediates_and_pwm_follow(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ PwmMeter }} from './games/laboratorio-arduino/src/pwm.js';
import {{ adcValue }} from './games/laboratorio-arduino/src/pot.js';
// El programa compilado (pot-solucion) lee A0 con analogRead: lo que imprime es lo que convirtió el ADC emulado.
const volts = [0, 0.004, 0.005, 0.6, 1.25, 2.5, 3.3, 3.75, 4.995, 5, 7, -1];
const meter = new PwmMeter({{ watch: [9] }});
const lines = []; let text = '';
const adc = [];
const r = new NanoRunner(readFileSync('{FIX}/pot-solucion.hex', 'utf8'), {{
  onPin: (p, h, t) => meter.edge(p, h, t),
  onSerial: (b) => {{ if (b === 10) {{ lines.push(text.trim()); text = ''; }} else text += String.fromCharCode(b); }},
  onAdc: (ch, v, t) => adc.push({{ ch, v }}) }});
const res = [];
for (const v of volts) {{
  r.setAnalog(0, v);
  r.runFor(260);
  meter.close(r.timeMs);
  const start = r.timeMs; r.runFor(100);
  const w = meter.close(r.timeMs).find((x) => x.pin === 9);
  res.push({{ v, line: lines.at(-1), last: adc.at(-1).v, duty: w.duty, freq: w.freq }});
}}
const expected = [0, 0, 1, 122, 256, 512, 675, 768, 1022, 1023, 1023, 0];
res.forEach((x, k) => {{
  assert.equal(x.last, expected[k], `ADC con ${{x.v}} V`);
  assert.equal(x.line, 'Lectura: ' + expected[k], `línea con ${{x.v}} V`);
  assert.equal(adcValue(Math.min(5, Math.max(0, x.v))), expected[k]);
  const want = Math.round(expected[k] * 255 / 1023) / 255;   // map(…, 0, 1023, 0, 255) en enteros
  assert.ok(Math.abs(x.duty - want) <= 0.01, `D9 con ${{x.v}} V: ${{x.duty}} (esperado ${{want}})`);
  if (want > 0.01 && want < 0.99) assert.ok(Math.abs(x.freq - 490.2) < 5, x.freq);
}});
assert.ok(adc.every((a) => a.ch === 0));
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_pot_solutions_pass_and_failures_explain(self):
        r = evaluate_button('potenciometro.js', [
            'pot-solucion', 'pot-solucion-delay', 'pot-sin-escala', 'pot-invertido', 'pot-otro-canal', 'pot-otro-pin',
            'pot-pin-sin-pwm', 'pot-digital', 'pot-ritmo', 'pot-sin-serial', 'pot-voltios', 'pot-lento',
            'pot-ejemplo', 'pot-ej-voltios', 'pot-ej-map'])
        for name in ('pot-solucion', 'pot-solucion-delay'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        self.assertEqual(ok('pot-sin-escala')['lecturas'], True)
        self.assertFalse(ok('pot-sin-escala')['brillo'])
        self.assertIn('0–255', r['pot-sin-escala']['details']['brillo'])
        self.assertIn('invertido', r['pot-invertido']['details']['brillo'])
        self.assertIn('¿lees el canal A0?', r['pot-otro-canal']['details']['lecturas'])
        self.assertIn('nunca leyó A0', r['pot-otro-canal']['details']['pwm'])
        self.assertIn('Hay PWM en D10', r['pot-otro-pin']['details']['pwm'])
        self.assertIn('D8', r['pot-pin-sin-pwm']['details']['pwm'])
        self.assertFalse(ok('pot-digital')['pwm'])
        self.assertEqual(ok('pot-ritmo'), {'pwm': True, 'brillo': True, 'lecturas': True, 'ritmo': False, 'baud': True})
        self.assertFalse(ok('pot-sin-serial')['baud'])
        self.assertEqual(ok('pot-voltios')['lecturas'], False)
        # delay(250): imprime bien y al ritmo, pero el brillo responde tarde a algún cambio del guion.
        self.assertEqual(ok('pot-lento'), {'pwm': True, 'brillo': False, 'lecturas': True, 'ritmo': True, 'baud': True})
        self.assertIn('tarda demasiado', r['pot-lento']['details']['brillo'])
        for name in ('pot-ejemplo', 'pot-ej-voltios', 'pot-ej-map'):
            self.assertFalse(r[name]['passed'], name)
        alone = evaluate_button('potenciometro.js', ['pot-solucion'])
        self.assertLess(alone['pot-solucion']['ms'], 8000)

    def test_pot_evaluator_uses_only_the_measured_trace(self):
        node("""
import assert from 'node:assert/strict';
import { evaluatePot, segments, POT } from './games/laboratorio-arduino/src/lessons/pot-eval.js';
const segs = segments();
assert.deepEqual(segs.map((s) => s.reading), [0, 256, 512, 1023, 256]);
const line = (text, t) => [...text + '\\r\\n'].map((c, k) => ({ byte: c.charCodeAt(0), t: t + k, baud: 9615 }));
const at = (t) => segs.find((s) => t >= s.t && t < s.end);
const ideal = ({ lag = 1, dutyOff = 0, readOff = 0, period = 250 } = {}) => {
  const windows = [];
  for (let t = 0; t < POT.durationMs; t += 20) {
    const s = at(Math.max(0, t - lag)) || segs[0];
    const d = Math.min(1, Math.max(0, s.duty + dutyOff));
    windows.push({ pin: 9, t0: t, t1: t + 20, duty: d, freq: d > 0 && d < 1 ? 490.2 : null, rises: d > 0 && d < 1 ? 10 : 0, level: d >= 1 });
  }
  const serial = [];
  for (let t = 5; t < POT.durationMs; t += period) serial.push(...line('Lectura: ' + (at(t).reading + readOff), t));
  return { durationMs: POT.durationMs, windows, serial, adc: [{ channel: 0, value: 0, t: 1 }] };
};
assert.equal(evaluatePot(ideal()).passed, true);
assert.equal(evaluatePot(ideal({ lag: 90 })).passed, true);                       // dentro de 100 ms
assert.equal(evaluatePot(ideal({ lag: 130 })).checks.find((c) => c.id === 'brillo').ok, false);
assert.equal(evaluatePot(ideal({ dutyOff: 0.035 })).checks.find((c) => c.id === 'brillo').ok, true);
assert.equal(evaluatePot(ideal({ dutyOff: 0.06 })).checks.find((c) => c.id === 'brillo').ok, false);
assert.equal(evaluatePot(ideal({ readOff: 8 })).checks.find((c) => c.id === 'lecturas').ok, true);
assert.equal(evaluatePot(ideal({ readOff: 9 })).checks.find((c) => c.id === 'lecturas').ok, false);
assert.equal(evaluatePot(ideal({ period: 280 })).checks.find((c) => c.id === 'ritmo').ok, false);
assert.equal(evaluatePot({ durationMs: POT.durationMs, windows: [], serial: [], adc: [] }).passed, false);
""")

    def test_pot_examples_match_fixtures_and_hints_do_not_solve(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
const fx = (n) => readFileSync('{FIX}/' + n + '.ino', 'utf8');
const P = await import('./games/laboratorio-arduino/src/lessons/potenciometro.js');
assert.equal(fx('pot-ejemplo'), P.EXAMPLE_CODE);
for (const [k, e] of Object.entries(P.EXAMPLES)) assert.equal(fx('pot-ej-' + k), e.code);
assert.equal(P.chooseTopic({{ code: P.EXAMPLE_CODE, untouched: true, step: 2 }}).topic, 'paso-2');
assert.equal(P.analyzeCode(P.EXAMPLE_CODE).topic, 'analogwrite');
assert.equal(P.analyzeCode(fx('pot-sin-escala')).topic, 'escala');
assert.equal(P.analyzeCode(fx('pot-lento')).topic, 'lento');
assert.equal(P.analyzeCode(fx('pot-solucion')).topic, 'comprobar');
assert.equal(P.chooseTopic({{ code: fx('pot-invertido'), lastChecks: [{{ id: 'pwm', ok: true }}, {{ id: 'brillo', ok: false, detail: 'Parece invertido' }}] }}).topic, 'invertido');
assert.equal(P.chooseTopic({{ code: fx('pot-ritmo'), lastChecks: [{{ id: 'ritmo', ok: false }}] }}).topic, 'ritmo');
assert.equal(P.chooseTopic({{ code: fx('pot-solucion'), completed: true }}).topic, 'superado');
const solved = /analogRead[\\s\\S]*analogWrite[\\s\\S]*millis/;
for (const t of P.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(P.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, solved);
for (const ex of Object.values(P.EXAMPLES)) assert.ok(!/analogWrite/.test(ex.code));
assert.deepEqual(P.default.pins, [9]);
assert.equal(P.default.evaluation.stimulus.potScript.length, 5);
""")


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
const { analyzeCode, chooseTopic, hintText } = await import('./games/laboratorio-arduino/src/guide.js');
const { EXAMPLE_CODE, EXAMPLES, STEPS } = await import('./games/laboratorio-arduino/src/lesson.js');
const fs = await import('node:fs');
const fx = (n) => fs.readFileSync(`tests/fixtures/laboratorio/${n}.ino`, 'utf8');
assert.match(preparedHelp.respond('hint', { topic: 'paso-0', level: 0 }).text, /Pista 1 de 2 sobre el circuito/);
assert.equal(chooseTopic({ code: EXAMPLE_CODE, untouched: true, step: 2 }).topic, 'paso-2');
assert.equal(analyzeCode(EXAMPLE_CODE).topic, 'ritmo');
assert.equal(analyzeCode(fx('solucion')).topic, 'comprobar');
assert.equal(analyzeCode(fx('mensajes-al-inicio')).topic, 'momento');
assert.equal(analyzeCode(fx('sin-serial')).topic, 'baud');
assert.equal(analyzeCode('void setup(){pinMode(13,OUTPUT);Serial.begin(9600);}\\nvoid loop(){int n=0;n++;Serial.print("Latido ");delay(200);delay(800);}').topic, 'alcance');
assert.equal(chooseTopic({ code: fx('latido-desfasado'), lastChecks: [{ id: 'serial', ok: false }] }).topic, 'momento');
assert.equal(chooseTopic({ code: 'x', compileError: { errorLine: 3, errorHelp: 'Falta ;' } }).topic, 'compilar');
assert.equal(chooseTopic({ code: fx('solucion'), completed: true }).topic, 'superado');
assert.ok(hintText('compilar', 0, { errorLine: 3, errorHelp: 'Falta ;' }).text.includes('línea 3'));
// Ninguna pista ni ejemplo entrega la solución (200 ms y 800 ms juntos en delay()).
for (const t of ['paso-0','paso-1','paso-2','paso-3','paso-4','compilar','pinmode','baud','ritmo','texto','contador','alcance','momento','comprobar','superado'])
  for (let i = 0; i < 4; i++) assert.doesNotMatch(hintText(t, i, { delays: [], errorHelp: '' }).text, /delay\\(200\\)[\\s\\S]*delay\\(800\\)/);
for (const ex of Object.values(EXAMPLES)) assert.ok(!(ex.code.includes('delay(200)') && ex.code.includes('delay(800)')));
assert.equal(STEPS.length, 6);
assert.equal(explainDiagnostic("too many initializers for 'int [2]'"), null);
assert.match(explainDiagnostic("'class HardwareSerial' has no member named 'printl'"), /printl.*Serial/);
p.saveSteps('l', 3, [0, 1, 3, 3]);
assert.deepEqual(p.getLesson('l').seen, [0, 1, 3]);
assert.equal(p.getLesson('l').completedAt, undefined);   // recorrer pasos nunca aprueba
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
