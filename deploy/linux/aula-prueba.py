#!/usr/bin/env python3
"""Prueba funcional del aula con UNA cuenta ficticia creada por aula-produccion.sh (que después la borra).

Uso: AULA_PRUEBA_CLAVE=... python3 aula-prueba.py <base> <correo> <registro_abierto: si|no> [tunel]
Con «tunel» se envían las cabeceras que añadiría Cloudflare (HTTPS y IP del visitante) a 127.0.0.1:8096.
Solo biblioteca estándar. Comprueba cookies Secure/HttpOnly, CSRF, inscripción, borrador y compilación real.
"""
import json
import os
import sys
import urllib.error
import urllib.request

base, correo, registro = sys.argv[1:4]
tunel = len(sys.argv) > 4 and sys.argv[4] == 'tunel'
ORIGEN = 'https://globalt-robotics.com'
clave = os.environ['AULA_PRUEBA_CLAVE']
cookie = ''


class SinRedirecciones(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


abrir = urllib.request.build_opener(SinRedirecciones).open


def pedir(metodo, ruta, datos=None, csrf=None, extra=None):
    global cookie
    h = {'Origin': ORIGEN, 'Accept': 'application/json'}
    if tunel:
        h.update({'X-Forwarded-Proto': 'https', 'CF-Connecting-IP': '203.0.113.77', 'Host': 'globalt-robotics.com'})
    if datos is not None:
        h['Content-Type'] = 'application/json'
    if csrf:
        h['X-CSRF-Token'] = csrf
    if cookie:
        h['Cookie'] = cookie
    h.update(extra or {})
    req = urllib.request.Request(base + ruta, method=metodo, headers=h,
                                 data=None if datos is None else json.dumps(datos).encode())
    try:
        with abrir(req, timeout=70) as r:
            estado, cab, cuerpo = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        estado, cab, cuerpo = e.code, e.headers, e.read()
    for valor in cab.get_all('Set-Cookie') or []:
        if valor.startswith('aula_sesion='):
            atributos = valor.lower()
            assert 'httponly' in atributos and 'samesite=strict' in atributos and 'path=/api/aula' in atributos, valor
            assert '; secure' in atributos, 'la cookie de sesión debe ser Secure'
            cookie = valor.split(';', 1)[0] if 'max-age=0' not in atributos else ''
    try:
        return estado, json.loads(cuerpo) if cuerpo else None
    except ValueError:
        return estado, None


e, d = pedir('GET', '/api/aula/salud'); assert e == 200 and d == {'ok': True}, (e, d)
e, d = pedir('GET', '/api/aula/config'); assert d == {'registro_abierto': registro == 'si'}, d
if registro == 'no':
    e, d = pedir('POST', '/api/aula/registro', {'nombre': 'Intruso', 'correo': 'x' + correo, 'clave': clave})
    assert e == 403, ('registro cerrado', e)
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave + 'x'}); assert e == 401, e
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}, extra={'Origin': 'https://atacante.example'})
assert e == 403, ('origen ajeno', e)
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}); assert e == 200 and cookie, (e, d)
csrf = d['csrf']
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-arduino'})[0] == 403, 'sin CSRF'
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-arduino'}, csrf)[0] in (200, 201)
assert [c['id'] for c in pedir('GET', '/api/aula/mis-cursos')[1]['cursos']] == ['course-arduino']
B = '/api/aula/borradores/arduino-led-serie'
assert pedir('GET', B)[1] == {'borrador': None}
codigo = 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(200); digitalWrite(13, LOW); delay(800); }\n'
e, d = pedir('PUT', B, {'codigo': codigo}, csrf); assert e == 200 and d['borrador']['version'] == 1, (e, d)
assert pedir('GET', '/api/aula/compilador/salud')[0] == 200, 'compilador vía aula'
assert pedir('POST', '/api/aula/compilar', {'codigo': codigo})[0] == 403, 'compilar sin CSRF'
e, d = pedir('POST', '/api/aula/compilar', {'codigo': codigo}, csrf)
assert e == 200 and d['ok'] is True and d['hex'].startswith(':'), ('compilación real', e, str(d)[:200])
assert pedir('DELETE', '/api/aula/sesion', None, csrf)[0] == 204 and not cookie
assert pedir('GET', B)[0] == 401
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}); assert e == 200
assert pedir('GET', B)[1]['borrador']['codigo'] == codigo, 'recuperar borrador'
pedir('DELETE', '/api/aula/sesion', None, d['csrf'])
print('Prueba funcional del aula: salud, registro ' + ('abierto' if registro == 'si' else 'cerrado')
      + ', cookies Secure/HttpOnly, origen, CSRF, inscripción, borrador y compilación real: OK')
