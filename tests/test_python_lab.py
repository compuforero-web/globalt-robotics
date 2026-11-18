"""Laboratorio «Python desde Cero»: arnés, prácticas y retos con CPython (sin navegador).

El arnés (games/laboratorio-python/src/arnes.py) es el mismo que ejecuta el Worker con Pyodide. Aquí se comprueba
que cada solución de referencia supera todos los casos, que el código inicial y un fallo típico no, y el
comportamiento de entrada, errores, límites y archivos virtuales. Las pruebas de navegador están en
tests/e2e/python-lab.e2e.mjs.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'games/laboratorio-python'
FIX = ROOT / 'tests/fixtures/laboratorio-python'
spec = importlib.util.spec_from_file_location('arnes_lab', LAB / 'src/arnes.py')
arnes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arnes)


def node(script, entrada=None):
    r = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, input=entrada,
                       capture_output=True, text=True, check=True)
    return r.stdout


PRACTICAS = json.loads(node("""
import { PRACTICAS } from './games/laboratorio-python/src/practicas.js';
console.log(JSON.stringify(PRACTICAS.map((p) => ({ id: p.id, principal: p.principal, archivos: p.archivos, casos: p.casos }))));
"""))


def ejecutar_casos(practica, archivos):
    resultados = []
    for caso in practica['casos']:
        if caso.get('requiere'):
            resultados.append({'estado': 'ok'})
            continue
        datos = dict(archivos)
        for nombre, texto in (caso.get('archivos') or {}).items():
            if texto is None:
                datos.pop(nombre, None)
            else:
                datos[nombre] = texto
        llamadas = [l['expr'] for l in caso.get('llamadas', [])]
        resultados.append(arnes.ejecutar(datos, practica['principal'], caso.get('entrada', []), llamadas))
    return resultados


def evaluar(practica, archivos):
    resultados = ejecutar_casos(practica, archivos)
    salida = node("""
import { PRACTICAS, evaluarCaso } from './games/laboratorio-python/src/practicas.js';
let datos = ''; for await (const c of process.stdin) datos += c;
const { id, resultados, archivos } = JSON.parse(datos);
const p = PRACTICAS.find((x) => x.id === id);
console.log(JSON.stringify(p.casos.map((c, i) => evaluarCaso(c, resultados[i], archivos))));
""", json.dumps({'id': practica['id'], 'resultados': resultados, 'archivos': archivos}))
    return json.loads(salida)


def archivos_de(practica, **cambios):
    base = {a['nombre']: a['inicial'] for a in practica['archivos']}
    base.update(cambios)
    return base


class PracticasTests(unittest.TestCase):
    def test_cinco_practicas_encadenadas(self):
        self.assertEqual([p['id'] for p in PRACTICAS], ['python-variables', 'python-condicionales', 'python-funciones',
                                                        'python-archivos', 'python-asistente'])
        for p in PRACTICAS:
            self.assertGreaterEqual(len(p['casos']), 4, p['id'])

    def test_solucion_pasa_y_fallo_e_inicial_no(self):
        for n, p in enumerate(PRACTICAS, start=1):
            with self.subTest(p['id']):
                extra = {'bateria.py': (FIX / 'p4-bateria.py').read_text()} if n == 4 else {}
                sol = evaluar(p, archivos_de(p, **{p['principal']: (FIX / f'p{n}-solucion.py').read_text()}, **extra))
                self.assertTrue(all(r['ok'] for r in sol), sol)
                fallo = evaluar(p, archivos_de(p, **{p['principal']: (FIX / f'p{n}-fallo.py').read_text()}, **extra))
                self.assertFalse(all(r['ok'] for r in fallo), p['id'])
                self.assertTrue(any(r['detalle'] != 'Correcto.' for r in fallo))
                inicial = evaluar(p, archivos_de(p))
                self.assertFalse(all(r['ok'] for r in inicial), p['id'])

    def test_detalle_de_fallos(self):
        p = PRACTICAS[0]
        r = evaluar(p, archivos_de(p))
        self.assertRegex(r[0]['detalle'], r'^Línea 1 de la salida: se esperaba «Autonomía: 4.44 h» y se obtuvo «Autonomía: 4.444')
        p4 = PRACTICAS[3]
        r = evaluar(p4, archivos_de(p4, **{'principal.py': '# sin importar\nprint("hola")\n'}))
        self.assertEqual(r[-1], {'ok': False, 'detalle': 'principal.py debe importar el módulo bateria (import bateria).'})


class ArnesTests(unittest.TestCase):
    def correr(self, codigo, entrada=(), **kw):
        return arnes.ejecutar({'programa.py': codigo, **kw.pop('archivos', {})}, 'programa.py', list(entrada), **kw)

    def test_entrada_eco_y_salida_separadas(self):
        r = self.correr('n = input("Nombre: ")\nprint("Hola", n)\n', ['Ada'])
        self.assertEqual(r['estado'], 'ok')
        self.assertEqual(r['salida'], 'Hola Ada\n')
        self.assertEqual(r['consola'], [['indicador', 'Nombre: '], ['entrada', 'Ada\n'], ['salida', 'Hola'], ['salida', ' '],
                                        ['salida', 'Ada'], ['salida', '\n']])
        self.assertEqual(r['entradas_usadas'], 1)

    def test_falta_entrada_eoferror_con_linea(self):
        r = self.correr('a = input()\nb = input("otro: ")\n', ['1'])
        self.assertEqual((r['estado'], r['error']['tipo'], r['error']['linea'], r['error']['archivo']), ('error', 'EOFError', 2, 'programa.py'))

    def test_errores_con_linea_y_texto(self):
        r = self.correr('x = 1\nif x > 0\n    print(x)\n')
        self.assertEqual((r['error']['tipo'], r['error']['linea']), ('SyntaxError', 2))
        r = self.correr('def f():\n    return y\n\nprint(f())\n')
        e = r['error']
        self.assertEqual((e['tipo'], e['linea'], e['texto']), ('NameError', 2, 'return y'))
        self.assertEqual([m['linea'] for m in e['traza']], [4, 2])
        r = self.correr('total = 1\nprint(totl)\n')
        self.assertIn("Did you mean: 'total'?", r['error']['mensaje'])
        r = self.correr('edad = input()\nprint(edad + 1)\n', ['3'])
        self.assertEqual((r['error']['tipo'], r['error']['linea']), ('TypeError', 2))
        r = self.correr('print("a")\n  print("b")\n')
        self.assertEqual((r['error']['tipo'], r['error']['linea']), ('IndentationError', 2))
        r = self.correr('import sys\nsys.exit(0)\nprint("no")\n')
        self.assertEqual(r['estado'], 'ok')

    def test_error_en_modulo_del_estudiante(self):
        r = arnes.ejecutar({'principal.py': 'import util\nutil.f()\n', 'util.py': 'def f():\n    return 1 / 0\n'}, 'principal.py', [])
        self.assertEqual((r['error']['tipo'], r['error']['archivo'], r['error']['linea']), ('ZeroDivisionError', 'util.py', 2))
        # El módulo se vuelve a cargar en cada ejecución (no queda en caché la versión anterior).
        r = arnes.ejecutar({'principal.py': 'import util\nprint(util.f())\n', 'util.py': 'def f():\n    return 2\n'}, 'principal.py', [])
        self.assertEqual(r['salida'], '2\n')

    def test_salida_limitada_y_except_del_estudiante_no_la_atrapa(self):
        r = self.correr('try:\n    while True:\n        print("x" * 50)\nexcept Exception:\n    pass\n')
        self.assertEqual(r['estado'], 'salida-excedida')
        self.assertEqual(len(r['salida']), arnes.LIMITE_SALIDA)

    def test_archivos_virtuales_aislados(self):
        antes = os.getcwd()
        r = self.correr('open("nuevo.txt", "w").write("hola")\nprint(open("datos.txt").read())\n', archivos={'datos.txt': 'abc'})
        self.assertEqual(r['salida'], 'abc\n')
        self.assertEqual(r['archivos'], {'datos.txt': 'abc', 'nuevo.txt': 'hola', 'programa.py': r['archivos']['programa.py']})
        self.assertEqual(os.getcwd(), antes)
        r = self.correr('import os\nprint(sorted(os.listdir(".")))\n')
        self.assertEqual(r['salida'], "['programa.py']\n")   # nada de la ejecución anterior

    def test_modulos_del_navegador_bloqueados_y_estado_restaurado(self):
        r = self.correr('import js\n')
        self.assertEqual((r['error']['tipo'], r['error']['linea']), ('ImportError', 1))
        import builtins
        self.assertIs(builtins.input, input)

    def test_llamadas_tras_el_programa(self):
        r = self.correr('def doble(x):\n    return 2 * x\n', llamadas=['doble(4)', 'doble(None)'])
        self.assertEqual(r['llamadas'][0], {'expr': 'doble(4)', 'ok': True, 'repr': '8'})
        self.assertEqual(r['llamadas'][1]['error']['tipo'], 'TypeError')


class VendorYEstructuraTests(unittest.TestCase):
    def test_interprete_documentado_con_sumas(self):
        carpeta = LAB / 'vendor/pyodide-314.0.7'
        doc = (carpeta / 'PROCEDENCIA.md').read_text()
        for nombre in ('pyodide.js', 'pyodide-asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'):
            suma = hashlib.sha256((carpeta / nombre).read_bytes()).hexdigest()
            self.assertIn(suma, doc, nombre)
        self.assertIn('Mozilla Public License Version 2.0', (carpeta / 'LICENSE-pyodide.txt').read_text())
        self.assertIn('PYTHON SOFTWARE FOUNDATION LICENSE', (carpeta / 'LICENSE-CPython.txt').read_text())
        self.assertIn('"python": "3.14.2"', (carpeta / 'pyodide-lock.json').read_text())

    def test_sin_dependencias_externas_ni_cdn(self):
        for archivo in [*(LAB / 'src').glob('*.js'), LAB / 'index.html']:
            texto = archivo.read_text()
            self.assertNotRegex(texto, r'cdn\.jsdelivr|unpkg|https?://(?!fonts\.(googleapis|gstatic)\.com)[\w.-]+/[\w./-]*\.(m?js|wasm)', archivo)
        worker = (LAB / 'src/worker.js').read_text()
        self.assertIn("createPyodideModule", worker)
        self.assertIn('indexURL', worker)

    def test_borradores_por_practica_en_este_navegador(self):
        guardado = (LAB / 'src/guardado.js').read_text()
        self.assertIn("'globalt.laboratorio.python.v1'", guardado)
        self.assertNotRegex(guardado, r'fetch|/api/')
        self.assertIn('en este navegador', (LAB / 'index.html').read_text())


if __name__ == '__main__':
    unittest.main()
