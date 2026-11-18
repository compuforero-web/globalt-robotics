#!/usr/bin/env python3
"""Buzón SMTP de PRUEBAS local: guarda cada mensaje como .eml en una carpeta y nunca lo reenvía.

Uso: python3 buzon_pruebas.py <carpeta> [host] [puerto]      (por defecto 127.0.0.1 1025)
Si existe <carpeta>/FALLAR, rechaza los envíos con 451 (para probar fallos y reintentos).
Solo biblioteca estándar; sin TLS ni autenticación: nunca exponerlo fuera de la red de pruebas.
"""
import socketserver
import sys
import time
from pathlib import Path

CARPETA = Path(sys.argv[1])
CARPETA.mkdir(parents=True, exist_ok=True)


class Sesion(socketserver.StreamRequestHandler):
    def responder(self, texto):
        self.wfile.write((texto + '\r\n').encode())

    def handle(self):
        self.responder('220 buzon-pruebas ESMTP')
        destinos, remitente = [], None
        while True:
            linea = self.rfile.readline(4096)
            if not linea:
                return
            orden = linea.decode('utf-8', 'replace').strip()
            mayus = orden.upper()
            if mayus.startswith(('EHLO', 'HELO')):
                self.responder('250-buzon-pruebas\r\n250 8BITMIME')
            elif mayus.startswith('MAIL FROM'):
                if (CARPETA / 'FALLAR').exists():
                    self.responder('451 Fallo simulado del buzon de pruebas')
                    continue
                remitente, destinos = orden[10:].strip(), []
                self.responder('250 OK')
            elif mayus.startswith('RCPT TO'):
                destinos.append(orden[8:].strip().strip('<>'))
                self.responder('250 OK')
            elif mayus == 'DATA':
                self.responder('354 Fin con <CRLF>.<CRLF>')
                partes = []
                while True:
                    l = self.rfile.readline(1 << 20)
                    if not l or l in (b'.\r\n', b'.\n'):
                        break
                    partes.append(l[1:] if l.startswith(b'..') else l)
                nombre = f'{time.time_ns()}-{destinos[0] if destinos else "sin-destino"}.eml'.replace('/', '_')
                tmp = CARPETA / ('.' + nombre)
                tmp.write_bytes(b''.join(partes))
                tmp.rename(CARPETA / nombre)
                self.responder('250 Guardado')
            elif mayus == 'RSET':
                destinos, remitente = [], None
                self.responder('250 OK')
            elif mayus == 'NOOP':
                self.responder('250 OK')
            elif mayus == 'QUIT':
                self.responder('221 Adios')
                return
            else:
                self.responder('502 No implementado')


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    puerto = int(sys.argv[3]) if len(sys.argv) > 3 else 1025
    with Servidor((host, puerto), Sesion) as servidor:
        print(f'Buzón de pruebas en {host}:{puerto} → {CARPETA}', flush=True)
        servidor.serve_forever()
