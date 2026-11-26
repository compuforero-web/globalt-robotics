#!/usr/bin/env python3
"""Lector web del buzón de PRUEBAS de la réplica de ensayo (solo lectura, solo biblioteca estándar).

Uso: python3 buzon_web.py <carpeta> [puerto]
Pide el correo ficticio exacto y muestra los últimos mensajes dirigidos a él con sus enlaces, para abrir la
verificación desde el celular. Nunca lista todos los destinatarios. Solo existe en deploy/ensayo-octavo.
"""
import email
import email.policy
import html
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

CARPETA = Path(sys.argv[1])
MAX_MENSAJES = 5
ENLACE = re.compile(r'https?://[^\s<>"]+')
CORREO = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}$')

ESTILO = ('body{margin:0;font:17px/1.5 system-ui,sans-serif;background:#f4f7f6;color:#132f3c}'
          'main{max-width:640px;margin:auto;padding:16px}h1{font-size:24px}'
          'input,button{font:inherit;padding:10px;border-radius:6px;border:1px solid #8aa;width:100%;box-sizing:border-box}'
          'button{margin-top:8px;background:#132f3c;color:#fff;border:0}'
          'article{background:#fff;border-radius:8px;padding:12px;margin:12px 0;overflow-wrap:anywhere}'
          'a.btn{display:block;text-align:center;background:#1e7d6b;color:#fff;padding:12px;border-radius:6px;'
          'text-decoration:none;margin:8px 0}small{color:#556}')


def mensajes(correo):
    encontrados = []
    for ruta in sorted(CARPETA.glob('*.eml'), reverse=True):
        mensaje = email.message_from_bytes(ruta.read_bytes(), policy=email.policy.default)
        if str(mensaje['To'] or '').strip().lower() != correo:
            continue
        cuerpo = mensaje.get_body(preferencelist=('plain',))
        texto = cuerpo.get_content() if cuerpo else ''
        encontrados.append((str(mensaje['Subject'] or '(sin asunto)'), str(mensaje['Date'] or ''),
                            list(dict.fromkeys(ENLACE.findall(texto)))))
        if len(encontrados) == MAX_MENSAJES:
            break
    return encontrados


def pagina(correo):
    partes = ['<!doctype html><html lang="es"><meta charset="utf-8">',
              '<meta name="viewport" content="width=device-width,initial-scale=1">',
              f'<title>Buzón de ensayo</title><style>{ESTILO}</style><main>',
              '<h1>Buzón de ensayo</h1><p><small>Solo réplica de ensayo: correos ficticios que nunca salen del servidor.</small></p>',
              '<form method="get"><label>Correo con el que te registraste',
              f'<input type="email" name="correo" required autocomplete="email" value="{html.escape(correo)}"></label>',
              '<button>Buscar mis mensajes</button></form>']
    if correo:
        lista = mensajes(correo) if CORREO.match(correo) else []
        if not lista:
            partes.append('<p role="status">Todavía no hay mensajes para ese correo. Espera unos segundos y vuelve a buscar.</p>')
        for asunto, fecha, enlaces in lista:
            partes.append(f'<article><strong>{html.escape(asunto)}</strong><br><small>{html.escape(fecha)}</small>')
            for enlace in enlaces:
                rotulo = ('Confirmar mi correo' if '#verificar=' in enlace else
                          'Elegir contraseña nueva' if '#restablecer=' in enlace else 'Abrir enlace del mensaje')
                partes.append(f'<a class="btn" href="{html.escape(enlace)}">{rotulo}</a>')
            partes.append('</article>')
    partes.append('</main></html>')
    return ''.join(partes).encode()


class Lector(BaseHTTPRequestHandler):
    def do_GET(self):
        consulta = parse_qs(urlsplit(self.path).query)
        correo = (consulta.get('correo') or [''])[0].strip().lower()[:256]
        cuerpo = pagina(correo)
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Robots-Tag', 'noindex')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'")
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, *args):   # no registrar correos en los registros del contenedor
        pass


if __name__ == '__main__':
    puerto = int(sys.argv[2]) if len(sys.argv) > 2 else 8025
    ThreadingHTTPServer(('0.0.0.0', puerto), Lector).serve_forever()
