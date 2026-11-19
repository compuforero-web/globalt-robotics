"""Progreso de las prácticas de Desarrollo Web (course-web) y Python desde Cero (course-python).

Contra PostgreSQL real, igual que test_api.py (la base indicada se VACÍA). Cuentas ficticias @example.com.
Los cursos course-web y course-python los crea la migración 0005 (catálogo, otra rama). Mientras no exista, se
insertan AQUÍ, solo en la preparación de estas pruebas, con los mismos identificadores.
"""
import os

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import migraciones
from app.config import Config
from app.main import LECCIONES, PRACTICAS, crear_app

URL = os.environ.get('AULA_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='requiere AULA_TEST_DATABASE_URL (PostgreSQL de pruebas)')
ORIGEN = 'http://aula.test'
CLAVE = 'clave-de-prueba-123'
RUTA = '/api/aula/mis-cursos'
WEB = [f'web-{x}' for x in ('estructura', 'rejilla', 'adaptable', 'eventos', 'publicacion')]
PY = [f'python-{x}' for x in ('variables', 'condicionales', 'funciones', 'archivos', 'asistente')]


@pytest.fixture(scope='module', autouse=True)
def base_limpia():
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    migraciones.aplicar(URL)
    with psycopg.connect(URL, autocommit=True) as c:   # solo preparación de la prueba (hasta integrar 0005)
        c.execute("INSERT INTO cursos (id, titulo, ruta_laboratorio) VALUES "
                  "('course-web', 'Desarrollo Web (prueba)', 'games/laboratorio-web/index.html'), "
                  "('course-python', 'Python desde Cero (prueba)', 'games/laboratorio-python/index.html') "
                  "ON CONFLICT (id) DO NOTHING")


def cliente():
    config = Config(database_url=URL, origenes=frozenset({ORIGEN}), cookie_segura=False, inactividad_min=120,
                    duracion_max_horas=168, max_fallos_correo=5, max_fallos_ip=30, max_registros_ip=100,
                    ventana_min=15, registro_abierto=True)
    c = TestClient(crear_app(config), base_url='http://aula.test')
    c.headers.update({'Origin': ORIGEN})
    return c


def sql(consulta, *params):
    with psycopg.connect(URL, autocommit=True) as c:
        cursor = c.execute(consulta, params)
        return cursor.fetchall() if cursor.description else []


def cuenta(c, correo, *cursos):
    # Alta por consola (sin depender del registro público y su correo) e inicio de sesión.
    from app import cuentas
    cuentas.crear(URL, correo, 'Estudiante Ficticio', CLAVE)
    r = c.post('/api/aula/sesion', json={'correo': correo, 'clave': CLAVE})
    h = {'X-CSRF-Token': r.json()['csrf']}
    for curso in cursos:
        assert c.post('/api/aula/inscripciones', json={'curso_id': curso}, headers=h).status_code == 201
    return h


def progreso(c, curso):
    return next(x for x in c.get(RUTA).json()['cursos'] if x['id'] == curso)['progreso']


def estados(c, curso):
    return {x['leccion_id']: x['estado'] for x in progreso(c, curso)['lecciones']}


def test_identificadores_con_espacio_de_nombres_propio():
    assert len(PRACTICAS) == 10 and sorted(PRACTICAS) == sorted(WEB + PY)
    assert {PRACTICAS[x] for x in WEB} == {'course-web'} and {PRACTICAS[x] for x in PY} == {'course-python'}
    assert not set(PRACTICAS) & set(LECCIONES)                     # Arduino intacto, sin colisiones
    assert len(LECCIONES) == 15 and set(LECCIONES.values()) == {'course-arduino'}


def test_progreso_vacio_por_curso_y_arduino_sin_cambios():
    with cliente() as c:
        cuenta(c, 'pr.vacio@example.com', 'course-web', 'course-python', 'course-arduino')
        for curso in ('course-web', 'course-python', 'course-arduino'):
            assert progreso(c, curso) == {'evaluacion': 'navegador', 'ultima': None, 'lecciones': []}


def test_visita_no_completa_y_finalizacion_solo_declarada():
    with cliente() as c:
        h = cuenta(c, 'pr.visita@example.com', 'course-web', 'course-python')
        for lid in (WEB[0], PY[0]):
            r = c.post(RUTA, json={'leccion_id': lid, 'paso': 0, 'vistos': [0]}, headers=h)
            assert r.status_code == 200 and r.json()['progreso']['estado'] == 'en-curso'
            assert r.json()['progreso']['completada_en'] is None and r.json()['evaluacion'] == 'navegador'
        r = c.post(RUTA, json={'leccion_id': PY[0], 'paso': 0, 'completada': True}, headers=h)
        assert r.json()['progreso']['estado'] == 'completada'
        assert estados(c, 'course-web') == {WEB[0]: 'en-curso'}
        assert estados(c, 'course-python') == {PY[0]: 'completada'}
        assert progreso(c, 'course-python')['ultima'] == PY[0] and progreso(c, 'course-web')['ultima'] == WEB[0]


def test_inscripcion_por_curso_sesion_csrf_y_origen():
    cuerpo = {'leccion_id': WEB[1], 'paso': 0}
    with cliente() as c:
        assert c.post(RUTA, json=cuerpo).status_code == 401
        h = cuenta(c, 'pr.permiso@example.com', 'course-python')
        r = c.post(RUTA, json=cuerpo, headers=h)                    # inscrito en Python, no en Web
        assert r.status_code == 403 and 'avance' in r.json()['detail']
        assert c.post(RUTA, json={**cuerpo, 'leccion_id': 'arduino-led-serie'}, headers=h).status_code == 403
        assert c.post(RUTA, json={**cuerpo, 'leccion_id': PY[1]}).status_code == 403                    # sin CSRF
        assert c.post(RUTA, json={**cuerpo, 'leccion_id': PY[1]}, headers={**h, 'Origin': 'https://otro.example'}).status_code == 403
        for malo in ('estructura', 'web-inexistente', 'python-otra'):                                    # sin espacio o desconocida
            assert c.post(RUTA, json={**cuerpo, 'leccion_id': malo}, headers=h).status_code == 404
        assert c.post(RUTA, json={**cuerpo, 'leccion_id': PY[1], 'usuario_id': 1}, headers=h).status_code == 422
        assert [x['id'] for x in c.get(RUTA).json()['cursos']] == ['course-python']
        assert progreso(c, 'course-python')['lecciones'] == []
        assert c.post(RUTA, json={**cuerpo, 'leccion_id': PY[1]}, headers=h).status_code == 200


def test_borradores_y_compilacion_siguen_siendo_solo_de_arduino():
    with cliente() as c:
        h = cuenta(c, 'pr.borrador@example.com', 'course-web', 'course-python')
        for lid in (WEB[0], PY[0]):
            assert c.get(f'/api/aula/borradores/{lid}').status_code == 404
            assert c.put(f'/api/aula/borradores/{lid}', json={'codigo': 'print(1)'}, headers=h).status_code == 404
        assert c.post('/api/aula/compilar', json={'codigo': 'void setup(){}'}, headers=h).status_code == 403


def test_dos_cuentas_separadas_y_csrf_cruzado():
    with cliente() as a, cliente() as b:
        ha = cuenta(a, 'pr.a@example.com', 'course-web', 'course-python')
        hb = cuenta(b, 'pr.b@example.com', 'course-web', 'course-python')
        a.post(RUTA, json={'leccion_id': WEB[2], 'paso': 0, 'completada': True}, headers=ha)
        assert b.post(RUTA, json={'leccion_id': WEB[3], 'paso': 0, 'completada': True}, headers=ha).status_code == 403
        b.post(RUTA, json={'leccion_id': PY[2], 'paso': 0}, headers=hb)
        assert estados(a, 'course-web') == {WEB[2]: 'completada'} and estados(a, 'course-python') == {}
        assert estados(b, 'course-web') == {} and estados(b, 'course-python') == {PY[2]: 'en-curso'}


def test_reintentos_duplicados_y_fallo_posterior_no_retroceden():
    with cliente() as c:
        h = cuenta(c, 'pr.dup@example.com', 'course-web')
        primero = c.post(RUTA, json={'leccion_id': WEB[4], 'paso': 0, 'completada': True}, headers=h).json()['progreso']
        for _ in range(3):   # reenvío de la cola tras un corte de red
            r = c.post(RUTA, json={'leccion_id': WEB[4], 'paso': 0, 'completada': True,
                                   'visto_en': primero['visto_en']}, headers=h).json()['progreso']
            assert r['completada_en'] == primero['completada_en']
        # Un reto fallido posterior solo vuelve a visitar: no quita la finalización.
        r = c.post(RUTA, json={'leccion_id': WEB[4], 'paso': 0}, headers=h).json()['progreso']
        assert r['estado'] == 'completada' and r['completada_en'] == primero['completada_en']
    assert sql("SELECT count(*) FROM progreso_lecciones p JOIN usuarios u ON u.id = p.usuario_id "
               "WHERE u.correo = 'pr.dup@example.com'")[0][0] == 1


def test_recuperacion_en_otro_navegador_tras_cerrar_sesion():
    with cliente() as uno:
        h = cuenta(uno, 'pr.otro@example.com', 'course-python')
        uno.post(RUTA, json={'leccion_id': PY[3], 'paso': 0, 'completada': True}, headers=h)
        assert uno.delete('/api/aula/sesion', headers=h).status_code == 204
        assert uno.post(RUTA, json={'leccion_id': PY[4], 'paso': 0}, headers=h).status_code == 401
    with cliente() as otro:
        otro.post('/api/aula/sesion', json={'correo': 'pr.otro@example.com', 'clave': CLAVE})
        assert estados(otro, 'course-python') == {PY[3]: 'completada'}
