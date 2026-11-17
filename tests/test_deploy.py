import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deployment', ROOT / 'deploy/linux/update.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/admin':
            self.path = '/admin.html'
        super().do_GET()
    def log_message(self, *args):
        pass

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.repo = self.base / 'source'
        self.repo.mkdir()
        self.git('init', '-b', 'main')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Deployment Test')
        for name in deploy.REQUIRED:
            p = self.repo / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('original')
        (self.repo / 'supabase-schema.sql').write_text('private deployment material')
        self.first = self.commit('initial')
        self.args = argparse.Namespace(state=str(self.base / 'state'),
            webroot=str(self.base / 'web'), repo_url=str(self.repo), health_url='',
            prepare_only=True, rollback=False)
        deploy.update(self.args)
        self.web = Path(self.args.webroot)
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(self.web / 'current')))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.args.health_url = f'http://127.0.0.1:{self.http.server_port}'
        self.args.prepare_only = False
    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.temp.cleanup()
    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.STDOUT).decode().strip()
    def commit(self, message):
        self.git('add', '.')
        self.git('commit', '-m', message)
        return self.git('rev-parse', 'HEAD')
    def active(self):
        return (self.web / 'current/revision.txt').read_text().strip()
    def test_publish_noop_and_rollback(self):
        self.assertEqual(self.active(), self.first)
        self.assertFalse((self.web / 'current/supabase-schema.sql').exists())
        self.assertFalse((self.web / 'current/.git').exists())
        deploy.update(self.args)
        (self.repo / 'index.html').write_text('updated')
        second = self.commit('update')
        deploy.update(self.args)
        self.assertEqual(self.active(), second)
        self.assertEqual((self.web / 'current/index.html').read_text(), 'updated')
        self.args.rollback = True
        deploy.update(self.args)
        self.assertEqual(self.active(), self.first)
    def test_force_regenerates_active_release(self):
        deploy.update(self.args)
        release = self.web / 'current'
        (release / 'aula/index.html').unlink()          # p. ej., versión publicada antes de permitir aula/
        deploy.update(self.args)                          # sin --force: «Sin cambios»
        self.assertFalse((release / 'aula/index.html').exists())
        self.args.force = True
        deploy.update(self.args)
        self.assertEqual((release / 'aula/index.html').read_text(), 'original')
        self.assertEqual(self.active(), self.first)
        self.assertTrue((self.web / 'previous').is_symlink())          # la versión anterior queda para volver

    def test_force_health_failure_keeps_active_release(self):
        deploy.update(self.args)
        antes = os.readlink(self.web / 'current')
        (self.web / 'current/aula/index.html').unlink()
        self.args.force = True
        self.args.health_url = 'http://127.0.0.1:9'                      # comprobación HTTP fallida
        with self.assertRaises(RuntimeError):
            deploy.update(self.args)
        self.assertEqual(os.readlink(self.web / 'current'), antes)       # sigue la misma carpeta activa

    def test_invalid_json_preserves_active_release(self):
        (self.repo / 'data').mkdir()
        (self.repo / 'data/catalog.json').write_text('{broken')
        self.commit('invalid JSON')
        with self.assertRaises(ValueError):
            deploy.update(self.args)
        self.assertEqual(self.active(), self.first)
    def test_missing_required_file_preserves_active_release(self):
        (self.repo / 'admin.html').unlink()
        self.commit('missing admin')
        with self.assertRaises(ValueError):
            deploy.update(self.args)
        self.assertEqual(self.active(), self.first)
    def test_health_failure_restores_previous_release(self):
        (self.repo / 'index.html').write_text('unhealthy update')
        self.commit('unhealthy')
        with patch.object(deploy, 'health', side_effect=RuntimeError('unavailable')):
            with self.assertRaises(RuntimeError):
                deploy.update(self.args)
        self.assertEqual(self.active(), self.first)
    def test_unsafe_archive_is_rejected(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('src/link', tarfile.SYMTYPE)]:
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode='w') as archive:
                entry = tarfile.TarInfo(name)
                entry.type = kind
                entry.linkname = '/etc/passwd' if kind == tarfile.SYMTYPE else ''
                archive.addfile(entry, io.BytesIO(b''))
            with self.assertRaises(ValueError):
                deploy.extract(buf.getvalue(), self.base / 'extract')
    def test_fetch_failure_preserves_active_release(self):
        subprocess.run(['git', '--git-dir=' + str(Path(self.args.state) / 'repository.git'),
            'remote', 'set-url', 'origin', str(self.base / 'missing')], check=True)
        with self.assertRaises(subprocess.CalledProcessError):
            deploy.update(self.args)
        self.assertEqual(self.active(), self.first)

if __name__ == '__main__':
    unittest.main()


class CompilerDeployToolTests(unittest.TestCase):
    """deploy/linux/compilador-produccion.sh: comprobaciones estáticas (el ensayo con Docker real es tests/docker/ensayo-compilador.sh)."""
    SCRIPT = ROOT / 'deploy/linux/compilador-produccion.sh'

    def test_syntax_and_orders(self):
        subprocess.run(['bash', '-n', str(self.SCRIPT)], check=True)
        texto = self.SCRIPT.read_text()
        for orden in ('comprobar)', 'preparar)', 'ensayar)', 'promover)', 'recuperar)'):
            self.assertIn(orden, texto)

    def test_isolation_is_never_weakened(self):
        texto = self.SCRIPT.read_text()
        self.assertNotRegex(texto, r'chmod\s+(-R\s+)?0?777|-m\s+0?777|a\+rwx')
        self.assertNotRegex(texto, r'--publish|\s-p\s+\d|--privileged|--cap-add|--network\s+host|docker\.sock\s*,|src=/var/run/docker')
        self.assertNotRegex(texto, r'docker\s+(rmi|image\s+rm|volume\s+rm|system\s+prune|image\s+prune)')
        self.assertIn("--network', 'none'", texto)
        self.assertIn('monta el socket de Docker', texto)
        # Producción por defecto; las variables de ensayo solo cambian nombres y rutas, y el fallo simulado exige ensayo.
        self.assertIn('SOCKET_DIR=${GLOBALT_ENSAYO_SOCKETS:-/var/lib/globalt-robotics-lab/run}', texto)
        self.assertIn('COMP_C=${GLOBALT_ENSAYO_CONTENEDOR:-globalt-arduino-compiler}', texto)
        self.assertIn('[[ $ENSAYO == 1 && ${GLOBALT_ENSAYO_FALLO:-} == tras-cambio ]]', texto)

    def test_promotion_requires_rehearsed_image_and_rolls_back(self):
        texto = self.SCRIPT.read_text()
        self.assertIn('cambió desde el ensayo', texto)
        self.assertIn('trap volver ERR', texto)
        self.assertIn('trap retirar_candidato EXIT', texto)
        self.assertIn('cmp -s - "$SELF"', texto)
        self.assertIn('SERVO_COMMIT=2862ad9864d0dda5669b264857deafbba624940d', texto)
        dockerfile = (ROOT / 'services/compilador-arduino/Dockerfile').read_text()
        self.assertIn('ARG SERVO_COMMIT=2862ad9864d0dda5669b264857deafbba624940d', dockerfile)
        self.assertIn('ARG NUCLEO_COMMIT=42fa4a1ea1b1b11d1cc0a60298e529d37f9d14bd', dockerfile)
        self.assertIn('!build-servo.sh', (ROOT / 'services/compilador-arduino/.dockerignore').read_text())
