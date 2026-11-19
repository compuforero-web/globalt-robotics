#!/usr/bin/env python3
"""Prueba funcional del aula con UNA cuenta ficticia creada por aula-produccion.sh (que después la borra).

Uso: AULA_PRUEBA_CLAVE=... python3 aula-prueba.py <base> <correo> <registro_abierto: si|no> [tunel]
Con «tunel» se envían las cabeceras que añadiría Cloudflare (HTTPS y IP del visitante) a 127.0.0.1:8096.
No envía correos. Solo biblioteca estándar. Comprueba documentos, enlaces inventados, cookies Secure/HttpOnly, CSRF, inscripción, borrador, progreso y compilación real.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from uuid import uuid4

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
e, conf = pedir('GET', '/api/aula/config')
# «si» = AULA_REGISTRO_ABIERTO=true; solo queda abierto de verdad con correo configurado y los tres documentos vigentes.
assert e == 200 and conf['registro_abierto'] in ((True, False) if registro == 'si' else (False,)), conf
if not conf['registro_abierto']:
    e, d = pedir('POST', '/api/aula/registro', {'nombre': 'Intruso', 'correo': 'x' + correo, 'clave': clave,
                                                'mayor_de_edad': True, 'terminos': 'x', 'datos': 'x'})
    assert e == 403, ('registro cerrado', e)
# Incluso antes de activar textos, la consulta debe llegar a la API a través de nginx.
e, d = pedir('GET', f'/api/aula/documentos/politica/{uuid4().hex}')
assert e == 404 and isinstance(d, dict), ('ruta pública de política', e)
for tipo, doc in conf.get('documentos', {}).items():   # versión vigente consultable por la ruta pública
    e, d = pedir('GET', f"/api/aula/documentos/{tipo}/{doc['version']}")
    assert e == 200 and d['texto'] and len(d['sha256']) == 64, ('documento', tipo, e)
# Enlaces de correo: uno inventado no sirve (no se envía ningún correo en esta prueba).
assert pedir('POST', '/api/aula/cuenta/verificar', {'token': 'x' * 43, 'clave': clave})[0] == 410
assert pedir('POST', '/api/aula/cuenta/restablecer', {'token': 'x' * 43, 'clave': clave})[0] == 410
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave + 'x'}); assert e == 401, e
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}, extra={'Origin': 'https://atacante.example'})
assert e == 403, ('origen ajeno', e)
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}); assert e == 200 and cookie, (e, d)
csrf = d['csrf']
if d.get('pendientes'):   # documentos vigentes: la cuenta temporal (de consola) los acepta, como cualquier cuenta
    assert pedir('GET', '/api/aula/mis-cursos')[0] == 403, 'sin aceptar no se usa la cuenta'
    e, r = pedir('POST', '/api/aula/cuenta/autorizar', {p['tipo']: p['version'] for p in d['pendientes']}, csrf)
    assert e == 200 and r == {'pendientes': []}, ('autorizar', e, r)
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-arduino'})[0] == 403, 'sin CSRF'
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-arduino'}, csrf)[0] in (200, 201)
assert [c['id'] for c in pedir('GET', '/api/aula/mis-cursos')[1]['cursos']] == ['course-arduino']
# Misma ruta de producción que usarán las tarjetas. Solo modifica la cuenta temporal de esta prueba.
e, catalogo = pedir('GET', '/api/aula/cursos')
assert e == 200 and {'course-web', 'course-python', 'course-arduino', 'course-scratch'} <= {
    curso['id'] for curso in catalogo['cursos']}, 'catálogo incompleto'
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-web'}, csrf)[0] == 201
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-web'}, csrf)[0] == 200
assert {c['id'] for c in pedir('GET', '/api/aula/mis-cursos')[1]['cursos']} == {'course-arduino', 'course-web'}
B = '/api/aula/borradores/arduino-led-serie'
assert pedir('GET', B)[1] == {'borrador': None}
codigo = 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(200); digitalWrite(13, LOW); delay(800); }\n'
e, d = pedir('PUT', B, {'codigo': codigo}, csrf); assert e == 200 and d['borrador']['version'] == 1, (e, d)
assert pedir('GET', '/api/aula/compilador/salud')[0] == 200, 'compilador vía aula'
assert pedir('POST', '/api/aula/compilar', {'codigo': codigo})[0] == 403, 'compilar sin CSRF'
e, d = pedir('POST', '/api/aula/compilar', {'codigo': codigo}, csrf)
assert e == 200 and d['ok'] is True and d['hex'].startswith(':'), ('compilación real', e, str(d)[:200])
# Progreso declarativo: guardar código y compilar no completan; solo «completada» lo hace; sin CSRF se rechaza.
P = '/api/aula/mis-cursos'
progreso = lambda: next(c for c in pedir('GET', P)[1]['cursos'] if c['id'] == 'course-arduino')['progreso']
assert progreso() == {'evaluacion': 'navegador', 'ultima': None, 'lecciones': []}, 'progreso vacío'
assert pedir('POST', P, {'leccion_id': 'arduino-led-serie', 'paso': 1})[0] == 403, 'progreso sin CSRF'
assert pedir('POST', P, {'leccion_id': 'arduino-led-serie', 'paso': 1, 'usuario_id': 1}, csrf)[0] == 422
e, d = pedir('POST', P, {'leccion_id': 'arduino-led-serie', 'paso': 2, 'vistos': [0, 1]}, csrf)
assert e == 200 and d['progreso']['estado'] == 'en-curso', ('visita', e, d)
e, d = pedir('POST', P, {'leccion_id': 'arduino-led-serie', 'paso': 2, 'completada': True}, csrf)
assert e == 200 and d['progreso']['estado'] == 'completada', ('reto superado', e, d)
assert pedir('DELETE', '/api/aula/sesion', None, csrf)[0] == 204 and not cookie
assert pedir('GET', B)[0] == 401
assert pedir('GET', P)[0] == 401
e, d = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}); assert e == 200
assert pedir('GET', B)[1]['borrador']['codigo'] == codigo, 'recuperar borrador'
p = progreso()
assert p['ultima'] == 'arduino-led-serie' and p['lecciones'][0]['estado'] == 'completada' and p['lecciones'][0]['paso'] == 2, p
pedir('DELETE', '/api/aula/sesion', None, d['csrf'])
print('Prueba funcional del aula: salud, registro ' + ('abierto' if conf['registro_abierto'] else 'cerrado')
      + ', cookies Secure/HttpOnly, origen, CSRF, inscripción, borrador, progreso y compilación real: OK')
