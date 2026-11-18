"""Comprobaciones sin PostgreSQL del progreso por cuenta de las prácticas Web y Python (se ejecutan en CI).

Las pruebas de la API están en services/aula-api/tests/test_progreso_practicas.py (requieren PostgreSQL) y la
de extremo a extremo en tests/e2e/practicas-progreso.e2e.mjs."""
from pathlib import Path
import ast
import json
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULO = 'games/laboratorio-web/progreso-cuenta.js'


def node(script):
    return subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, check=True,
                          capture_output=True, text=True).stdout


def practicas_api():
    arbol = ast.parse((ROOT / 'services/aula-api/app/main.py').read_text())
    for n in arbol.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'PRACTICAS':
            return ast.literal_eval(n.value)
    raise AssertionError('PRACTICAS no encontrado')


class ProgresoPracticasTests(unittest.TestCase):
    def test_identificadores_coinciden_con_los_laboratorios_y_la_api(self):
        datos = json.loads(node(f'''
import {{ lessons }} from './games/laboratorio-web/lessons.js';
import {{ PRACTICAS }} from './games/laboratorio-python/src/practicas.js';
globalThis.addEventListener = () => {{}};
const {{ CURSOS }} = await import('./{MODULO}');
console.log(JSON.stringify({{ web: lessons.map((l) => l.id), py: PRACTICAS.map((p) => [p.id, p.corto]),
  cursos: Object.fromEntries(Object.entries(CURSOS).map(([k, c]) => [k, c.practicas.map((p) => [p.local, p.id, p.corto])])) }}));
'''))
        self.assertEqual(len(datos['web']), 5)
        self.assertEqual(len(datos['py']), 5)
        self.assertEqual([[x, 'web-' + x] for x in datos['web']], [p[:2] for p in datos['cursos']['course-web']])
        self.assertEqual([[i, i, c] for i, c in datos['py']], datos['cursos']['course-python'])
        esperado = {**{'web-' + x: 'course-web' for x in datos['web']}, **{i: 'course-python' for i, _ in datos['py']}}
        self.assertEqual(practicas_api(), esperado)

    def test_aula_no_usa_almacenamiento_y_entrega_panel(self):
        texto = (ROOT / 'aula/src/progreso-practicas.js').read_text()
        self.assertNotRegex(texto, r'localStorage|sessionStorage|indexedDB|document\.cookie')
        self.assertIn('export function panelPracticas(curso', texto)
        self.assertNotIn('progreso-practicas', (ROOT / 'aula/src/main.js').read_text())   # lo conecta la integración

    def test_finalizacion_solo_tras_aprobar_el_evaluador(self):
        web = (ROOT / 'games/laboratorio-web/main.js').read_text()
        self.assertEqual(web.count('cuenta.completar('), 1)
        self.assertRegex(web, r"if\(passed && !conCuenta\(\)\)\{draft\.done=true;[^\n]*\n\s*else if\(passed\)\{")
        py = (ROOT / 'games/laboratorio-python/src/main.js').read_text()
        self.assertEqual(py.count('cuenta.completar('), 1)
        self.assertRegex(py, r'else if \(superado\) \{[^}]*cuenta\.completar\(P\.id\)')
        # El historial de invitado se conserva en sus claves de siempre y nunca se envía.
        self.assertIn("'globalt.taller-web.v1.'", web)
        self.assertIn("'globalt.laboratorio.python.v1'", (ROOT / 'games/laboratorio-python/src/guardado.js').read_text())
        modulo = (ROOT / MODULO).read_text()
        self.assertNotRegex(modulo, r'taller-web|laboratorio\.python|laboratorio\.arduino')

    def test_arduino_y_migraciones_intactas(self):
        cambios = subprocess.run(['git', 'diff', '--name-only', 'origin/main', '--', 'games/laboratorio-arduino',
                                  'services/aula-api/migrations', 'aula/src/main.js', 'aula/index.html'],
                                 cwd=ROOT, capture_output=True, text=True).stdout.strip()
        self.assertEqual(cambios, '')

    def test_unitarias_node(self):
        subprocess.run(['node', '--test', 'tests/progreso-practicas.test.mjs'], cwd=ROOT, check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
