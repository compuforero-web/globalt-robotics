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
assert.deepEqual(MANIFEST.map((m) => m.numero), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
for (const id of ['arduino-servo-posiciones', 'arduino-servo-barrido']) assert.equal(resolveLesson('?leccion=' + id).lesson.id, id);
for (const id of ['arduino-l298n-direccion', 'arduino-l298n-velocidad', 'arduino-l298n-dos-motores']) assert.equal(resolveLesson('?leccion=' + id).lesson.id, id);
assert.equal(resolveLesson('?leccion=arduino-ultrasonico-distancia').lesson.id, 'arduino-ultrasonico-distancia');
assert.equal(resolveLesson('?leccion=arduino-ultrasonico-alerta').lesson.id, 'arduino-ultrasonico-alerta');
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
                                       'arduino-boton-entrada', 'arduino-boton-flanco', 'arduino-potenciometro-pwm',
                                       'arduino-ultrasonico-distancia', 'arduino-ultrasonico-alerta',
                                       'arduino-l298n-direccion', 'arduino-l298n-velocidad', 'arduino-l298n-dos-motores',
                                       'arduino-servo-posiciones', 'arduino-servo-barrido', 'arduino-evasor-decision', 'arduino-evasor-pista'])

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


class UltrasonicLessonTests(unittest.TestCase):
    """Lecciones 7 y 8 (4.1 y 4.2 de la ruta): modelo HC-SR04 que responde al TRIG real, con HEX compilados de verdad."""

    def test_echo_follows_real_trig_with_cycle_precision(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ SonarModel, echoUs, ECHO_DELAY_US, NO_ECHO_US, US_PER_CM }} from './games/laboratorio-arduino/src/sonar.js';
assert.ok(Math.abs(US_PER_CM - 58.309) < 0.001);
const hex = readFileSync('{FIX}/ultra-medida-us.hex', 'utf8');
for (const cm of [2, 10, 35, 80, 150, 400, null]) {{
  const r = new NanoRunner(hex);
  const edges = [];   // ciclo exacto en que el modelo cambia el nivel eléctrico de D8
  const set = r.setInput.bind(r);
  r.setInput = (pin, high) => {{ if (pin === 8) edges.push({{ c: r.cpu.cycles, high, pinb: r.cpu.data[0x23] & 1 }}); set(pin, high); }};
  const trig = [];
  const s = new SonarModel(r, {{ cm, onTrigger: (x) => trig.push(x) }});
  let inEcho = 0, sampled = 0;
  // Muestrea el registro PINB (D8 = PB0) mientras corre el programa: lo que lee pulseIn.
  for (let k = 0; k < 2000; k++) {{ r.runFor(0.1); sampled++; if (r.cpu.data[0x23] & 1) inEcho++; }}
  // El modelo reafirma el nivel en cada cambio de puerto: solo cuentan las transiciones.
  const moves = edges.filter((e, i) => i > 0 && e.high !== edges[i - 1].high);
  const ups = moves.filter((e) => e.high), downs = moves.filter((e) => !e.high);
  assert.ok(trig.length >= 2 && trig.every((t) => t.accepted && t.widthUs >= 10), JSON.stringify(trig[0]));
  assert.ok(downs.length === ups.length || downs.length === ups.length - 1);   // puede acabar a mitad de un eco
  downs.forEach((_, i) => {{
    const u = ups[i];
    const fall = trig[i].fall * 16000;
    const start = fall + ECHO_DELAY_US * 16, width = echoUs(cm) * 16;
    assert.ok(u.c - start >= 0 && u.c - start <= 6, `subida ${{cm}}: ${{u.c - start}} ciclos`);
    assert.ok(Math.abs(downs[i].c - u.c - width) <= 6, `ancho ${{cm}}: ${{downs[i].c - u.c - width}} ciclos`);
  }});
  if (cm === null) assert.equal(echoUs(cm), NO_ECHO_US);
  assert.ok(inEcho > 0 && inEcho < sampled);
  // Sigue estando el ECHO impuesto aunque el programa ponga pull-up: no queda flotante ni en HIGH al acabar.
  assert.equal(r.cpu.data[0x23] & 1, s.echoHigh ? 1 : 0);
}}
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_pulsein_accuracy_timeouts_and_no_echo(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ SonarModel, echoUs }} from './games/laboratorio-arduino/src/sonar.js';
// El programa escribe «límite duración espera_µs» para pulseIn sin límite, con 30000 µs y con 5000 µs.
const hex = readFileSync('{FIX}/ultra-medida-us.hex', 'utf8');
const res = {{}};
for (const cm of [2, 10, 35, 80, 150, 300, 400, null]) {{
  let text = ''; const lines = [];
  const r = new NanoRunner(hex, {{ onSerial: (b) => {{ if (b === 10) {{ lines.push(text.trim().split(' ').map(Number)); text = ''; }} else text += String.fromCharCode(b); }} }});
  new SonarModel(r, {{ cm }});
  r.runFor(500);
  res[cm] = lines.slice(0, 3);
  const want = echoUs(cm);
  const [[, dFree, wFree], [, d30, w30], [, d5, w5]] = lines;
  // pulseIn del núcleo mide un poco menos (la interrupción del temporizador 0 detiene su bucle de cuenta): ≤ 1 %.
  assert.ok(dFree <= want + 2 && dFree >= want * 0.99 - 2, `${{cm}} cm: ${{dFree}} frente a ${{want}}`);
  // El límite cuenta desde la llamada: incluye los 450 µs hasta que sube ECHO.
  if (want + 450 < 29900) assert.ok(Math.abs(d30 - dFree) <= 8); else assert.equal(d30, 0);
  if (want + 450 < 4900) assert.ok(Math.abs(d5 - dFree) <= 8); else assert.equal(d5, 0);
  // Tiempos de espera: con límite nunca bloquea más del límite (+ unos µs).
  assert.ok(w30 <= 30000 + 100, w30);
  assert.ok(w5 <= 5000 + 100, w5);
  if (want >= 5000) assert.ok(w5 >= 4700, w5);
  if (cm === null) {{
    assert.ok(wFree > 38000 && wFree < 39000, wFree);      // sin límite: espera al final del pulso de 38 ms
    assert.ok(w30 > 29500, w30);                           // con 30000 µs: devuelve 0 a los ~30 ms
  }}
}}
const cm = (d) => Math.floor(d / 58);
assert.deepEqual([2, 10, 35, 80, 150, 300, 400].map((k) => cm(res[k][0][1])), [2, 9, 34, 79, 149, 299, 399]);
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_invalid_trig_busy_distance_changes_and_reset(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ SonarModel, echoUs, MIN_TRIG_US, normalizeCm }} from './games/laboratorio-arduino/src/sonar.js';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
const fx = (n) => readFileSync('{FIX}/' + n + '.hex', 'utf8');
// TRIG demasiado corto (programa real con delayMicroseconds(3)): se ignora y ECHO nunca sube.
{{
  const r = new NanoRunner(fx('ultra-trig-corto'));
  const trig = [], echo = [];
  const s = new SonarModel(r, {{ cm: 35, onTrigger: (x) => trig.push(x), onEcho: (x) => echo.push(x) }});
  r.runFor(600);
  assert.ok(trig.length >= 4 && trig.every((t) => !t.accepted && t.reason === 'corto' && t.widthUs < MIN_TRIG_US));
  assert.equal(echo.length, 0);
  assert.equal(s.measures, 0);
}}
// TRIG sin pinMode(OUTPUT): solo cambia la resistencia interna, el modelo no ve ningún pulso.
{{
  const r = new NanoRunner(fx('ultra-sin-pinmode'));
  const trig = [];
  new SonarModel(r, {{ cm: 35, onTrigger: (x) => trig.push(x) }});
  r.runFor(400);
  assert.equal(trig.length, 0);
  assert.ok(['input', 'pullup'].includes(r.pinMode(7)));
}}
// Flancos aplicados al modelo (programa que no toca D7): límite de 10 µs exacto, disparo mientras mide y
// cambio de distancia a mitad de la medida (vale la que había al salir la ráfaga; el cambio, para la siguiente).
{{
  const r = new NanoRunner(fx('ultra-fijo'));
  const trig = [], echo = [];
  const s = new SonarModel(r, {{ cm: 80, onTrigger: (x) => trig.push(x), onEcho: (x) => echo.push(x) }});
  const pulse = (us) => {{ s.trigEdge(true); r.runUntilCycle(r.cpu.cycles + us * 16); s.trigEdge(false); }};
  r.runFor(1);
  const c0 = r.cpu.cycles; s.trigEdge(true); r.runUntilCycle(c0 + 150); s.trigEdge(false);   // < 10 µs
  pulse(10);
  r.runFor(1);
  s.setDistance(20);            // ya salió la ráfaga a 80 cm
  pulse(12);                    // llega mientras mide: ignorado
  r.runFor(20);
  pulse(12);
  r.runFor(20);
  assert.deepEqual(trig.map((t) => t.reason), ['corto', null, 'ocupado', null]);
  assert.equal(trig[0].widthUs < 10, true);
  assert.equal(echo.length, 2);
  assert.equal(echo[0].cm, 80); assert.ok(Math.abs(echo[0].t1 - echo[0].t0 - echoUs(80) / 1000) < 0.001);
  assert.equal(echo[1].cm, 20); assert.ok(Math.abs(echo[1].t1 - echo[1].t0 - echoUs(20) / 1000) < 0.001);
  s.setDistance(null); pulse(10); r.runFor(40);
  assert.equal(echo[2].cm, null); assert.ok(Math.abs(echo[2].t1 - echo[2].t0 - 38) < 0.001);
  assert.deepEqual([normalizeCm(1), normalizeCm(401), normalizeCm(''), normalizeCm('35')], [2, null, null, 35]);
}}
// Reinicio: misma traza bit a bit con el mismo programa y guion; una ejecución nueva empieza con ECHO en LOW
// y sin eventos pendientes de la anterior aunque se cortara a mitad de un eco.
{{
  const L = (await import('./games/laboratorio-arduino/src/lessons/ultrasonico-alerta.js')).default;
  const a = recordFast(fx('alerta-solucion'), 2000, L.pins, L.evaluation.stimulus);
  const b = recordFast(fx('alerta-solucion'), 2000, L.pins, L.evaluation.stimulus);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const r1 = new NanoRunner(fx('ultra-solucion'));
  const s1 = new SonarModel(r1, {{ cm: 150 }});
  while (!s1.echoHigh) r1.runFor(0.05);
  const r2 = new NanoRunner(fx('ultra-solucion'));
  const echo2 = [];
  const s2 = new SonarModel(r2, {{ cm: 10, onEcho: (x) => echo2.push(x) }});
  assert.equal(r2.cpu.data[0x23] & 1, 0);
  assert.equal(s2.busy, false);
  r2.runFor(300);
  assert.ok(echo2.length >= 2 && echo2.every((e) => e.cm === 10));
}}
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_distancia_solutions_pass_and_failures_explain(self):
        r = evaluate_button('ultrasonico-distancia.js', [
            'ultra-solucion', 'ultra-solucion-micros', 'ultra-trig-corto', 'ultra-factor', 'ultra-pines-cambiados',
            'ultra-sin-pinmode', 'ultra-lento', 'ultra-baud', 'ultra-microsegundos', 'ultra-sin-espera', 'ultra-fijo',
            'ultra-ejemplo', 'ultra-ej-sonido', 'ultra-ej-disparo'])
        for name in ('ultra-solucion', 'ultra-solucion-micros'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        self.assertIn('necesita al menos 10 µs', d('ultra-trig-corto', 'trig'))
        self.assertIn('Un 0', d('ultra-trig-corto', 'distancia'))
        self.assertEqual(ok('ultra-factor'), {'trig': True, 'formato': True, 'distancia': False, 'ritmo': True, 'baud': True})
        self.assertIn('dividir el tiempo entre 58', d('ultra-factor', 'distancia'))
        self.assertIn('¿están cambiados TRIG y ECHO?', d('ultra-pines-cambiados', 'trig'))
        self.assertIn('pinMode(7, OUTPUT)', d('ultra-sin-pinmode', 'trig'))
        self.assertEqual(ok('ultra-lento'), {'trig': True, 'formato': True, 'distancia': True, 'ritmo': False, 'baud': True})
        self.assertEqual(ok('ultra-baud'), {'trig': True, 'formato': True, 'distancia': True, 'ritmo': True, 'baud': False})
        self.assertIn('microsegundos', d('ultra-microsegundos', 'distancia'))
        self.assertFalse(ok('ultra-sin-espera')['trig'])
        self.assertIn('al menos 60 ms', d('ultra-sin-espera', 'trig'))
        self.assertTrue(ok('ultra-sin-espera')['distancia'])
        self.assertIn('no sigue a ninguna medida', d('ultra-fijo', 'distancia'))
        for name in ('ultra-ejemplo', 'ultra-ej-sonido', 'ultra-ej-disparo'):
            self.assertFalse(r[name]['passed'], name)
        self.assertFalse(ok('ultra-ejemplo')['formato'])
        alone = evaluate_button('ultrasonico-distancia.js', ['ultra-solucion'])
        self.assertLess(alone['ultra-solucion']['ms'], 8000)

    def test_alerta_solutions_pass_and_failures_explain(self):
        r = evaluate_button('ultrasonico-alerta.js', [
            'alerta-solucion', 'alerta-solucion-float', 'alerta-sin-timeout-400', 'alerta-sin-timeout',
            'alerta-cero-encendido', 'alerta-invertido', 'alerta-sin-pwm', 'alerta-lento', 'alerta-siempre-fuera',
            'alerta-espera-larga', 'alerta-otro-pin', 'alerta-ejemplo', 'alerta-ej-umbral', 'alerta-ej-escala'])
        for name in ('alerta-solucion', 'alerta-solucion-float', 'alerta-sin-timeout-400'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        # Sin tiempo máximo y sin tratar los ~38 000 µs: nunca avisa (y el LED queda apagado, que sí es correcto).
        self.assertTrue(ok('alerta-sin-timeout')['brillo'])
        self.assertFalse(ok('alerta-sin-timeout')['fuera'])
        self.assertIn('38 000 µs', d('alerta-sin-timeout', 'fuera'))
        self.assertIn('trata ese 0', d('alerta-cero-encendido', 'brillo'))
        self.assertIn('invertido', d('alerta-invertido', 'brillo'))
        self.assertIn('solo encendido o apagado', d('alerta-sin-pwm', 'pwm'))
        self.assertFalse(ok('alerta-lento')['ciclo'])
        self.assertIn('tarda demasiado', d('alerta-lento', 'brillo'))
        self.assertIn('solo debe salir cuando no hay eco', d('alerta-siempre-fuera', 'fuera'))
        self.assertEqual(ok('alerta-espera-larga'), {'trig': True, 'pwm': True, 'brillo': True, 'fuera': False, 'ciclo': True, 'baud': True})
        self.assertIn('≤ 40 ms', d('alerta-espera-larga', 'fuera'))
        self.assertIn('Hay PWM en D10', d('alerta-otro-pin', 'pwm'))
        for name in ('alerta-ejemplo', 'alerta-ej-umbral', 'alerta-ej-escala'):
            self.assertFalse(r[name]['passed'], name)
        self.assertIn('pulseIn = 0', d('alerta-ejemplo', 'fuera'))
        alone = evaluate_button('ultrasonico-alerta.js', ['alerta-solucion'])
        self.assertLess(alone['alerta-solucion']['ms'], 8000)

    def test_ultra_evaluators_use_only_the_measured_trace(self):
        node("""
import assert from 'node:assert/strict';
import { evaluateDistancia, evaluateAlerta, DIST, ALERTA, segments, alertDuty } from './games/laboratorio-arduino/src/lessons/ultra-eval.js';
import { echoUs } from './games/laboratorio-arduino/src/sonar.js';
const line = (text, t) => [...text + '\\r\\n'].map((c, k) => ({ byte: c.charCodeAt(0), t: t + k, baud: 9615 }));
const sonar = (S, period, width = 12) => {
  const triggers = [], echoes = [];
  for (let t = 1; t < S.durationMs; t += period) {
    const seg = segments(S).find((s) => t >= s.t && t < s.end);
    triggers.push({ rise: t, fall: t + width / 1000, widthUs: width, accepted: width >= 10, reason: width >= 10 ? null : 'corto' });
    if (width >= 10) echoes.push({ t0: t + 0.5, t1: t + 0.5 + echoUs(seg.cm) / 1000, us: echoUs(seg.cm), cm: seg.cm });
  }
  return { triggers, echoes, distances: [] };
};
const dist = ({ period = 120, factor = 1, off = 0, width = 12 } = {}) => {
  const tr = { durationMs: DIST.durationMs, windows: [], serial: [], sonar: sonar(DIST, period, width) };
  for (const e of tr.sonar.echoes) tr.serial.push(...line(`Distancia: ${Math.round(e.cm * factor + off)} cm`, e.t1 + 0.2));
  return tr;
};
const id = (r, c) => r.checks.find((x) => x.id === c).ok;
assert.equal(evaluateDistancia(dist()).passed, true);
assert.equal(evaluateDistancia(dist({ off: 4 })).passed, false);            // 150 cm ± 5,5 sí, 10 cm ± 1,3 no
assert.equal(id(evaluateDistancia(dist({ factor: 1.025 })), 'distancia'), true);
assert.equal(id(evaluateDistancia(dist({ factor: 1.05 })), 'distancia'), false);
assert.equal(id(evaluateDistancia(dist({ period: 59 })), 'trig'), false);
assert.equal(id(evaluateDistancia(dist({ period: 230 })), 'ritmo'), false);
assert.equal(id(evaluateDistancia(dist({ period: 215 })), 'ritmo'), true);
assert.equal(id(evaluateDistancia(dist({ width: 9.9 })), 'trig'), false);
assert.equal(evaluateDistancia({ durationMs: DIST.durationMs, windows: [], serial: [] }).passed, false);
// 4.2: LED ideal según la tabla; sin eco «Fuera de rango» 31 ms después del disparo.
const alerta = ({ lag = 0, off = 0, wait = 31, always = false, period = 100 } = {}) => {
  const tr = { durationMs: ALERTA.durationMs, windows: [], serial: [], sonar: sonar(ALERTA, period) };
  const segs = segments(ALERTA);
  for (let t = 0; t < ALERTA.durationMs; t += 20) {
    const s = segs.find((x) => Math.max(0, t - lag) >= x.t && Math.max(0, t - lag) < x.end);
    const d = Math.min(1, Math.max(0, alertDuty(s.cm) + off));
    tr.windows.push({ pin: 9, t0: t, t1: t + 20, duty: d, freq: d > 0 && d < 1 ? 490.2 : null, rises: d > 0 && d < 1 ? 9 : 0, level: d >= 1 });
  }
  for (const x of tr.sonar.triggers) {
    const s = segs.find((y) => x.rise >= y.t && x.rise < y.end);
    if (s.cm === null || always) tr.serial.push(...line('Fuera de rango', x.fall + wait));
  }
  return tr;
};
assert.equal(evaluateAlerta(alerta()).passed, true);
assert.equal(evaluateAlerta(alerta({ lag: 240 })).passed, true);
assert.equal(id(evaluateAlerta(alerta({ lag: 290 })), 'brillo'), false);
assert.equal(id(evaluateAlerta(alerta({ off: 0.055 })), 'brillo'), true);
assert.equal(id(evaluateAlerta(alerta({ off: 0.07 })), 'brillo'), false);
assert.equal(id(evaluateAlerta(alerta({ wait: 39 })), 'fuera'), true);
assert.equal(id(evaluateAlerta(alerta({ wait: 41 })), 'fuera'), false);
assert.equal(id(evaluateAlerta(alerta({ always: true })), 'fuera'), false);
assert.equal(id(evaluateAlerta(alerta({ period: 299 })), 'ciclo'), true);
assert.equal(id(evaluateAlerta(alerta({ period: 310 })), 'ciclo'), false);
assert.deepEqual([70, 50, 40, 30, 20, 10, 6, null].map((c) => alertDuty(c)), [0, 0, 0.25, 0.5, 0.75, 1, 1, 0]);
assert.equal(evaluateAlerta({ durationMs: ALERTA.durationMs, windows: [], serial: [] }).passed, false);
""")

    def test_ultra_examples_match_fixtures_and_hints_do_not_solve(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
const fx = (n) => readFileSync('{FIX}/' + n + '.ino', 'utf8');
const D = await import('./games/laboratorio-arduino/src/lessons/ultrasonico-distancia.js');
const A = await import('./games/laboratorio-arduino/src/lessons/ultrasonico-alerta.js');
assert.equal(fx('ultra-ejemplo'), D.EXAMPLE_CODE);
for (const [k, e] of Object.entries(D.EXAMPLES)) assert.equal(fx('ultra-ej-' + k), e.code);
assert.equal(fx('alerta-ejemplo'), A.EXAMPLE_CODE);
for (const [k, e] of Object.entries(A.EXAMPLES)) assert.equal(fx('alerta-ej-' + k), e.code);
assert.equal(D.chooseTopic({{ code: D.EXAMPLE_CODE, untouched: true, step: 1 }}).topic, 'paso-1');
assert.equal(D.analyzeCode(D.EXAMPLE_CODE).topic, 'conversion');
assert.equal(D.analyzeCode(fx('ultra-trig-corto')).topic, 'corto');
assert.equal(D.analyzeCode(fx('ultra-lento')).topic, 'ritmo');
assert.equal(D.analyzeCode(fx('ultra-solucion')).topic, 'comprobar');
assert.equal(D.chooseTopic({{ code: fx('ultra-factor'), lastChecks: [{{ id: 'distancia', ok: false, detail: 'Es el doble' }}] }}).topic, 'conversion');
assert.equal(D.chooseTopic({{ code: fx('ultra-sin-espera'), lastChecks: [{{ id: 'trig', ok: false, detail: 'deja al menos 60 ms' }}] }}).topic, 'disparo');
assert.equal(D.chooseTopic({{ code: fx('ultra-solucion'), completed: true }}).topic, 'superado');
assert.equal(A.analyzeCode(A.EXAMPLE_CODE).topic, 'pwm');
assert.equal(A.analyzeCode(fx('alerta-sin-timeout')).topic, 'timeout');
assert.equal(A.analyzeCode(fx('alerta-lento')).topic, 'ciclo');
assert.equal(A.analyzeCode(fx('alerta-solucion')).topic, 'comprobar');
assert.equal(A.chooseTopic({{ code: fx('alerta-cero-encendido'), lastChecks: [{{ id: 'brillo', ok: false, detail: 'Sin eco, pulseIn devuelve 0' }}] }}).topic, 'cero');
assert.equal(A.chooseTopic({{ code: fx('alerta-espera-larga'), lastChecks: [{{ id: 'fuera', ok: false, detail: 'Pon un tiempo máximo a pulseIn' }}] }}).topic, 'timeout');
assert.equal(A.chooseTopic({{ code: fx('alerta-solucion'), completed: true }}).topic, 'superado');
const solvedD = /pulseIn[\\s\\S]*58[\\s\\S]*Distancia|Distancia[\\s\\S]*pulseIn[\\s\\S]*58/;
const solvedA = /pulseIn[\\s\\S]*analogWrite[\\s\\S]*Fuera de rango|analogWrite[\\s\\S]*pulseIn[\\s\\S]*map\\s*\\(/;
for (const t of D.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(D.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, solvedD);
for (const t of A.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(A.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, solvedA);
for (const ex of Object.values(D.EXAMPLES)) assert.ok(!/Distancia/.test(ex.code));
for (const ex of Object.values(A.EXAMPLES)) assert.ok(!/analogWrite|pulseIn/.test(ex.code));
assert.deepEqual(D.default.pins, [7]);
assert.deepEqual(A.default.pins, [9, 7]);
assert.deepEqual(D.default.evaluation.stimulus.sonarScript.map((s) => s.cm), [10, 35, 80, 150]);
assert.deepEqual(A.default.evaluation.stimulus.sonarScript.map((s) => s.cm), [70, 40, 30, 20, 6, null, 30]);
""")


class MotorLessonTests(unittest.TestCase):
    """Lecciones 9–11 (5.1–5.3 de la ruta): modelo L298N + motor que responde a los pines reales, con HEX compilados de verdad."""

    def test_model_pwm_dead_zone_inertia_and_pin_maps(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ MotorModel, PwmInput, MOTOR, PIN_MAPS, bridgeOrder, motorStep, pinMapProblems, STEADY_MS }} from './games/laboratorio-arduino/src/motor.js';
const fx = (n) => readFileSync('{FIX}/' + n + '.hex', 'utf8');
// Tabla del puente H.
assert.deepEqual([[1, 0, 1], [0, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 0]].map(([a, b, e]) => bridgeOrder(!!a, !!b, e)),
  ['adelante', 'atras', 'freno', 'freno', 'libre']);
// Ciclo de trabajo desde flancos: periodo completo; sin flancos 5 ms → nivel; un pulso suelto antiguo no cuenta.
{{
  const p = new PwmInput();
  const C = 16000;   // ciclos por ms
  for (let k = 0; k < 4; k++) {{ p.edge(true, k * 2 * C); p.edge(false, (k * 2 + 0.5) * C); }}
  assert.ok(Math.abs(p.duty(7 * C) - 0.25) < 1e-9);
  assert.equal(p.duty((7 + STEADY_MS + 1) * C), 0);
  p.edge(true, 100 * C);
  assert.equal(p.duty(100.5 * C), 0);       // subida tras una pausa: no mide un periodo falso, mantiene el valor anterior…
  assert.equal(p.duty(106 * C), 1);         // …y sin más flancos durante 5 ms, es un HIGH continuo
}}
// Programa real: ENA a 60, 120 y 255 (1 s cada uno), hacia adelante.
const r = new NanoRunner(fx('vel-niveles'));
const m = new MotorModel(r, {{ channels: PIN_MAPS.velocidad }});
const at = (ms) => {{ r.runUntilCycle(ms * 16000); return m.state()[0]; }};
const s60 = at(950), s120 = at(1950), s255 = at(2950), coast = at(3300);
assert.ok(Math.abs(s60.duty - 60 / 255) < 0.003 && s60.speed === 0 && s60.order === 'adelante', JSON.stringify(s60));
assert.ok(Math.abs(s120.duty - 120 / 255) < 0.003 && Math.abs(s120.speed - (120 / 255 - MOTOR.deadZone) / (1 - MOTOR.deadZone)) < 0.01);
assert.ok(s255.duty === 1 && s255.speed > 0.99);
assert.ok(coast.order === 'libre' && coast.speed > 0.2 && coast.speed < 0.45, JSON.stringify(coast));   // rueda libre: frena despacio
// La mecánica integrada coincide con la solución exacta del primer orden.
let v = 0; for (let t = 0; t < 120; t++) v = motorStep(v, 'adelante', 1, 1);
assert.ok(Math.abs(v - (1 - Math.exp(-1))) < 1e-9);
v = 1; for (let t = 0; t < 40; t++) v = motorStep(v, 'freno', 1, 1);
assert.ok(Math.abs(v - Math.exp(-1)) < 1e-9);
// Mapas: los de las lecciones y el del robot son válidos; el del robot no choca con el HC-SR04 (D7/D8) ni con el servo (D9).
for (const map of Object.values(PIN_MAPS)) assert.deepEqual(pinMapProblems(map), []);
assert.deepEqual(pinMapProblems(PIN_MAPS.robot, {{ 7: 'TRIG', 8: 'ECHO', 9: 'servo' }}), []);
assert.ok(pinMapProblems(PIN_MAPS.dosMotores, {{ 7: 'TRIG', 8: 'ECHO' }}).some((p) => p.includes('D7')));
assert.ok(pinMapProblems([{{ id: 'A', in1: 2, in2: 3, en: 4 }}]).some((p) => p.includes('no tiene PWM')));
assert.ok(pinMapProblems([{{ id: 'A', in1: 0, in2: 3, en: 5 }}]).some((p) => p.includes('monitor serie')));
assert.throws(() => new MotorModel(new NanoRunner(fx('vel-niveles')), {{ channels: [{{ id: 'A', in1: 7, in2: 7, en: 9 }}] }}));
const robotPins = PIN_MAPS.robot.flatMap((c) => [c.in1, c.in2, c.en]);
assert.equal(new Set([...robotPins, 7, 8, 9]).size, 9);
assert.ok(PIN_MAPS.robot.every((c) => [5, 6].includes(c.en)));
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_model_follows_real_pins_modes_and_reversals(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ MotorModel, PIN_MAPS }} from './games/laboratorio-arduino/src/motor.js';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
import {{ maneuvers }} from './games/laboratorio-arduino/src/lessons/motor-eval.js';
const fx = (n) => readFileSync('{FIX}/' + n + '.hex', 'utf8');
const run = (name, channels, ms) => recordFast(fx(name), ms, [], {{ motors: {{ channels }} }});
const kinds = (tr, id) => tr.motor.orders.filter((o) => o.ch === id).map((o) => o.order);
// El mismo programa con IN1/IN2 cableados al revés: el modelo sigue los pines, no el texto.
const ok = run('dir-solucion', PIN_MAPS.direccion, 3100);
const swapped = run('dir-solucion', [{{ id: 'A', name: 'Motor', in1: 8, in2: 7, en: null }}], 3100);
assert.deepEqual(kinds(ok, 'A').slice(0, 4), ['adelante', 'freno', 'atras', 'freno']);
assert.deepEqual(kinds(swapped, 'A').slice(0, 4), ['atras', 'freno', 'adelante', 'freno']);
assert.equal(ok.motor.reversals.length, 0);
// Inversión sin parada: evento con el motor a toda velocidad.
const rev = run('dir-sin-parada', PIN_MAPS.direccion, 2100);
assert.ok(rev.motor.reversals.length >= 1 && Math.abs(rev.motor.reversals[0].speed) > 0.99 && Math.abs(rev.motor.reversals[0].t - 1000) < 2);
// Pin sin configurar: digitalWrite(8, HIGH) sin pinMode solo activa la resistencia interna → sin orden.
{{
  const r = new NanoRunner(fx('dir-sin-pinmode'));
  const m = new MotorModel(r, {{ channels: PIN_MAPS.direccion }});
  r.runFor(2000);
  const st = m.state()[0];
  assert.equal(st.modes.in2, 'pullup');
  assert.equal(st.order, 'freno');
  assert.equal(m.channels[0].everOutput.in2, false);
}}
// Mapa del futuro robot (D2, D4, D10, D11, D5, D6) con un programa que además usa D7 como TRIG.
const robot = run('motor-mapa-robot', PIN_MAPS.robot, 2600);
assert.deepEqual(maneuvers(robot).map((p) => p.kind), ['avanzar', 'derecha', 'parar']);
assert.deepEqual(kinds(robot, 'A').filter((k, i, a) => k !== a[i - 1]), ['libre', 'adelante', 'freno', 'libre']);
assert.ok(robot.windows.some((w) => w.pin === 7 && w.rises > 0));
// Ese mismo programa leído con el mapa de la lección 11: el modelo obedece a lo que hay en esos pines. D7 (pulsos TRIG) y
// D8 (sin configurar) no mueven el canal A; D4 = LOW y D2 = HIGH con ENB (D6) activo mueven el canal B hacia atrás.
const lesson = run('motor-mapa-robot', PIN_MAPS.dosMotores, 2600);
assert.ok(lesson.motor.samples.every((s) => s.v[0] === 0));
assert.ok(Math.min(...lesson.motor.samples.map((s) => s.v[1])) < -0.5);
// Freno frente a rueda libre: la orden es instantánea, la parada del eje no.
const stop = (tr, k, t) => tr.motor.samples.find((s) => s.t >= t && s.v[k] === 0).t - t;
assert.ok(stop(ok, 0, 1000) > 100 && stop(ok, 0, 1000) < 250);
const dos = run('dos-solucion', PIN_MAPS.dosMotores, 4200);
const tParar = dos.motor.orders.filter((o) => o.order === 'libre').pop().t;
assert.ok(stop(dos, 0, tParar) > 800 && stop(dos, 0, tParar) < 1400);
// Determinista: dos ejecuciones dan la misma traza; una nueva no hereda nada de la anterior.
assert.equal(JSON.stringify(run('dos-solucion', PIN_MAPS.dosMotores, 1500)), JSON.stringify(run('dos-solucion', PIN_MAPS.dosMotores, 1500)));
assert.equal(run('vel-niveles', PIN_MAPS.velocidad, 3).motor.samples[0].v[0], 0);
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_direccion_solutions_pass_and_failures_explain(self):
        r = evaluate_button('l298n-direccion.js', [
            'dir-solucion', 'dir-solucion-alta', 'dir-sentido', 'dir-sin-parada', 'dir-parada-corta', 'dir-sin-pinmode',
            'dir-tiempos', 'dir-otros-pines', 'dir-ejemplo', 'dir-ej-tabla', 'dir-ej-funcion'])
        for name in ('dir-solucion', 'dir-solucion-alta'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        self.assertEqual(ok('dir-sentido'), {'salidas': True, 'sentido': False, 'secuencia': False, 'inversion': True, 'motor': True})
        self.assertIn('fue hacia atrás', d('dir-sentido', 'sentido'))
        self.assertFalse(ok('dir-sin-parada')['inversion'])
        self.assertIn('sin pasar por parado', d('dir-sin-parada', 'inversion'))
        self.assertIn('pico de corriente', d('dir-sin-parada', 'inversion'))
        self.assertIn('tras solo 50 ms parado', d('dir-parada-corta', 'inversion'))
        self.assertIn('pinMode(8, OUTPUT)', d('dir-sin-pinmode', 'salidas'))
        self.assertFalse(ok('dir-sin-pinmode')['motor'])
        self.assertEqual(ok('dir-tiempos'), {'salidas': True, 'sentido': True, 'secuencia': False, 'inversion': True, 'motor': True})
        self.assertIn('1499 ms', d('dir-tiempos', 'secuencia'))
        self.assertIn('Hay actividad en D9, D10', d('dir-otros-pines', 'sentido'))
        for name in ('dir-ejemplo', 'dir-ej-tabla', 'dir-ej-funcion'):
            self.assertFalse(r[name]['passed'], name)
        self.assertIn('ms en detenerse', d('dir-solucion', 'motor'))
        self.assertLess(evaluate_button('l298n-direccion.js', ['dir-solucion'])['dir-solucion']['ms'], 8000)

    def test_velocidad_solutions_pass_and_failures_explain(self):
        r = evaluate_button('l298n-velocidad.js', [
            'vel-solucion', 'vel-solucion-millis', 'vel-salto', 'vel-otro-pin', 'vel-digital', 'vel-atras', 'vel-rapida',
            'vel-sin-pinmode', 'vel-freno', 'vel-niveles', 'vel-ejemplo', 'vel-ej-pasos', 'vel-ej-calculo'])
        for name in ('vel-solucion', 'vel-solucion-millis'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        self.assertFalse(ok('vel-salto')['suave'])
        self.assertIn('rampa brusca', d('vel-salto', 'suave'))
        self.assertIn('Hay PWM en D10', d('vel-otro-pin', 'pwm'))
        self.assertIn('deshabilitado', d('vel-otro-pin', 'pwm'))
        self.assertIn('solo estuvo en 0 % o en 100 %', d('vel-digital', 'pwm'))
        self.assertEqual(ok('vel-atras'), {'pwm': True, 'perfil': True, 'suave': True, 'direccion': False, 'motor': False})
        self.assertIn('hacia atrás', d('vel-atras', 'direccion'))
        self.assertEqual(ok('vel-rapida'), {'pwm': True, 'perfil': False, 'suave': True, 'direccion': True, 'motor': True})
        self.assertIn('Llegó al 100 % en 1,0 s', d('vel-rapida', 'perfil'))
        self.assertIn('pinMode(7, OUTPUT)', d('vel-sin-pinmode', 'direccion'))
        self.assertIn('el puente frena', d('vel-freno', 'direccion'))
        self.assertIn('zona muerta', d('vel-solucion', 'motor'))
        for name in ('vel-niveles', 'vel-ejemplo', 'vel-ej-pasos', 'vel-ej-calculo'):
            self.assertFalse(r[name]['passed'], name)
        self.assertIn('estuvo siempre en 0 %', d('vel-ej-pasos', 'pwm'))
        self.assertLess(evaluate_button('l298n-velocidad.js', ['vel-solucion'])['vel-solucion']['ms'], 8000)

    def test_dos_motores_solutions_pass_and_failures_explain(self):
        r = evaluate_button('l298n-dos-motores.js', [
            'dos-solucion', 'dos-pausas', 'dos-izquierda', 'dos-pivote', 'dos-sin-enb', 'dos-zona-muerta', 'dos-pines-cambiados',
            'dos-giro-largo', 'dos-mensaje-tarde', 'dos-sin-mensajes', 'dos-repite', 'dos-ejemplo', 'dos-ej-parametros',
            'dos-ej-motor'])
        for name in ('dos-solucion', 'dos-pausas'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        self.assertIn('Giró a la izquierda', d('dos-izquierda', 'maniobras'))
        self.assertIn('Solo giró un motor', d('dos-pivote', 'maniobras'))
        self.assertIn('ENB (D6) nunca se activó', d('dos-sin-enb', 'salidas'))
        self.assertIn('ENB en 0 %', d('dos-sin-enb', 'maniobras'))
        self.assertEqual(ok('dos-zona-muerta'), {'salidas': True, 'maniobras': True, 'tiempos': True, 'motores': False, 'mensajes': True, 'baud': True})
        self.assertIn('zona muerta', d('dos-zona-muerta', 'motores'))
        self.assertIn('IN3/IN4', d('dos-pines-cambiados', 'maniobras'))
        self.assertEqual(ok('dos-giro-largo'), {'salidas': True, 'maniobras': True, 'tiempos': False, 'motores': True, 'mensajes': True, 'baud': True})
        self.assertEqual(ok('dos-mensaje-tarde'), {'salidas': True, 'maniobras': True, 'tiempos': True, 'motores': True, 'mensajes': False, 'baud': True})
        self.assertIn('llegó a los 0,30 s', d('dos-mensaje-tarde', 'mensajes'))
        self.assertFalse(ok('dos-sin-mensajes')['mensajes'] or ok('dos-sin-mensajes')['baud'])
        self.assertIn('una sola vez', d('dos-repite', 'maniobras'))
        self.assertIn('detenerse por inercia', d('dos-solucion', 'motores'))
        for name in ('dos-ejemplo', 'dos-ej-parametros', 'dos-ej-motor'):
            self.assertFalse(r[name]['passed'], name)
        self.assertLess(evaluate_button('l298n-dos-motores.js', ['dos-solucion'])['dos-solucion']['ms'], 8000)

    def test_motor_evaluators_use_only_the_measured_trace(self):
        node("""
import assert from 'node:assert/strict';
import { evaluateDireccion, evaluateVelocidad, evaluateDosMotores, mergePhases, profileDuty, maneuverOf, VELOCIDAD } from './games/laboratorio-arduino/src/lessons/motor-eval.js';
// Fases: un estado de menos de 20 ms entre dos iguales no corta la fase.
const ph = mergePhases([{ kind: 'a', start: 0, end: 100 }, { kind: 'b', start: 100, end: 105 }, { kind: 'a', start: 105, end: 200 }], 200);
assert.deepEqual(ph.map((p) => [p.kind, p.start, p.end, p.open]), [['a', 0, 200, true]]);
assert.deepEqual([0, 1000, 2000, 2500, 4000, 5500, 7000].map((t) => profileDuty(t)), [0, 0.5, 1, 1, 0.5, 0, 0.5]);
assert.equal(VELOCIDAD.periodMs, 6000);
assert.deepEqual([['adelante', 'adelante'], ['adelante', 'atras'], ['atras', 'adelante'], ['freno', 'libre'], ['adelante', 'freno']].map(([a, b]) => maneuverOf(a, b)),
  ['avanzar', 'derecha', 'izquierda', 'parar', 'solo-izq']);
// Una traza fabricada (sin programa) se evalúa igual: el evaluador solo mira órdenes, velocidades, ventanas y serie.
const orders = [], samples = [];
let t = 0;
for (let c = 0; c < 3; c++) for (const [order, ms] of [['adelante', 1000], ['freno', 500], ['atras', 1000], ['freno', 500]]) { orders.push({ t, ch: 'A', order, duty: 1 }); t += ms; }
for (let s = 0; s < 6600; s += 10) { const o = orders.filter((x) => x.t <= s).pop(); samples.push({ t: s, v: [o.order === 'adelante' ? 1 : o.order === 'atras' ? -1 : 0] }); }
const tr = { durationMs: 6600, windows: [], serial: [], motor: { orders, samples, reversals: [], outputs: [{ id: 'A', in1: true, in2: true, en: true }] } };
assert.equal(evaluateDireccion(tr).passed, true);
assert.equal(evaluateDireccion({ ...tr, motor: { ...tr.motor, outputs: [{ id: 'A', in1: true, in2: false, en: true }] } }).passed, false);
for (const ev of [evaluateDireccion, evaluateVelocidad, evaluateDosMotores]) assert.equal(ev({ durationMs: 5000, windows: [], serial: [] }).passed, false);
""")

    def test_motor_examples_match_fixtures_and_hints_do_not_solve(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
const fx = (n) => readFileSync('{FIX}/' + n + '.ino', 'utf8');
const D = await import('./games/laboratorio-arduino/src/lessons/l298n-direccion.js');
const V = await import('./games/laboratorio-arduino/src/lessons/l298n-velocidad.js');
const M = await import('./games/laboratorio-arduino/src/lessons/l298n-dos-motores.js');
for (const [L, pre] of [[D, 'dir'], [V, 'vel'], [M, 'dos']]) {{
  assert.equal(fx(pre + '-ejemplo'), L.EXAMPLE_CODE);
  for (const [k, e] of Object.entries(L.EXAMPLES)) assert.equal(fx(pre + '-ej-' + k), e.code);
  assert.equal(L.chooseTopic({{ code: L.EXAMPLE_CODE, untouched: true, step: 2 }}).topic, 'paso-2');
  assert.equal(L.chooseTopic({{ compileError: {{ errorLine: 3, errorHelp: 'x' }} }}).topic, 'compilar');
  assert.ok(L.default.html().includes('GND'));
  const pins = L.default.motors.channels.flatMap((c) => [c.in1, c.in2, c.en].filter((p) => p !== null));
  assert.deepEqual([...L.default.pins].sort((a, b) => a - b), [...pins].sort((a, b) => a - b));
  assert.deepEqual(L.default.evaluation.stimulus.motors.channels, L.default.motors.channels);
}}
// Mapas didácticos conservados (docs/INTEGRACION_PINES_ARDUINO.md).
assert.deepEqual(D.default.motors.channels.map(({{ in1, in2, en }}) => [in1, in2, en]), [[7, 8, null]]);
assert.deepEqual(V.default.motors.channels.map(({{ in1, in2, en }}) => [in1, in2, en]), [[7, 8, 9]]);
assert.deepEqual(M.default.motors.channels.map(({{ in1, in2, en }}) => [in1, in2, en]), [[7, 8, 5], [4, 2, 6]]);
// Pistas según el código.
assert.equal(D.analyzeCode(D.EXAMPLE_CODE).topic, 'bucle');
assert.equal(D.analyzeCode(fx('dir-sin-pinmode')).topic, 'pinmode');
assert.equal(D.analyzeCode(fx('dir-solucion')).topic, 'comprobar');
assert.equal(D.chooseTopic({{ code: fx('dir-sin-parada'), lastChecks: [{{ id: 'salidas', ok: true }}, {{ id: 'sentido', ok: true }}, {{ id: 'secuencia', ok: false }}] }}).topic, 'secuencia');
assert.equal(D.chooseTopic({{ code: fx('dir-sentido'), lastChecks: [{{ id: 'sentido', ok: false }}] }}).topic, 'sentido');
assert.equal(D.chooseTopic({{ code: fx('dir-solucion'), completed: true }}).topic, 'superado');
assert.equal(V.analyzeCode(V.EXAMPLE_CODE).topic, 'bucle');
assert.equal(V.analyzeCode('void setup(){{}}\\nvoid loop(){{ digitalWrite(9, HIGH); }}').topic, 'analogwrite');
assert.equal(V.analyzeCode(fx('vel-otro-pin')).topic, 'pin');
assert.equal(V.analyzeCode(fx('vel-sin-pinmode')).topic, 'sentido');
assert.equal(V.analyzeCode(fx('vel-solucion')).topic, 'comprobar');
assert.equal(V.chooseTopic({{ code: fx('vel-salto'), lastChecks: [{{ id: 'pwm', ok: false }}, {{ id: 'suave', ok: false }}] }}).topic, 'bucle');
assert.equal(V.chooseTopic({{ code: fx('vel-solucion'), lastChecks: [{{ id: 'pwm', ok: true }}, {{ id: 'suave', ok: false }}] }}).topic, 'suave');
assert.equal(V.chooseTopic({{ code: fx('vel-rapida'), lastChecks: [{{ id: 'perfil', ok: false }}] }}).topic, 'perfil');
assert.equal(M.analyzeCode(M.EXAMPLE_CODE).topic, 'giro');
assert.equal(M.analyzeCode(fx('dos-sin-mensajes')).topic, 'mensajes');
assert.equal(M.analyzeCode(fx('dos-solucion')).topic, 'comprobar');
assert.equal(M.chooseTopic({{ code: fx('dos-sin-enb'), lastChecks: [{{ id: 'salidas', ok: false, detail: 'ENB (D6) nunca se activó' }}] }}).topic, 'habilitar');
assert.equal(M.chooseTopic({{ code: fx('dos-solucion'), lastChecks: [{{ id: 'salidas', ok: false, detail: 'ENB (D6) nunca se activó' }}] }}).topic, 'habilitar');
assert.equal(M.chooseTopic({{ code: fx('dos-izquierda'), lastChecks: [{{ id: 'salidas', ok: true }}, {{ id: 'maniobras', ok: false, detail: 'Giró a la izquierda' }}] }}).topic, 'maniobras');
assert.equal(M.chooseTopic({{ code: fx('dos-zona-muerta'), lastChecks: [{{ id: 'motores', ok: false }}] }}).topic, 'velocidad');
// Ninguna pista ni ejemplo contiene la solución.
const solved = [/delay\\(1000\\)[\\s\\S]*delay\\(500\\)[\\s\\S]*delay\\(1000\\)/, /for\\s*\\([\\s\\S]*analogWrite[\\s\\S]*for\\s*\\(/, /delay\\(600\\)/];
for (const [L, bad] of [[D, solved[0]], [V, solved[1]], [M, solved[2]]]) {{
  for (const t of L.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(L.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, bad);
  for (const ex of Object.values(L.EXAMPLES)) assert.doesNotMatch(ex.code, bad);
}}
assert.ok(!Object.values(V.EXAMPLES).some((e) => /analogWrite/.test(e.code)));
assert.ok(!Object.values(M.EXAMPLES).some((e) => /derech/i.test(e.code)));
""")


class ServoLessonTests(unittest.TestCase):
    """Lecciones 12–13 (3.1–3.2 de la ruta): modelo SG90 alimentado por los pulsos reales de la librería Servo compilada."""

    def test_model_measures_real_pulses_width_period_and_speed(self):
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ ServoModel, SERVO, pulseToAngle, angleToPulse, servoStep }} from './games/laboratorio-arduino/src/servo.js';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
const fx = (n) => readFileSync('{FIX}/' + n + '.hex', 'utf8');
// Escala de la librería Servo y mecánica a 600 °/s.
assert.deepEqual([544, 1472, 2400, 300, 3000].map((u) => pulseToAngle(u)), [0, 90, 180, 0, 180]);
assert.equal(angleToPulse(90), 1472);
let a = 0, t = 0; while (a < 180) {{ a = servoStep(a, 180, 1); t++; }}
assert.ok(t === 300 || t === 301, String(t));   // 180° a 600 °/s = 300 ms (redondeo de coma flotante)
assert.equal(servoStep(10, 10.2, 1), 10.2);
// Programa real (pos-solucion): pulsos de la librería con precisión de ciclo, cada 20 ms.
const pulses = [];
const r = new NanoRunner(fx('pos-solucion'));
const m = new ServoModel(r, {{ pin: 9, onPulse: (p) => pulses.push(p) }});
const at = (ms) => {{ r.runUntilCycle(ms * 16000); return m.state(); }};
const s0 = at(900), s90 = at(1900), s180 = at(2900);
assert.ok(Math.abs(s0.us - 544) <= 2 && s0.angle === 0 && !s0.moving, JSON.stringify(s0));
assert.ok(Math.abs(s90.us - 1472) <= 2 && Math.abs(s90.angle - 90) < 0.5, JSON.stringify(s90));
assert.ok(Math.abs(s180.us - 2400) <= 2 && Math.abs(s180.angle - 180) < 0.5 && s180.receiving, JSON.stringify(s180));
const periods = pulses.slice(1).map((p) => p.periodMs);
assert.ok(periods.every((x) => Math.abs(x - 20) < 0.01), String(periods.slice(0, 5)));
// El eje llega con la velocidad del modelo: de 90° a 180° tarda ~150 ms tras el primer pulso nuevo.
const tr = recordFast(fx('pos-solucion'), 2400, [9], {{ servo: {{ pin: 9 }} }});
const first180 = tr.servo.pulses.find((p) => p.valid && p.angle > 179);
const reach = tr.servo.samples.find((x) => x.t > first180.t && Math.abs(x.a - first180.angle) < 0.05);
assert.ok(reach.t - first180.t > 140 && reach.t - first180.t < 180, String(reach.t - first180.t));
// Posición por defecto de attach() (1500 µs ≈ 93°): no es ninguna de las del reto.
const def = recordFast(fx('pos-default'), 1000, [9], {{ servo: {{ pin: 9 }} }});
assert.ok(def.servo.pulses.filter((p) => p.valid).every((p) => Math.abs(p.us - 1500) < 10 && Math.abs(p.angle - 93.3) < 1));
// analogWrite en D9: pulsos a 2 ms → no válidos por periodo; write() sin attach(): ningún pulso; el eje no se mueve.
const pwm = recordFast(fx('pos-analogwrite'), 2000, [9], {{ servo: {{ pin: 9 }} }});
assert.ok(pwm.servo.pulses.filter((p) => !p.valid && p.reason === 'periodo').length > 100);
const none = recordFast(fx('pos-sin-attach'), 1000, [9], {{ servo: {{ pin: 9 }} }});
assert.equal(none.servo.pulses.length, 0);
assert.ok(none.servo.samples.every((x) => x.a === 90 && x.g === null));
// El modelo sigue al pin, no al texto: el mismo HEX con el servo en D10 no recibe nada; attach(10) sí llega a D10.
assert.equal(recordFast(fx('pos-solucion'), 600, [], {{ servo: {{ pin: 10 }} }}).servo.pulses.length, 0);
assert.ok(recordFast(fx('pos-otro-pin'), 600, [], {{ servo: {{ pin: 10 }} }}).servo.pulses.filter((p) => p.valid).length > 20);
// Sin pulsos válidos durante 60 ms, «sin señal».
{{
  const r2 = new NanoRunner(fx('pos-solucion'));
  const m2 = new ServoModel(r2, {{ pin: 9 }});
  r2.runFor(500);
  assert.equal(m2.state().receiving, true);
  m2.edge(true, r2.cpu.cycles);    // pulso de 3 ms inyectado: ancho no válido, no cambia la orden
  m2.edge(false, r2.cpu.cycles + 48000);
  assert.equal(m2.state().invalid.reason, 'ancho');
  assert.equal(m2.state().target, 0);
}}
// Determinista: dos ejecuciones dan la misma traza.
assert.equal(JSON.stringify(recordFast(fx('bar-solucion'), 1500, [9, 13], {{ servo: {{ pin: 9 }} }})),
  JSON.stringify(recordFast(fx('bar-solucion'), 1500, [9, 13], {{ servo: {{ pin: 9 }} }})));
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_timers_coexist_with_servo_library(self):
        """Servo toma el Timer1 (D9/D10); Timer0 (millis, D5/D6) y Timer2 (D3/D11) siguen igual."""
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ recordFast }} from './games/laboratorio-arduino/src/sim-worker.js';
import {{ blinkPeriods }} from './games/laboratorio-arduino/src/lessons/servo-eval.js';
const tr = recordFast(readFileSync('{FIX}/servo-convivencia.hex', 'utf8'), 2000, [3, 5, 6, 9, 10, 11, 13], {{ servo: {{ pin: 9 }} }});
const avg = (pin, k) => {{ const ws = tr.windows.filter((w) => w.pin === pin && w.t0 >= 1000 && w[k] !== null); return ws.reduce((a, w) => a + w[k], 0) / ws.length; }};
for (const [pin, duty, freq] of [[5, 64, 976.6], [6, 128, 976.6], [3, 192, 490.2], [11, 32, 490.2]]) {{
  assert.ok(Math.abs(avg(pin, 'duty') - duty / 255) < 0.005, `D${{pin}} duty`);
  assert.ok(Math.abs(avg(pin, 'freq') - freq) < 1, `D${{pin}} freq`);
}}
assert.ok(tr.windows.filter((w) => w.pin === 10 && w.t0 >= 100).every((w) => w.rises === 0 && w.duty === 0), 'D10 sin PWM con Servo');
const v = tr.servo.pulses.filter((p) => p.valid && p.t > 200);
assert.ok(v.every((p) => Math.abs(p.us - 1008) <= 2 && Math.abs(p.periodMs - 20) < 0.01 && Math.abs(p.angle - 45) < 0.5));
const led = blinkPeriods(tr, 13);
assert.ok(led.length >= 3 && led.every((p) => Math.abs(p.end - p.start - 500) < 1 && Math.abs(p.high - 250) < 1), JSON.stringify(led[0]));
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_robot_map_with_servo_motors_and_trig(self):
        """Mapa del futuro evasor: servo D9 + motores (D2, D4, D10, D11, PWM D5/D6) + TRIG D7 en un solo programa real."""
        out = node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
import {{ NanoRunner }} from './games/laboratorio-arduino/src/nano-runner.js';
import {{ MotorModel, PIN_MAPS, pinMapProblems }} from './games/laboratorio-arduino/src/motor.js';
import {{ ServoModel }} from './games/laboratorio-arduino/src/servo.js';
assert.deepEqual(pinMapProblems(PIN_MAPS.robot, {{ 7: 'TRIG', 8: 'ECHO', 9: 'servo' }}), []);
let trig = 0;
const r = new NanoRunner(readFileSync('{FIX}/servo-robot.hex', 'utf8'), {{ onPin: (p, h) => {{ if (p === 7 && h) trig++; }} }});
const motors = new MotorModel(r, {{ channels: PIN_MAPS.robot }});
const angles = [];
const servo = new ServoModel(r, {{ pin: 9, onPulse: (p) => p.valid && angles.push(p.angle) }});
r.runFor(3000);
const st = motors.state();
assert.ok(st.every((c) => c.order === 'adelante' && Math.abs(c.duty - 200 / 255) < 0.005 && c.speed > 0.6), JSON.stringify(st));
assert.ok(Math.min(...angles) <= 32 && Math.max(...angles) >= 148, `${{Math.min(...angles)}}–${{Math.max(...angles)}}`);
assert.ok(trig >= 45, String(trig));
assert.equal(servo.state().receiving, true);
console.log('ok');
""")
        self.assertIn('ok', out)

    def test_posiciones_solutions_pass_and_failures_explain(self):
        r = evaluate_button('servo-posiciones.js', [
            'pos-solucion', 'pos-solucion-micros', 'pos-default', 'pos-otro-pin', 'pos-analogwrite', 'pos-tiempos',
            'pos-orden', 'pos-angulo', 'pos-sin-serie', 'pos-mensaje-tarde', 'pos-sin-attach', 'pos-ejemplo',
            'pos-ej-micros', 'pos-ej-imprimir'])
        for name in ('pos-solucion', 'pos-solucion-micros'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        self.assertEqual(ok('pos-default'), {'senal': True, 'posiciones': False, 'tiempos': False, 'servo': False, 'mensajes': False, 'baud': True})
        self.assertIn('posición por defecto de attach()', d('pos-default', 'posiciones'))
        self.assertIn('Hay pulsos cada 20 ms en D10', d('pos-otro-pin', 'senal'))
        self.assertIn('PWM de analogWrite', d('pos-analogwrite', 'senal'))
        self.assertIn('¿Falta servo.attach(9)?', d('pos-sin-attach', 'senal'))
        self.assertEqual(ok('pos-tiempos'), {'senal': True, 'posiciones': True, 'tiempos': False, 'servo': True, 'mensajes': True, 'baud': True})
        self.assertIn('1460 ms', d('pos-tiempos', 'tiempos'))
        self.assertIn('fue 180°', d('pos-orden', 'posiciones'))
        self.assertIn('fue 160°', d('pos-angulo', 'posiciones'))
        self.assertEqual(ok('pos-sin-serie'), {'senal': True, 'posiciones': True, 'tiempos': True, 'servo': True, 'mensajes': False, 'baud': False})
        self.assertEqual(ok('pos-mensaje-tarde'), {'senal': True, 'posiciones': True, 'tiempos': True, 'servo': True, 'mensajes': False, 'baud': True})
        self.assertIn('llegó a los 1,00 s', d('pos-mensaje-tarde', 'mensajes'))
        self.assertIn('Llega a cada posición en 157', d('pos-solucion', 'servo'))
        for name in ('pos-ejemplo', 'pos-ej-micros', 'pos-ej-imprimir'):
            self.assertFalse(r[name]['passed'], name)
        self.assertLess(evaluate_button('servo-posiciones.js', ['pos-solucion'])['pos-solucion']['ms'], 8000)

    def test_barrido_solutions_pass_and_failures_explain(self):
        r = evaluate_button('servo-barrido.js', [
            'bar-solucion', 'bar-solucion-funciones', 'bar-bloqueante', 'bar-led-detenido', 'bar-led-pin', 'bar-rapido',
            'bar-lento', 'bar-medio', 'bar-otro-pin', 'bar-saltos', 'bar-inmovil', 'bar-ejemplo', 'bar-ej-reloj', 'bar-ej-rebote'])
        for name in ('bar-solucion', 'bar-solucion-funciones'):
            self.assertTrue(r[name]['passed'], r[name])
        ok = lambda n: r[n]['checks']
        d = lambda n, c: r[n]['details'][c]
        self.assertEqual(ok('bar-bloqueante'), {'senal': True, 'barrido': True, 'suave': True, 'velocidad': True, 'led': False, 'servo': True})
        self.assertIn('delay() bloquea el loop', d('bar-bloqueante', 'led'))
        self.assertEqual(ok('bar-ejemplo'), {'senal': True, 'barrido': True, 'suave': True, 'velocidad': True, 'led': False, 'servo': True})
        self.assertIn('se quedó apagado', d('bar-led-detenido', 'led'))
        self.assertIn('Hay cambios en D12', d('bar-led-pin', 'led'))
        self.assertIn('200 °/s', d('bar-rapido', 'velocidad'))
        self.assertIn('33 °/s', d('bar-lento', 'velocidad'))
        self.assertIn('de 0° a 90°', d('bar-medio', 'barrido'))
        self.assertIn('Hay pulsos cada 20 ms en D10', d('bar-otro-pin', 'senal'))
        self.assertIn('saltó de 0° a 180°', d('bar-saltos', 'suave'))
        self.assertIn('no se movió', d('bar-inmovil', 'barrido'))
        self.assertIn('periodo medio 1000 ms', d('bar-solucion', 'led'))
        self.assertIn('67 °/s', d('bar-solucion', 'velocidad'))
        for name in ('bar-ej-reloj', 'bar-ej-rebote'):
            self.assertFalse(r[name]['passed'], name)
        self.assertLess(evaluate_button('servo-barrido.js', ['bar-solucion'])['bar-solucion']['ms'], 8000)

    def test_servo_evaluators_use_only_the_measured_trace(self):
        node("""
import assert from 'node:assert/strict';
import { evaluatePosiciones, evaluateBarrido, commandPhases, sweepSegments, blinkPeriods } from './games/laboratorio-arduino/src/lessons/servo-eval.js';
// Traza fabricada (sin programa): pulsos de 0/90/180/90 y líneas serie en su momento → aprueba.
const pulses = [], samples = [], serial = [];
const seq = [0, 90, 180, 90, 0, 90];
for (let t = 0; t < 5600; t += 20) {
  const ang = seq[Math.floor(t / 1000)];
  pulses.push({ t, us: 544 + ang / 180 * 1856, periodMs: t ? 20 : null, valid: true, reason: null, angle: ang });
}
for (let t = 0; t < 5600; t += 10) samples.push({ t, a: seq[Math.floor(Math.max(0, t - 300) / 1000)], g: seq[Math.floor(t / 1000)] });
for (let k = 0; k < 6; k++) for (const ch of `Angulo ${seq[k]}\\n`) serial.push({ byte: ch.charCodeAt(0), t: k * 1000 + 1, baud: 9600 });
const tr = { durationMs: 5600, windows: [], pins: [], serial, servo: { pulses, samples, params: { signalLostMs: 60 } } };
assert.equal(evaluatePosiciones(tr).passed, true, JSON.stringify(evaluatePosiciones(tr).checks.filter((c) => !c.ok)));
assert.deepEqual(commandPhases(tr).map((p) => p.angle), [0, 90, 180, 90, 0, 90]);
// Los mismos pulsos con un hueco de 200 ms crean una fase «sin señal».
const gap = { ...tr, servo: { ...tr.servo, pulses: pulses.filter((p) => p.t < 1500 || p.t > 1700) } };
assert.ok(commandPhases(gap).some((p) => p.angle === null));
// Sin traza del servo, todo suspende.
for (const ev of [evaluatePosiciones, evaluateBarrido]) assert.equal(ev({ durationMs: 5000, windows: [], pins: [], serial: [] }).passed, false);
// Tramos del barrido con histéresis y parpadeos de subida a subida.
const sw = [];
let ang = 0, dir = 1;
for (let t = 0; t < 7000; t += 20) { sw.push({ t, angle: ang, valid: true }); ang += dir * 4 / 3; if (ang >= 180) { ang = 180; dir = -1; } if (ang <= 0) { ang = 0; dir = 1; } }
const segs = sweepSegments(sw);
assert.deepEqual(segs.map((s) => s.dir), [1, -1, 1]);
assert.ok(Math.abs(segs[1].from - 180) < 1e-9 && Math.abs(segs[2].from) < 1e-9);
const pins = [];
for (let t = 0; t < 4000; t += 500) pins.push({ pin: 13, high: (t / 500) % 2 === 0, t });
assert.deepEqual(blinkPeriods({ pins }, 13).map((p) => [p.end - p.start, p.high]), [[1000, 500], [1000, 500], [1000, 500]]);
""")

    def test_servo_examples_match_fixtures_and_hints_do_not_solve(self):
        node(f"""
import assert from 'node:assert/strict';
import {{ readFileSync }} from 'node:fs';
const fx = (n) => readFileSync('{FIX}/' + n + '.ino', 'utf8');
const P = await import('./games/laboratorio-arduino/src/lessons/servo-posiciones.js');
const B = await import('./games/laboratorio-arduino/src/lessons/servo-barrido.js');
for (const [L, pre] of [[P, 'pos'], [B, 'bar']]) {{
  assert.equal(fx(pre + '-ejemplo'), L.EXAMPLE_CODE);
  for (const [k, e] of Object.entries(L.EXAMPLES)) assert.equal(fx(pre + '-ej-' + k), e.code);
  assert.equal(L.chooseTopic({{ code: L.EXAMPLE_CODE, untouched: true, step: 2 }}).topic, 'paso-2');
  assert.equal(L.chooseTopic({{ compileError: {{ errorLine: 3, errorHelp: 'x' }} }}).topic, 'compilar');
  const html = L.default.html();
  assert.ok(html.includes('GND común') && html.includes('5&nbsp;V'), L.ID);
  assert.deepEqual(L.default.servo, {{ pin: 9 }});
  assert.deepEqual(L.default.evaluation.stimulus.servo, L.default.servo);
  assert.ok(L.default.pins.includes(9));
}}
assert.deepEqual(B.default.pins, [9, 13]);
// Pistas según el código.
assert.equal(P.analyzeCode(P.EXAMPLE_CODE).topic, 'serie');
assert.equal(P.analyzeCode(fx('pos-analogwrite')).topic, 'analogwrite');
assert.equal(P.analyzeCode(fx('pos-sin-attach')).topic, 'attach');
assert.equal(P.analyzeCode(fx('pos-otro-pin')).topic, 'pin');
assert.equal(P.analyzeCode(fx('pos-default')).topic, 'write');
assert.equal(P.analyzeCode(fx('pos-sin-serie')).topic, 'serie');
assert.equal(P.analyzeCode(fx('pos-tiempos')).topic, 'tiempos');
assert.equal(P.analyzeCode(fx('pos-solucion')).topic, 'comprobar');
assert.equal(P.chooseTopic({{ code: fx('pos-solucion'), lastChecks: [{{ id: 'senal', ok: true }}, {{ id: 'mensajes', ok: false }}] }}).topic, 'mensajes');
assert.equal(P.chooseTopic({{ code: fx('pos-solucion'), completed: true }}).topic, 'superado');
assert.equal(B.analyzeCode(B.EXAMPLE_CODE).topic, 'millis');
assert.equal(B.analyzeCode(fx('bar-bloqueante')).topic, 'millis');
assert.equal(B.analyzeCode(fx('bar-led-detenido')).topic, 'led');
assert.equal(B.analyzeCode(fx('bar-otro-pin')).topic, 'pin');
assert.equal(B.analyzeCode(fx('bar-solucion')).topic, 'comprobar');
assert.equal(B.chooseTopic({{ code: fx('bar-solucion'), lastChecks: [{{ id: 'led', ok: false, detail: 'Un barrido con delay() bloquea el loop' }}] }}).topic, 'millis');
assert.equal(B.chooseTopic({{ code: fx('bar-led-pin'), lastChecks: [{{ id: 'led', ok: false, detail: 'Hay cambios en D12' }}] }}).topic, 'pin');
assert.equal(B.chooseTopic({{ code: fx('bar-rapido'), lastChecks: [{{ id: 'velocidad', ok: false }}] }}).topic, 'velocidad');
// Ninguna pista ni ejemplo contiene la solución.
const solved = [/write\\(0\\)[\\s\\S]*write\\(90\\)[\\s\\S]*write\\(180\\)[\\s\\S]*write\\(90\\)/, /millis[\\s\\S]*15[\\s\\S]*millis[\\s\\S]*500|millis[\\s\\S]*500[\\s\\S]*millis[\\s\\S]*15/];
for (const [L, bad] of [[P, solved[0]], [B, solved[1]]]) {{
  for (const t of L.TOPIC_IDS) for (let i = 0; i < 4; i++) assert.doesNotMatch(L.hintText(t, i, {{ delays: [], errorHelp: '' }}).text, bad);
  for (const ex of Object.values(L.EXAMPLES)) assert.doesNotMatch(ex.code, bad);
  assert.doesNotMatch(L.EXAMPLE_CODE, bad);
}}
assert.ok(!Object.values(B.EXAMPLES).some((e) => /Servo/.test(e.code)));
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

    @unittest.skipUnless(shutil.which('avr-g++') and os.environ.get('COMPILADOR_NUCLEO'),
                         'requiere avr-gcc y COMPILADOR_NUCLEO (ver services/compilador-arduino/README.md)')
    def test_servo_library_with_strictly_limited_includes(self):
        compilador.NUCLEO = Path(os.environ['COMPILADOR_NUCLEO'])
        servo = compilador.carpeta_servo()
        if servo is None:
            self.skipTest('el núcleo indicado no incluye Servo (build-servo.sh)')
        ok = compilador.compilar((FIX / 'pos-solucion.ino').read_text())
        self.assertTrue(ok['ok'], ok['salida'])
        self.assertEqual(ok['hex'], (FIX / 'pos-solucion.hex').read_text())
        self.assertRegex(ok['version']['servo'], r'^Servo 1\.3\.0 \(arduino-libraries/Servo, commit 2862ad9864d0dda5669b264857deafbba624940d\)$')
        # Solo dos carpetas propias de cabeceras, y en la de Servo solo sus dos cabeceras AVR.
        raiz = os.path.realpath(compilador.NUCLEO)
        propias = [d for d in compilador.directorios_permitidos() if d.startswith(raiz + os.sep)]
        self.assertEqual(propias, [os.path.realpath(compilador.NUCLEO / 'include'), os.path.realpath(servo / 'include')])
        archivos = sorted(str(p.relative_to(servo / 'include')) for p in (servo / 'include').rglob('*') if p.is_file())
        self.assertEqual(archivos, ['Servo.h', 'avr/ServoTimers.h'])
        self.assertTrue((compilador.NUCLEO / 'LICENSE-Servo-LGPL-2.1.txt').read_text().startswith('                  GNU LESSER GENERAL PUBLIC LICENSE'))
        loop = '\nvoid setup(){}\nvoid loop(){}\n'
        otra = compilador.compilar('#include <sam/ServoTimers.h>' + loop)
        self.assertFalse(otra['ok'])
        self.assertIn('No such file', otra['salida'])
        # Archivos de la librería que no son cabeceras (versión, biblioteca, licencia): el filtro de texto los rechaza
        # y, saltándolo, el control decisivo del preprocesado también, sin devolver su contenido.
        lecturas = ['#include <../VERSION>', '#include <../servo.a>', '#include <../../LICENSE-Servo-LGPL-2.1.txt>',
                    f'#include "{servo / "VERSION"}"', '#include <../../include/../servo/VERSION>']
        for directiva in lecturas:
            self.assertIsNotNone(compilador.validar(directiva + loop), directiva)
            resultado = compilador.compilar(directiva + loop)
            self.assertFalse(resultado['ok'], directiva)
            self.assertNotIn('hex', resultado, directiva)
            self.assertNotIn('arduino-libraries', json.dumps(resultado['diagnosticos'] + [resultado['salida']]), directiva)
        # Una interrupción propia del Timer1 junto a Servo es un error de enlace normal, con diagnóstico.
        isr = compilador.compilar('#include <Servo.h>\nServo s;\nISR(TIMER1_COMPA_vect) {}\nvoid setup(){ s.attach(9); }\nvoid loop(){}\n')
        self.assertFalse(isr['ok'])
        self.assertTrue(any('multiple definition' in d['mensaje'] or 'ld returned' in d['mensaje'] for d in isr['diagnosticos']), isr['diagnosticos'])
        # Los programas sin Servo no enlazan la librería: el HEX es idéntico al de antes (una muestra por lección).
        for nombre in ['solucion', 'semaforo-solucion', 'pwm-solucion', 'boton-solucion', 'flanco-solucion', 'pot-solucion',
                       'ultra-solucion', 'alerta-solucion', 'dir-solucion', 'vel-solucion', 'dos-solucion']:
            if not (FIX / f'{nombre}.ino').exists():
                self.fail(f'falta el programa {nombre}')
            r = compilador.compilar((FIX / f'{nombre}.ino').read_text())
            self.assertEqual(r.get('hex'), (FIX / f'{nombre}.hex').read_text(), nombre)

    def test_health_reports_servo_only_when_present(self):
        anterior = compilador.NUCLEO
        try:
            with tempfile.TemporaryDirectory() as vacio:
                compilador.NUCLEO = Path(vacio)
                self.assertIsNone(compilador.carpeta_servo())
                self.assertNotIn('servo', compilador.version())
                self.assertEqual(set(compilador.version()), {'placa', 'compilador', 'nucleo'})
                (Path(vacio) / 'servo/include').mkdir(parents=True)
                (Path(vacio) / 'servo/include/Servo.h').write_text('')
                (Path(vacio) / 'servo/servo.a').write_text('')
                (Path(vacio) / 'servo/VERSION').write_text('Servo 9.9.9 (prueba)\n')
                self.assertEqual(compilador.version()['servo'], 'Servo 9.9.9 (prueba)')
        finally:
            compilador.NUCLEO = anterior

    def test_stop_waits_for_requests_in_progress(self):
        """SIGTERM (docker stop): deja de aceptar conexiones y termina la compilación en curso antes de salir."""
        from http.server import ThreadingHTTPServer
        import urllib.request
        original = compilador.compilar
        compilador.compilar = lambda codigo: (time.sleep(2.0), {'ok': True, 'lento': True})[1]
        servidor = ThreadingHTTPServer(('127.0.0.1', 0), compilador.Manejador)
        servidor.daemon_threads = True
        hilo = threading.Thread(target=servidor.serve_forever)
        hilo.start()
        respuesta = {}
        def pedir():
            req = urllib.request.Request(f'http://127.0.0.1:{servidor.server_address[1]}/compilar',
                                         data=json.dumps({'codigo': 'void setup(){}\nvoid loop(){}'}).encode(),
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=10) as r:
                respuesta.update(json.load(r))
        try:
            cliente = threading.Thread(target=pedir)
            cliente.start()
            for _ in range(100):
                if compilador.activas['n'] == 1:
                    break
                time.sleep(0.03)
            self.assertEqual(compilador.activas['n'], 1)
            servidor.shutdown()
            hilo.join()
            inicio = time.monotonic()
            compilador.terminar(servidor, limite=5)
            self.assertGreater(time.monotonic() - inicio, 0.3)
            cliente.join(5)
            self.assertEqual(respuesta, {'ok': True, 'lento': True})
            with self.assertRaises(OSError):
                urllib.request.urlopen(f'http://127.0.0.1:{servidor.server_address[1]}/salud', timeout=2)
        finally:
            compilador.compilar = original

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
                except (FileNotFoundError, ProcessLookupError):   # ya recogido entre abrir y leer
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
