import argparse
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
