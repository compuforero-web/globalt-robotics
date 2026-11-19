"""Entrega ficticia por el proxy de systemd, en el host y, si existe Docker, sin red en la API."""
import contextlib
import os
from pathlib import Path
import shutil
import socket
import socketserver
import ssl
import subprocess
import sys
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]
PROXY = '/usr/lib/systemd/systemd-socket-proxyd'
IMAGE = 'python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df'
CLIENT = """
from app import correo, config
correo.enviar(config.cargar(), 'estudiante@example.invalid', 'Ensayo', 'Solo prueba', 'prueba')
"""


class Buzon(socketserver.StreamRequestHandler):
    def handle(self):
        def tls():
            self.rfile.close()
            self.wfile.close()
            self.connection = self.server.context.wrap_socket(self.connection, server_side=True)
            self.rfile = self.connection.makefile('rb')
            self.wfile = self.connection.makefile('wb', buffering=0)
        try:
            if self.server.implicit:
                tls()
            self.wfile.write(b'220 ensayo\r\n')
            while line := self.rfile.readline():
                command = line.split()[0].upper()
                if command == b'EHLO':
                    self.wfile.write(b'250-ensayo\r\n250 STARTTLS\r\n')
                elif command == b'STARTTLS':
                    self.wfile.write(b'220 TLS\r\n')
                    tls()
                elif command == b'DATA':
                    self.wfile.write(b'354 mensaje\r\n')
                    parts = []
                    for data in self.rfile:
                        if data == b'.\r\n':
                            break
                        parts.append(data)
                    else:
                        return
                    self.server.messages.append(b''.join(parts))
                    self.wfile.write(b'250 aceptado\r\n')
                elif command == b'QUIT':
                    self.wfile.write(b'221 fin\r\n')
                    return
                else:
                    self.wfile.write(b'250 OK\r\n')
        except (ssl.SSLError, ConnectionError):
            pass
        finally:
            if isinstance(self.connection, ssl.SSLSocket):
                self.connection.close()


@unittest.skipUnless(Path(PROXY).is_file() and shutil.which('openssl'), 'requiere Linux con systemd-socket-proxyd y openssl')
class CorreoAislado(unittest.TestCase):
    def ensayo(self, docker):
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            path = Path(tmp)
            cert = path / 'ca.pem'
            key = path / 'key.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                            '-subj', '/CN=correo.invalid', '-addext', 'subjectAltName=DNS:correo.invalid',
                            '-out', cert, '-keyout', key], check=True, capture_output=True)
            server = stack.enter_context(socketserver.ThreadingTCPServer(('127.0.0.1', 0), Buzon))
            server.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            server.context.load_cert_chain(cert, key)
            key.unlink()
            server.messages = []
            threading.Thread(target=server.serve_forever, daemon=True).start()
            stack.callback(server.shutdown)
            unix = stack.enter_context(socket.socket(socket.AF_UNIX))
            unix.bind(str(path / 'proveedor.sock'))
            unix.listen()
            os.chmod(tmp, 0o755)
            os.chmod(path / 'proveedor.sock', 0o666)  # socket temporal ficticio
            # Reproduce la activación por socket con el ejecutable real de systemd.
            launcher = ('import os,sys;os.dup2(int(sys.argv[1]),3,inheritable=True);'
                        'os.set_inheritable(3,True);os.environ.update(LISTEN_PID=str(os.getpid()),LISTEN_FDS="1");'
                        'os.execv(sys.argv[2],sys.argv[2:])')
            proc = subprocess.Popen([sys.executable, '-c', launcher, str(unix.fileno()), PROXY,
                                     '127.0.0.1:' + str(server.server_address[1])], pass_fds=(unix.fileno(),))
            stack.callback(proc.wait, 10)
            stack.callback(proc.terminate)
            for mode, host, ok in [('starttls', 'correo.invalid', True), ('ssl', 'correo.invalid', True),
                                   ('ssl', 'otro.invalid', False)]:
                server.implicit = mode == 'ssl'
                mount = '/smtp' if docker else tmp
                api = ROOT / 'services/aula-api'
                env = dict(PYTHONPATH='/api' if docker else str(api), AULA_ORIGENES='https://aula.invalid',
                           AULA_DATABASE_URL='prueba', AULA_URL_PUBLICA='https://aula.invalid',
                           AULA_CORREO_MODO='smtp', AULA_CORREO_REMITENTE='aula@example.invalid',
                           AULA_SMTP_TLS=mode, AULA_SMTP_HOST=host, AULA_SMTP_SOCKET=mount+'/proveedor.sock',
                           SSL_CERT_FILE=mount+'/ca.pem')
                cmd = [sys.executable, '-c', CLIENT]
                if docker:
                    cmd = ['docker', 'run', '--rm', '--network', 'none', '--user', '10002:10002',
                           '-v', tmp+':/smtp:ro', '-v', str(api)+':/api:ro']
                    for name in env:
                        cmd.extend(['-e', name])
                    cmd.extend([IMAGE, 'python', '-c', CLIENT])
                result = subprocess.run(cmd, env={**os.environ, **env}, capture_output=True, timeout=90)
                if ok:
                    self.assertEqual(result.returncode, 0, result.stderr)
                else:
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(b'SSLCertVerificationError', result.stderr)
            self.assertEqual(len(server.messages), 2)
            self.assertTrue(all(b'Solo prueba' in data for data in server.messages))

    def test_proxy_real(self):
        self.ensayo(False)

    @unittest.skipUnless(shutil.which('docker'), 'requiere Docker')
    def test_cliente_docker_sin_red(self):
        self.ensayo(True)
