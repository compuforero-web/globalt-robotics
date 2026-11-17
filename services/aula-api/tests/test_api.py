"""Pruebas de la API del aula contra PostgreSQL real. Cuentas ficticias (@example.com).

Uso: AULA_TEST_DATABASE_URL=postgresql://... python -m pytest -q services/aula-api/tests
La base indicada se VACÍA (DROP SCHEMA public): usa una base de pruebas dedicada.
"""
import os
import re

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import migraciones
from app.config import Config
from app.main import COOKIE, crear_app

URL = os.environ.get('AULA_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='requiere AULA_TEST_DATABASE_URL (PostgreSQL de pruebas)')
ORIGEN = 'http://aula.test'
CLAVE = 'clave-de-prueba-123'


def config(**cambios):
    base = dict(database_url=URL, origenes=frozenset({ORIGEN}), cookie_segura=False, inactividad_min=120,
                duracion_max_horas=168, max_fallos_correo=5, max_fallos_ip=30, max_registros_ip=50, ventana_min=15,
                registro_abierto=True)
    base.update(cambios)
    return Config(**base)


@pytest.fixture(scope='module', autouse=True)
def base_limpia():
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    assert migraciones.aplicar(URL) == ['0001_inicial.sql', '0002_borradores.sql', '0003_compilaciones.sql']
    assert migraciones.aplicar(URL) == []          # reproducible e idempotente


def cliente(**cambios):
    c = TestClient(crear_app(config(**cambios)), base_url='http://aula.test')
    c.headers.update({'Origin': ORIGEN})
    return c


def sql(consulta, *params):
    with psycopg.connect(URL, autocommit=True) as c:
        cursor = c.execute(consulta, params)
        return cursor.fetchall() if cursor.description else []


def registrar(c, correo, nombre='Estudiante Ficticio', **extra):
    return c.post('/api/aula/registro', json={'nombre': nombre, 'correo': correo, 'clave': CLAVE, **extra})


def test_registro_crea_estudiante_y_sesion():
    with cliente() as c:
        r = registrar(c, 'Ana.Prueba@Example.com', '  Ana   Prueba ')
        assert r.status_code == 201
        assert r.json()['usuario'] == {'nombre': 'Ana Prueba', 'correo': 'ana.prueba@example.com', 'rol': 'estudiante'}
        cookie = r.headers['set-cookie']
        assert 'HttpOnly' in cookie and 'SameSite=strict' in cookie and 'Path=/api/aula' in cookie
        assert c.get('/api/aula/sesion').json()['usuario']['correo'] == 'ana.prueba@example.com'
    fila = sql("SELECT hash_clave, rol FROM usuarios WHERE correo = 'ana.prueba@example.com'")[0]
    assert fila[0].startswith('$argon2id$v=19$m=65536,t=3,p=4$') and CLAVE not in fila[0]
    assert fila[1] == 'estudiante'
    token = re.search(COOKIE + r'=([^;]+)', cookie)[1]
    assert not sql('SELECT 1 FROM sesiones WHERE id_hash = %s', token.encode())   # solo se guarda la huella


def test_cookie_segura_en_produccion():
    with cliente(cookie_segura=True) as c:
        assert 'Secure' in registrar(c, 'segura@example.com').headers['set-cookie']


def test_registro_duplicado_y_datos_invalidos():
    with cliente() as c:
        assert registrar(c, 'dup@example.com').status_code == 201
        r = registrar(c, 'DUP@example.com')
        assert r.status_code == 409
        assert c.post('/api/aula/registro', json={'nombre': 'X', 'correo': 'no-es-correo', 'clave': 'corta'}).status_code == 422
        r = c.post('/api/aula/registro', json={'nombre': 'Valido', 'correo': 'v@example.com', 'clave': 'secreta-que-no-debe-salir'[:5]})
        assert r.status_code == 422 and 'secre' not in r.text            # no se devuelve lo recibido
        assert registrar(c, 'ctrl@example.com', 'Nombre‮raro').status_code == 422
        assert c.post('/api/aula/registro', json={'nombre': 'Igual', 'correo': 'igual@example.com',
                                                  'clave': 'igual@example.com'}).status_code == 422


def test_no_se_puede_pedir_rol_administrador():
    with cliente() as c:
        r = registrar(c, 'admin-intento@example.com', rol='administrador')
        assert r.status_code == 422
        r = c.post('/api/aula/registro', json={'nombre': 'Otro', 'correo': 'admin2@example.com', 'clave': CLAVE,
                                               'is_admin': True})
        assert r.status_code == 422
    assert not sql("SELECT 1 FROM usuarios WHERE correo LIKE 'admin%%'")
    assert not sql("SELECT 1 FROM usuarios WHERE rol <> 'estudiante'")


def test_acceso_contrasena_incorrecta_y_limite_de_intentos():
    with cliente(max_fallos_correo=3) as c:
        registrar(c, 'limite@example.com')
        c.cookies.clear()
        for _ in range(3):
            r = c.post('/api/aula/sesion', json={'correo': 'limite@example.com', 'clave': 'incorrecta-1234'})
            assert r.status_code == 401 and r.json()['detail'] == 'Correo o contraseña incorrectos.'
        r = c.post('/api/aula/sesion', json={'correo': 'limite@example.com', 'clave': CLAVE})
        assert r.status_code == 429 and 'retry-after' in r.headers   # bloqueado incluso con la clave correcta
        inexistente = c.post('/api/aula/sesion', json={'correo': 'nadie@example.com', 'clave': 'x'})
        assert inexistente.status_code == 401 and inexistente.json()['detail'] == 'Correo o contraseña incorrectos.'
    sql("DELETE FROM intentos WHERE tipo = 'acceso_correo'")
    with cliente() as c:
        r = c.post('/api/aula/sesion', json={'correo': 'LIMITE@example.com', 'clave': CLAVE})
        assert r.status_code == 200 and r.json()['csrf']


def test_limite_por_ip_y_de_registros():
    sql('DELETE FROM intentos')
    with cliente(max_fallos_ip=2) as c:
        for correo in ('a1@example.com', 'a2@example.com'):
            c.post('/api/aula/sesion', json={'correo': correo, 'clave': 'mala-clave-0'})
        assert c.post('/api/aula/sesion', json={'correo': 'a3@example.com', 'clave': 'x'}).status_code == 429
    sql('DELETE FROM intentos')
    with cliente(max_registros_ip=2) as c:
        assert registrar(c, 'r1@example.com').status_code == 201
        assert registrar(c, 'r2@example.com').status_code == 201
        assert registrar(c, 'r3@example.com').status_code == 429
    sql('DELETE FROM intentos')


def test_cierre_de_sesion_revoca_en_servidor():
    with cliente() as c:
        csrf = registrar(c, 'cierre@example.com').json()['csrf']
        token = c.cookies.get(COOKIE)
        assert c.delete('/api/aula/sesion').status_code == 403          # sin CSRF
        r = c.delete('/api/aula/sesion', headers={'X-CSRF-Token': csrf})
        assert r.status_code == 204 and 'Max-Age=0' in r.headers['set-cookie']
        assert c.get('/api/aula/sesion').status_code == 401
    with cliente() as otro:                                           # reutilizar la cookie robada no sirve
        otro.cookies.set(COOKIE, token, domain='aula.test', path='/api/aula')
        assert otro.get('/api/aula/mis-cursos').status_code == 401


def test_caducidad_por_inactividad_y_absoluta():
    with cliente() as c:
        registrar(c, 'caduca@example.com')
        assert c.get('/api/aula/mis-cursos').status_code == 200
        sql("UPDATE sesiones s SET ultimo_uso = now() - interval '121 minutes' FROM usuarios u "
            "WHERE u.id = s.usuario_id AND u.correo = 'caduca@example.com'")
        assert c.get('/api/aula/mis-cursos').status_code == 401
        c.cookies.clear()
        c.post('/api/aula/sesion', json={'correo': 'caduca@example.com', 'clave': CLAVE})
        assert c.get('/api/aula/sesion').status_code == 200
        sql("UPDATE sesiones s SET expira_en = now() - interval '1 second' FROM usuarios u "
            "WHERE u.id = s.usuario_id AND u.correo = 'caduca@example.com' AND s.revocada_en IS NULL")
        assert c.get('/api/aula/sesion').status_code == 401


def test_csrf_y_validacion_de_origen():
    with cliente() as c:
        csrf = registrar(c, 'csrf@example.com').json()['csrf']
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}).status_code == 403
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'},
                      headers={'X-CSRF-Token': 'x' * 43}).status_code == 403
        r = c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'},
                   headers={'X-CSRF-Token': csrf, 'Origin': 'https://atacante.example'})
        assert r.status_code == 403 and r.json()['detail'] == 'Origen no permitido.'
        sin_origen = c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'},
                            headers={'X-CSRF-Token': csrf, 'Origin': ''})
        assert sin_origen.status_code == 403
        r = c.post('/api/aula/inscripciones', content='curso_id=course-arduino',
                   headers={'X-CSRF-Token': csrf, 'Content-Type': 'application/x-www-form-urlencoded'})
        assert r.status_code == 415
        assert c.post('/api/aula/registro', json={'nombre': 'Ataque', 'correo': 'atk@example.com', 'clave': CLAVE},
                      headers={'Origin': 'https://atacante.example'}).status_code == 403
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'},
                      headers={'X-CSRF-Token': csrf}).status_code == 201
    assert not sql("SELECT 1 FROM usuarios WHERE correo = 'atk@example.com'")


def test_inscripcion_sin_duplicados_y_curso_inexistente():
    with cliente() as c:
        csrf = registrar(c, 'inscribe@example.com').json()['csrf']
        h = {'X-CSRF-Token': csrf}
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers=h).status_code == 201
        r = c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers=h)
        assert r.status_code == 200 and r.json()['nueva'] is False
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'curso-falso'}, headers=h).status_code == 404
        assert c.post('/api/aula/inscripciones', json={'curso_id': "x' OR 1=1 --"}, headers=h).status_code == 422
        cursos = c.get('/api/aula/mis-cursos').json()['cursos']
        assert [x['id'] for x in cursos] == ['course-arduino']
        assert cursos[0]['laboratorio'] == 'games/laboratorio-arduino/index.html'
    assert sql("SELECT count(*) FROM inscripciones i JOIN usuarios u ON u.id = i.usuario_id "
               "WHERE u.correo = 'inscribe@example.com'")[0][0] == 1


def test_separacion_entre_estudiantes():
    with cliente() as a, cliente() as b:
        csrf_a = registrar(a, 'estudiante.a@example.com', 'Estudiante A').json()['csrf']
        csrf_b = registrar(b, 'estudiante.b@example.com', 'Estudiante B').json()['csrf']
        a.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers={'X-CSRF-Token': csrf_a})
        assert b.get('/api/aula/mis-cursos').json()['cursos'] == []
        assert b.get('/api/aula/sesion').json()['usuario']['correo'] == 'estudiante.b@example.com'
        # El CSRF de A no sirve con la sesión de B.
        assert b.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'},
                      headers={'X-CSRF-Token': csrf_a}).status_code == 403
        # No hay parámetros de usuario: un campo extra para elegir usuario se rechaza.
        assert b.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino', 'usuario_id': 1},
                      headers={'X-CSRF-Token': csrf_b}).status_code == 422
        assert b.get('/api/aula/mis-cursos').json()['cursos'] == []
        assert len(a.get('/api/aula/mis-cursos').json()['cursos']) == 1


def test_persistencia_tras_reiniciar_la_aplicacion():
    with cliente() as c:
        csrf = registrar(c, 'persiste@example.com').json()['csrf']
        c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers={'X-CSRF-Token': csrf})
        token = c.cookies.get(COOKIE)
    with cliente() as nueva:   # nueva instancia y nuevo pool de conexiones
        nueva.cookies.set(COOKIE, token, domain='aula.test', path='/api/aula')
        assert [x['id'] for x in nueva.get('/api/aula/mis-cursos').json()['cursos']] == ['course-arduino']


def test_catalogo_publico_y_cabeceras():
    with cliente() as c:
        r = c.get('/api/aula/cursos')
        assert r.json()['cursos'][0]['id'] == 'course-arduino'
        assert r.headers['cache-control'] == 'no-store'
        assert c.get('/api/aula/mis-cursos').status_code == 401
        assert c.get('/docs').status_code == 404 and c.get('/openapi.json').status_code == 404
        r = c.post('/api/aula/sesion', content=b'{"correo":"' + b'a' * 20000 + b'"}', headers={'Content-Type': 'application/json'})
        assert r.status_code == 413


# ---------- Borradores de código del Laboratorio Arduino ----------
RUTA_B = '/api/aula/borradores/arduino-led-serie'


def inscrito(c, correo, nombre='Estudiante Ficticio'):
    csrf = registrar(c, correo, nombre).json()['csrf']
    c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers={'X-CSRF-Token': csrf})
    return {'X-CSRF-Token': csrf}


def entrar(c, correo):
    return {'X-CSRF-Token': c.post('/api/aula/sesion', json={'correo': correo, 'clave': CLAVE}).json()['csrf']}


def test_borrador_aislado_entre_estudiantes():
    with cliente() as a, cliente() as b:
        ha, hb = inscrito(a, 'borr.a@example.com'), inscrito(b, 'borr.b@example.com')
        r = a.put(RUTA_B, json={'codigo': 'void loop() { /* A */ }'}, headers=ha)
        assert r.status_code == 200 and r.json()['borrador']['version'] == 1
        assert b.get(RUTA_B).json() == {'borrador': None}
        # B no puede elegir el usuario ni escribir sobre el borrador de A.
        id_a = sql("SELECT id FROM usuarios WHERE correo = 'borr.a@example.com'")[0][0]
        assert b.put(RUTA_B, json={'codigo': 'x', 'usuario_id': id_a}, headers=hb).status_code == 422
        assert b.get(RUTA_B + '?usuario_id=%d' % id_a).json() == {'borrador': None}
        assert b.put(RUTA_B, json={'codigo': '// B'}, headers=hb).json()['borrador']['version'] == 1
        assert b.put(RUTA_B, json={'codigo': '// B2', 'version_base': 1}, headers=hb).status_code == 200
        assert a.get(RUTA_B).json()['borrador']['codigo'] == 'void loop() { /* A */ }'
        # El CSRF de A no sirve con la sesión de B.
        assert b.put(RUTA_B, json={'codigo': '// B3', 'version_base': 2}, headers=ha).status_code == 403
    assert sql("SELECT count(*) FROM borradores")[0][0] == 2


def test_borrador_requiere_sesion_csrf_origen_e_inscripcion():
    with cliente() as c:
        assert c.get(RUTA_B).status_code == 401
        h = {'X-CSRF-Token': registrar(c, 'borr.sin@example.com').json()['csrf']}
        assert c.get(RUTA_B).status_code == 403                       # sin inscripción
        assert c.put(RUTA_B, json={'codigo': 'x'}, headers=h).status_code == 403
        c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers=h)
        assert c.put(RUTA_B, json={'codigo': 'x'}).status_code == 403  # sin CSRF
        assert c.put(RUTA_B, json={'codigo': 'x'}, headers={**h, 'Origin': 'https://atacante.example'}).status_code == 403
        assert c.get('/api/aula/borradores/otra-leccion').status_code == 404
        assert c.put('/api/aula/borradores/otra-leccion', json={'codigo': 'x'}, headers=h).status_code == 404
        assert c.put(RUTA_B, json={'codigo': 'a' * 12001}, headers=h).status_code == 422
        assert c.put(RUTA_B, json={'codigo': 'a\x00b'}, headers=h).status_code == 422
        assert c.put(RUTA_B, json={'codigo': 'ñ' * 12000}, headers=h).status_code == 413   # cuerpo > 16 KB
        assert c.put(RUTA_B, json={'codigo': 'x', 'version_base': 0}, headers=h).status_code == 422
        assert c.get(RUTA_B).json() == {'borrador': None}
        assert c.put(RUTA_B, json={'codigo': 'a' * 12000}, headers=h).status_code == 200


def test_borrador_se_recupera_tras_cerrar_sesion_en_otro_navegador():
    codigo = 'void setup() {\n  Serial.begin(9600); // ñ «»\n}\n'
    with cliente() as c:
        h = inscrito(c, 'borr.vuelve@example.com')
        assert c.put(RUTA_B, json={'codigo': codigo}, headers=h).status_code == 200
        assert c.delete('/api/aula/sesion', headers=h).status_code == 204
        assert c.get(RUTA_B).status_code == 401
    with cliente() as otro:                                            # otro navegador, nueva instancia
        entrar(otro, 'borr.vuelve@example.com')
        b = otro.get(RUTA_B).json()['borrador']
        assert b['codigo'] == codigo and b['version'] == 1


def test_borrador_no_sobrescribe_version_mas_reciente():
    with cliente() as uno, cliente() as dos:
        h1 = inscrito(uno, 'borr.dos@example.com')
        h2 = entrar(dos, 'borr.dos@example.com')
        assert uno.put(RUTA_B, json={'codigo': 'v1'}, headers=h1).status_code == 200
        r = dos.put(RUTA_B, json={'codigo': 'otro'}, headers=h2)           # creía que no había copia
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == 'v1'
        assert dos.put(RUTA_B, json={'codigo': 'v2', 'version_base': 1}, headers=h2).json()['borrador']['version'] == 2
        r = uno.put(RUTA_B, json={'codigo': 'v1-bis', 'version_base': 1}, headers=h1)
        assert r.status_code == 409 and r.json()['borrador'] == {**r.json()['borrador'], 'codigo': 'v2', 'version': 2}
        assert uno.get(RUTA_B).json()['borrador']['codigo'] == 'v2'


def test_borradores_aislados_por_leccion():
    rutas = {l: '/api/aula/borradores/' + l for l in ('arduino-led-serie', 'arduino-protoboard-semaforo', 'arduino-pwm-brillo',
                                                      'arduino-boton-entrada', 'arduino-boton-flanco', 'arduino-potenciometro-pwm',
                                                      'arduino-ultrasonico-distancia', 'arduino-ultrasonico-alerta')}
    with cliente() as c, cliente() as otro:
        h = inscrito(c, 'borr.lecciones@example.com')
        ho = inscrito(otro, 'borr.lecciones.otro@example.com')
        for leccion, ruta in rutas.items():
            assert c.get(ruta).json() == {'borrador': None}
            assert c.put(ruta, json={'codigo': '// ' + leccion}, headers=h).json()['borrador']['version'] == 1
        # Guardar una lección no toca las demás; cada una lleva su propia versión.
        assert c.put(rutas['arduino-pwm-brillo'], json={'codigo': '// pwm v2', 'version_base': 1}, headers=h).status_code == 200
        primera = c.get(rutas['arduino-led-serie']).json()['borrador']
        assert (primera['codigo'], primera['version']) == ('// arduino-led-serie', 1)
        assert c.get(rutas['arduino-protoboard-semaforo']).json()['borrador']['codigo'] == '// arduino-protoboard-semaforo'
        assert c.get(rutas['arduino-pwm-brillo']).json()['borrador']['version'] == 2
        # Lecciones de pulsador (2.2 y 2.3): cada una con su borrador y su versión.
        assert c.put(rutas['arduino-boton-flanco'], json={'codigo': '// flanco v2', 'version_base': 1}, headers=h).status_code == 200
        assert c.get(rutas['arduino-boton-entrada']).json()['borrador'] == {**c.get(rutas['arduino-boton-entrada']).json()['borrador'],
                                                                            'codigo': '// arduino-boton-entrada', 'version': 1}
        r = c.put(rutas['arduino-boton-entrada'], json={'codigo': 'otra', 'version_base': 2}, headers=h)
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == '// arduino-boton-entrada'
        # Lección 2.4 (potenciómetro): versión propia; guardarla no toca las cinco anteriores.
        assert c.put(rutas['arduino-potenciometro-pwm'], json={'codigo': '// pot v2', 'version_base': 1}, headers=h).json()['borrador']['version'] == 2
        for otra in ('arduino-led-serie', 'arduino-protoboard-semaforo', 'arduino-boton-entrada'):
            assert c.get(rutas[otra]).json()['borrador']['version'] == 1
        # Lecciones 4.1 y 4.2 (HC-SR04): versión propia cada una; guardar una no toca la otra ni las seis anteriores.
        assert c.put(rutas['arduino-ultrasonico-distancia'], json={'codigo': '// ultra v2', 'version_base': 1}, headers=h).json()['borrador']['version'] == 2
        alerta = c.get(rutas['arduino-ultrasonico-alerta']).json()['borrador']
        assert (alerta['codigo'], alerta['version']) == ('// arduino-ultrasonico-alerta', 1)
        assert c.get(rutas['arduino-potenciometro-pwm']).json()['borrador']['version'] == 2
        r = c.put(rutas['arduino-ultrasonico-alerta'], json={'codigo': 'otra', 'version_base': 2}, headers=h)
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == '// arduino-ultrasonico-alerta'
        # Conflicto por lección: una versión vieja de la lección 3 no sobrescribe.
        r = c.put(rutas['arduino-pwm-brillo'], json={'codigo': 'viejo', 'version_base': 1}, headers=h)
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == '// pwm v2'
        # Otro estudiante no ve nada de estas lecciones.
        for ruta in rutas.values():
            assert otro.get(ruta).json() == {'borrador': None}
        assert otro.put(rutas['arduino-protoboard-semaforo'], json={'codigo': '// mío'}, headers=ho).status_code == 200
        assert c.get(rutas['arduino-protoboard-semaforo']).json()['borrador']['codigo'] == '// arduino-protoboard-semaforo'
        # Un identificador desconocido no crea filas.
        antes = sql("SELECT count(*) FROM borradores")[0][0]
        for desconocida in ('arduino-servo-posiciones', 'ARDUINO-PWM-BRILLO', 'arduino-pwm-brillo-v2',
                            'arduino-servo-barrido', 'arduino-potenciometro', 'arduino-boton', 'arduino-boton-flanco-v2',
                            'arduino-potenciometro-pwm-v2', 'arduino-ultrasonico', 'arduino-ultrasonico-distancia-v2',
                            'ARDUINO-ULTRASONICO-ALERTA', 'arduino-l298n-direccion'):
            assert c.put('/api/aula/borradores/' + desconocida, json={'codigo': 'x'}, headers=h).status_code == 404
            assert c.get('/api/aula/borradores/' + desconocida).status_code == 404
        assert sql("SELECT count(*) FROM borradores")[0][0] == antes


# ---------- Compilación a través del servicio existente (compilador falso por socket Unix) ----------
import json as _json
import socketserver
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler

FALSO = {'estado': 200, 'retraso': 0.0, 'peticiones': []}


class _Falso(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def address_string(self): return 'unix'

    def responder(self, estado, datos):
        cuerpo = _json.dumps(datos).encode()
        self.send_response(estado); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo))); self.end_headers(); self.wfile.write(cuerpo)

    def do_GET(self):
        self.responder(200, {'ok': True, 'version': {'compilador': 'avr-gcc falso'}})

    def do_POST(self):
        datos = _json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        FALSO['peticiones'].append((self.path, datos))
        time.sleep(FALSO['retraso'])
        if FALSO['estado'] == 200:
            self.responder(200, {'ok': True, 'hex': ':00000001FF', 'diagnosticos': [], 'salida': '',
                                 'memoria': {'flash': 1, 'flashMax': 2, 'ram': 1, 'ramMax': 2}})
        else:
            self.responder(FALSO['estado'], {'error': 'Directiva no permitida.'})


class _ServidorUnix(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


@pytest.fixture()
def socket_falso():
    carpeta = tempfile.mkdtemp()
    ruta = os.path.join(carpeta, 'compilador.sock')
    servidor = _ServidorUnix(ruta, _Falso)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    FALSO.update(estado=200, retraso=0.0, peticiones=[])
    yield ruta
    servidor.shutdown(); servidor.server_close()


RUTA_C = '/api/aula/compilar'
PROG = {'codigo': 'void setup() {}\nvoid loop() {}\n'}


def test_compilar_exige_sesion_inscripcion_csrf_y_origen(socket_falso):
    with cliente(compilador_socket=socket_falso) as c:
        assert c.post(RUTA_C, json=PROG).status_code == 401
        assert c.get('/api/aula/compilador/salud').status_code == 401
        h = {'X-CSRF-Token': registrar(c, 'comp.sin@example.com').json()['csrf']}
        r = c.post(RUTA_C, json=PROG, headers=h)
        assert r.status_code == 403 and 'Inscríbete' in r.json()['detail']
        assert c.get('/api/aula/compilador/salud').status_code == 403
        c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers=h)
        assert c.post(RUTA_C, json=PROG).status_code == 403                                  # sin CSRF
        assert c.post(RUTA_C, json=PROG, headers={'X-CSRF-Token': 'x' * 43}).status_code == 403  # CSRF falso
        assert c.post(RUTA_C, json=PROG, headers={**h, 'Origin': 'https://atacante.example'}).status_code == 403
        assert c.post(RUTA_C, json={**PROG, 'usuario_id': 1}, headers=h).status_code == 422
        assert c.post(RUTA_C, json={**PROG, 'placa': 'uno'}, headers=h).status_code == 422
        assert c.post(RUTA_C, json={'codigo': 'a' * 12001}, headers=h).status_code == 422
        assert FALSO['peticiones'] == []                                   # nada llegó al compilador
        assert c.get('/api/aula/compilador/salud').json()['ok'] is True
        r = c.post(RUTA_C, json=PROG, headers=h)
        assert r.status_code == 200 and r.json()['ok'] is True and r.json()['hex']
        assert FALSO['peticiones'] == [('/api/arduino/compilar', {'placa': 'nano', 'codigo': PROG['codigo']})]
    # Compilar no registra aprobaciones ni guarda el código.
    assert sql("SELECT count(*) FROM compilaciones c JOIN usuarios u ON u.id = c.usuario_id "
               "WHERE u.correo = 'comp.sin@example.com'")[0][0] == 1


def test_compilar_limite_por_estudiante_aunque_cambie_de_sesion(socket_falso):
    with cliente(compilador_socket=socket_falso, compilar_por_minuto=3) as c:
        h = inscrito(c, 'comp.limite@example.com')
        for _ in range(3):
            assert c.post(RUTA_C, json=PROG, headers=h).status_code == 200
        r = c.post(RUTA_C, json=PROG, headers=h)
        assert r.status_code == 429 and r.headers['retry-after'] == '60'
    with cliente(compilador_socket=socket_falso, compilar_por_minuto=3) as otra:   # nueva sesión, mismo estudiante
        h2 = entrar(otra, 'comp.limite@example.com')
        assert otra.post(RUTA_C, json=PROG, headers=h2).status_code == 429
    with cliente(compilador_socket=socket_falso, compilar_por_minuto=100, compilar_por_hora=3) as c3:
        h3 = entrar(c3, 'comp.limite@example.com')
        r = c3.post(RUTA_C, json=PROG, headers=h3)
        assert r.status_code == 429 and 'hora' in r.json()['detail']
    assert len(FALSO['peticiones']) == 3


def test_compilar_una_a_la_vez_por_estudiante_y_cola_global(socket_falso):
    app_cfg = dict(compilador_socket=socket_falso, compilar_simultaneos=1, compilar_max_espera=1, compilar_espera_s=0.3)
    with cliente(**app_cfg) as a:
        ha = inscrito(a, 'comp.cola.a@example.com')
        FALSO['retraso'] = 1.0
        resultados = []
        hilos = [threading.Thread(target=lambda: resultados.append(a.post(RUTA_C, json=PROG, headers=ha))) for _ in range(2)]
        for t in hilos: t.start(); time.sleep(0.1)
        for t in hilos: t.join()
        estados = sorted(r.status_code for r in resultados)
        assert estados == [200, 429], estados   # misma cuenta: la segunda no espera ni satura
        # Otro estudiante (misma API) mientras el turno está ocupado: espera 0,3 s y recibe «ocupado».
        b = TestClient(a.app, base_url='http://aula.test')
        b.headers.update({'Origin': ORIGEN})
        hb = inscrito(b, 'comp.cola.b@example.com')
        hilo = threading.Thread(target=lambda: resultados.append(a.post(RUTA_C, json=PROG, headers=ha)))
        hilo.start(); time.sleep(0.1)
        r = b.post(RUTA_C, json=PROG, headers=hb)
        hilo.join()
        assert r.status_code == 503 and 'ocupado' in r.json()['detail'] and r.headers['retry-after'] == '10'
        FALSO['retraso'] = 0.0
        assert b.post(RUTA_C, json=PROG, headers=hb).status_code == 200   # se recupera al quedar libre


def test_compilador_detenido_errores_y_recuperacion(socket_falso):
    with cliente(compilador_socket=socket_falso + '.no-existe', compilar_tiempo_s=0.5) as c:
        h = inscrito(c, 'comp.caido@example.com')
        r = c.post(RUTA_C, json=PROG, headers=h)
        assert r.status_code == 503 and 'no está disponible' in r.json()['detail']
        assert c.get('/api/aula/compilador/salud').status_code == 503
    with cliente(compilador_socket=socket_falso, compilar_tiempo_s=0.5) as c:
        h = entrar(c, 'comp.caido@example.com')
        FALSO['estado'] = 503
        assert c.post(RUTA_C, json=PROG, headers=h).status_code == 503
        FALSO['estado'] = 400
        r = c.post(RUTA_C, json=PROG, headers=h)
        assert r.status_code == 400 and r.json()['detail'] == 'Directiva no permitida.'
        FALSO.update(estado=200, retraso=1.5)
        r = c.post(RUTA_C, json=PROG, headers=h)
        assert r.status_code == 504 and 'tardó' in r.json()['detail']
        FALSO['retraso'] = 0.0
        time.sleep(1.2)
        assert c.post(RUTA_C, json=PROG, headers=h).status_code == 200      # recuperación
        assert c.get('/api/aula/compilador/salud').status_code == 200


def test_registro_cerrado_por_defecto_y_cuentas_por_consola():
    assert Config(database_url=URL, origenes=frozenset({ORIGEN}), cookie_segura=True, inactividad_min=1,
                  duracion_max_horas=1, max_fallos_correo=1, max_fallos_ip=1, max_registros_ip=1,
                  ventana_min=1).registro_abierto is False
    with cliente(registro_abierto=False) as c:
        assert c.get('/api/aula/config').json() == {'registro_abierto': False}
        r = registrar(c, 'cerrado@example.com')
        assert r.status_code == 403 and 'no está abierto' in r.json()['detail']
    assert not sql("SELECT 1 FROM usuarios WHERE correo = 'cerrado@example.com'")
    from app import cuentas
    assert cuentas.crear(URL, 'Consola.Prueba@Example.com', '  Estudiante   Consola ', CLAVE) == 'consola.prueba@example.com'
    with pytest.raises(ValueError):
        cuentas.crear(URL, 'consola.prueba@example.com', 'Otra', CLAVE)      # duplicada
    with pytest.raises(ValueError):
        cuentas.crear(URL, 'corta@example.com', 'Corta', 'corta')            # contraseña inválida
    with cliente(registro_abierto=False) as c:
        r = c.post('/api/aula/sesion', json={'correo': 'consola.prueba@example.com', 'clave': CLAVE})
        assert r.status_code == 200 and r.json()['usuario'] == {'nombre': 'Estudiante Consola',
                                                                 'correo': 'consola.prueba@example.com', 'rol': 'estudiante'}
