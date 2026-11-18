"""Comprobaciones estáticas del aula que se ejecutan en CI sin PostgreSQL.

Las pruebas funcionales de la API están en services/aula-api/tests (requieren PostgreSQL)."""
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / 'services/aula-api'


class AulaStaticTests(unittest.TestCase):
    def test_frontend_no_guarda_credenciales_en_el_navegador(self):
        for archivo in (ROOT / 'aula').rglob('*.js'):
            texto = archivo.read_text()
            self.assertNotRegex(texto, r'localStorage|sessionStorage|indexedDB|document\.cookie', archivo)

    def test_laboratorio_no_se_enlaza_de_forma_fija(self):
        # Depende de la PR #1: solo se enlaza tras comprobar que existe en el servidor.
        self.assertNotIn('laboratorio-arduino', (ROOT / 'aula/index.html').read_text())

    def test_dependencias_fijadas(self):
        for nombre in ('requirements.txt', 'requirements-dev.txt', 'requirements.lock'):
            for linea in (API / nombre).read_text().splitlines():
                linea = linea.strip()
                if linea and not linea.startswith(('#', '-r')):
                    self.assertRegex(linea, r'^[A-Za-z0-9_.\[\]-]+==[0-9][\w.]*$', f'{nombre}: {linea}')

    def test_env_example_sin_secretos(self):
        texto = (API / '.env.example').read_text()
        self.assertIn('AULA_DB_CLAVE=cambia-esta-clave-local', texto)
        self.assertNotRegex(texto, r'(?i)(api[_-]?key|token|secret)\s*=\s*\S{12,}')

    def test_migracion_inicial(self):
        sql = (API / 'migrations/0001_inicial.sql').read_text()
        self.assertIn("DEFAULT 'estudiante'", sql)
        self.assertIn("('course-arduino'", sql)
        self.assertIn("LIKE '$argon2id$%'", sql)

    def test_registro_no_acepta_rol(self):
        codigo = (API / 'app/main.py').read_text()
        self.assertIn("extra='forbid'", codigo)
        self.assertRegex(codigo, re.escape("VALUES (%s, %s, %s, 'estudiante')"))


if __name__ == '__main__':
    unittest.main()


class ProgresoStaticTests(unittest.TestCase):
    """Progreso del curso: migración nueva, ruta permitida por el nginx público y separación por cuenta."""

    def test_migracion_nueva_sin_tocar_las_aplicadas(self):
        nombres = sorted(p.name for p in (API / 'migrations').glob('*.sql'))
        self.assertEqual(nombres, ['0001_inicial.sql', '0002_borradores.sql', '0003_compilaciones.sql', '0004_progreso.sql'])
        sql = (API / 'migrations/0004_progreso.sql').read_text()
        self.assertIn('CREATE TABLE progreso_lecciones', sql)
        self.assertIn('ON DELETE CASCADE', sql)
        self.assertIn('DECLARATIVO', sql)
        sentencias = re.sub(r'--[^\n]*', '', sql).replace('ON DELETE CASCADE', '')
        self.assertNotRegex(sentencias, r'(?i)\b(DROP|ALTER|UPDATE|DELETE|TRUNCATE|INSERT)\b')   # solo añade: vuelta atrás compatible

    def test_ruta_de_progreso_dentro_de_la_lista_del_nginx_publico(self):
        conf = (ROOT / 'deploy/linux/nginx-public-aula.conf').read_text()
        lista = re.search(r'location ~ "(\^/api/aula/\([^"]+)"', conf)[1]
        self.assertRegex('/api/aula/mis-cursos', lista)
        codigo = (API / 'app/main.py').read_text()
        self.assertIn("@app.post('/api/aula/mis-cursos')", codigo)
        self.assertRegex(codigo, r"def registrar_progreso\(datos: Progreso, sesion=Depends\(con_csrf\)")
        self.assertIn('leccion_permitida(datos.leccion_id, sesion, conexion)', codigo)
        modelo = codigo[codigo.index('class Progreso'):codigo.index('class Inscripcion')]
        self.assertIn("extra='forbid'", modelo)
        self.assertEqual(re.findall(r'^    (\w+):', modelo, re.M), ['leccion_id', 'paso', 'vistos', 'visto_en', 'completada'])

    def test_progreso_por_cuenta_y_sin_atribuir_lo_local(self):
        modulo = (ROOT / 'games/laboratorio-arduino/src/progreso-cuenta.js').read_text()
        codigo = re.sub(r'^\s*//[^\n]*', '', modulo, flags=re.M)
        self.assertNotIn('globalt.laboratorio.arduino.v1', codigo)   # el registro local sin cuenta nunca se sube
        self.assertIn("PREFIJO = 'globalt.aula.progreso-pendiente.v1.'", modulo)
        lab = (ROOT / 'games/laboratorio-arduino/src/lab.js').read_text()
        # La finalización solo se anota tras superar el evaluador.
        self.assertEqual(lab.count('completada: true'), 1)
        bloque = lab[lab.index('if (result.passed) {'):lab.index("guide.notify('eval-pass')")]
        self.assertIn('noteCompletion()', bloque)
        self.assertEqual(lab.count('await noteCompletion()'), 1)

    def test_modulo_de_progreso(self):
        subprocess.run(['node', '--test', 'tests/progreso-cuenta.test.mjs'], cwd=ROOT, check=True, capture_output=True)
