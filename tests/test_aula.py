"""Comprobaciones estáticas del aula que se ejecutan en CI sin PostgreSQL.

Las pruebas funcionales de la API están en services/aula-api/tests (requieren PostgreSQL)."""
from pathlib import Path
import re
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
