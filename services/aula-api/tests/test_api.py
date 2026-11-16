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
                duracion_max_horas=168, max_fallos_correo=5, max_fallos_ip=30, max_registros_ip=50, ventana_min=15)
    base.update(cambios)
    return Config(**base)


@pytest.fixture(scope='module', autouse=True)
def base_limpia():
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    assert migraciones.aplicar(URL) == ['0001_inicial.sql']
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
