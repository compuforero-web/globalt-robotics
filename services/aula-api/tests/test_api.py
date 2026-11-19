"""Pruebas de la API del aula contra PostgreSQL real. Cuentas ficticias (@example.com).

Uso: AULA_TEST_DATABASE_URL=postgresql://... python -m pytest -q services/aula-api/tests
La base indicada se VACÍA (DROP SCHEMA public): usa una base de pruebas dedicada.
"""
import os
import re

os.environ.setdefault('AULA_PERMITIR_TEXTOS_PRUEBA', 'true')   # solo para cargar los textos de prueba en esta base

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import documentos, migraciones
from app.config import Config
from app.main import COOKIE, crear_app

URL = os.environ.get('AULA_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='requiere AULA_TEST_DATABASE_URL (PostgreSQL de pruebas)')
ORIGEN = 'http://aula.test'
CLAVE = 'clave-de-prueba-123'


def config(**cambios):
    base = dict(database_url=URL, origenes=frozenset({ORIGEN}), cookie_segura=False, inactividad_min=120,
                duracion_max_horas=168, max_fallos_correo=5, max_fallos_ip=30, max_registros_ip=50, ventana_min=15,
                registro_abierto=True, correo_modo='smtp', smtp_host='buzon.invalid', correo_remitente='aula@example.com',
                url_publica='http://aula.test', permitir_textos_prueba=True)
    base.update(cambios)
    return Config(**base)


@pytest.fixture(scope='module', autouse=True)
def base_limpia():
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    assert migraciones.aplicar(URL) == ['0001_inicial.sql', '0002_borradores.sql', '0003_compilaciones.sql',
                                       '0004_progreso.sql', '0005_catalogo.sql', '0006_registro_adultos.sql', '0007_inactividad.sql',
                                       '0008_bajas_registradas.sql', '0009_politica_datos.sql']
    assert migraciones.aplicar(URL) == []          # reproducible e idempotente
    documentos.cargar_prueba(URL)                  # textos PROVISIONALES de prueba, versión prueba-1


BUZON = []   # correos «enviados» en las pruebas: (destino, asunto, texto, tipo)


def capturar(destino, asunto, texto, tipo):
    BUZON.append((destino, asunto, texto, tipo))


def cliente(enviar=capturar, **cambios):
    c = TestClient(crear_app(config(**cambios), enviar_correo=enviar), base_url='http://aula.test')
    c.headers.update({'Origin': ORIGEN})
    return c


def sql(consulta, *params):
    with psycopg.connect(URL, autocommit=True) as c:
        cursor = c.execute(consulta, params)
        return cursor.fetchall() if cursor.description else []


def solicitar(c, correo, nombre='Estudiante Ficticio', clave=CLAVE, **extra):
    return c.post('/api/aula/registro', json={'nombre': nombre, 'correo': correo, 'clave': clave, 'mayor_de_edad': True,
                                              'terminos': 'prueba-1', 'datos': 'prueba-1', 'politica': 'prueba-1', **extra})


def ultimo_enlace(destino, accion):
    texto = next(m[2] for m in reversed(BUZON) if m[0] == destino.lower())
    return re.search('#' + accion + '=([A-Za-z0-9_-]+)', texto)[1]


def registrar(c, correo, nombre='Estudiante Ficticio', **extra):
    """Alta completa: solicitud + enlace del correo + contraseña. Devuelve la respuesta de verificar (o el error)."""
    r = solicitar(c, correo, nombre, **extra)
    if r.status_code != 202:
        return r
    return c.post('/api/aula/cuenta/verificar', json={'token': ultimo_enlace(correo, 'verificar'), 'clave': CLAVE})


def test_registro_crea_estudiante_y_sesion():
    with cliente() as c:
        r = registrar(c, 'Ana.Prueba@Example.com', '  Ana   Prueba ')
        assert r.status_code == 200
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
        assert registrar(c, 'dup@example.com').status_code == 200
        r = solicitar(c, 'DUP@example.com')
        assert r.status_code == 202 and r.json() == solicitar(c, 'nuevo-dup@example.com').json()   # no revela nada
        assert BUZON[-2][3] == 'aviso-cuenta-existente' and '#' not in BUZON[-2][2]
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
        assert registrar(c, 'r1@example.com').status_code == 200
        assert registrar(c, 'r2@example.com').status_code == 200
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


def test_inscribir_catalogo_publico_completo():
    from pathlib import Path
    import json
    catalogo = Path(__file__).resolve().parents[3] / 'data/catalogo-inicial.json'
    esperados = {c['id'] for c in json.loads(catalogo.read_text())['courses']}
    with cliente() as c:
        recibidos = {curso['id'] for curso in c.get('/api/aula/cursos').json()['cursos']}
        assert esperados <= recibidos
        token = registrar(c, 'catalogo@example.com').json()['csrf']
        for curso_id in esperados:
            assert c.post('/api/aula/inscripciones', json={'curso_id': curso_id},
                          headers={'X-CSRF-Token': token}).status_code == 201
        assert {curso['id'] for curso in c.get('/api/aula/mis-cursos').json()['cursos']} == esperados


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
                                                      'arduino-ultrasonico-distancia', 'arduino-ultrasonico-alerta',
                                                      'arduino-l298n-direccion', 'arduino-l298n-velocidad', 'arduino-l298n-dos-motores',
                                                      'arduino-servo-posiciones', 'arduino-servo-barrido', 'arduino-evasor-decision', 'arduino-evasor-pista')}
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
        # Lecciones 5.1–5.3 (L298N): versión propia cada una; guardar una no toca las otras dos ni las ocho anteriores.
        assert c.put(rutas['arduino-l298n-velocidad'], json={'codigo': '// rampa v2', 'version_base': 1}, headers=h).json()['borrador']['version'] == 2
        assert c.put(rutas['arduino-l298n-dos-motores'], json={'codigo': '// dos v2', 'version_base': 1}, headers=h).json()['borrador']['version'] == 2
        direccion = c.get(rutas['arduino-l298n-direccion']).json()['borrador']
        assert (direccion['codigo'], direccion['version']) == ('// arduino-l298n-direccion', 1)
        assert c.get(rutas['arduino-l298n-velocidad']).json()['borrador']['codigo'] == '// rampa v2'
        assert c.get(rutas['arduino-ultrasonico-distancia']).json()['borrador']['version'] == 2
        assert c.get(rutas['arduino-ultrasonico-alerta']).json()['borrador']['version'] == 1
        r = c.put(rutas['arduino-l298n-direccion'], json={'codigo': 'otra', 'version_base': 2}, headers=h)
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == '// arduino-l298n-direccion'
        r = c.put(rutas['arduino-l298n-dos-motores'], json={'codigo': 'vieja', 'version_base': 1}, headers=h)
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == '// dos v2'
        # Lecciones 3.1 y 3.2 (servo): versión propia cada una; guardar una no toca la otra ni las once anteriores.
        assert c.put(rutas['arduino-servo-barrido'], json={'codigo': '// barrido v2', 'version_base': 1}, headers=h).json()['borrador']['version'] == 2
        posiciones = c.get(rutas['arduino-servo-posiciones']).json()['borrador']
        assert (posiciones['codigo'], posiciones['version']) == ('// arduino-servo-posiciones', 1)
        assert c.get(rutas['arduino-l298n-dos-motores']).json()['borrador']['codigo'] == '// dos v2'
        r = c.put(rutas['arduino-servo-posiciones'], json={'codigo': 'otra', 'version_base': 2}, headers=h)
        assert r.status_code == 409 and r.json()['borrador']['codigo'] == '// arduino-servo-posiciones'
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
        for desconocida in ('arduino-servo', 'ARDUINO-PWM-BRILLO', 'arduino-pwm-brillo-v2', 'ARDUINO-SERVO-BARRIDO',
                            'arduino-servo-posiciones-v2', 'arduino-evasor-servo-radar', 'arduino-potenciometro', 'arduino-boton', 'arduino-boton-flanco-v2',
                            'arduino-potenciometro-pwm-v2', 'arduino-ultrasonico', 'arduino-ultrasonico-distancia-v2',
                            'ARDUINO-ULTRASONICO-ALERTA', 'arduino-l298n', 'arduino-l298n-direccion-v2', 'ARDUINO-L298N-VELOCIDAD',
                            'arduino-l298n-dos-motores ', 'arduino-evasor-decision-v2', 'arduino-evasor-pista-v2'):
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


# ---------- Progreso del curso (declarativo) ----------
RUTA_P = '/api/aula/mis-cursos'


def progreso(c):
    curso = next(x for x in c.get(RUTA_P).json()['cursos'] if x['id'] == 'course-arduino')
    return curso['progreso']


def leccion(c, leccion_id):
    return next((x for x in progreso(c)['lecciones'] if x['leccion_id'] == leccion_id), None)


def test_progreso_vacio_y_formato():
    with cliente() as c:
        inscrito(c, 'prog.vacio@example.com')
        assert progreso(c) == {'evaluacion': 'navegador', 'ultima': None, 'lecciones': []}
        # El catálogo y los demás campos de «mis cursos» no cambian.
        curso = c.get(RUTA_P).json()['cursos'][0]
        assert set(curso) == {'id', 'titulo', 'laboratorio', 'inscrito_en', 'progreso'}


def test_progreso_requiere_sesion_csrf_origen_inscripcion_y_validacion():
    cuerpo = {'leccion_id': 'arduino-led-serie', 'paso': 1}
    with cliente() as c:
        assert c.post(RUTA_P, json=cuerpo).status_code == 401
        h = {'X-CSRF-Token': registrar(c, 'prog.sin@example.com').json()['csrf']}
        assert c.post(RUTA_P, json=cuerpo, headers=h).status_code == 403                     # sin inscripción
        c.post('/api/aula/inscripciones', json={'curso_id': 'course-arduino'}, headers=h)
        assert c.post(RUTA_P, json=cuerpo).status_code == 403                                # sin CSRF
        assert c.post(RUTA_P, json=cuerpo, headers={**h, 'Origin': 'https://atacante.example'}).status_code == 403
        assert c.post(RUTA_P, json=cuerpo, headers={**h, 'Origin': ''}).status_code == 403
        assert c.post(RUTA_P, json={**cuerpo, 'leccion_id': 'otra-leccion'}, headers=h).status_code == 404
        id_c = sql("SELECT id FROM usuarios WHERE correo = 'prog.sin@example.com'")[0][0]
        for malo in ({**cuerpo, 'usuario_id': id_c}, {**cuerpo, 'completada_en': '2026-01-01T00:00:00Z'},
                     {**cuerpo, 'paso': 31}, {**cuerpo, 'paso': -1}, {**cuerpo, 'paso': '2'}, {**cuerpo, 'paso': 1.5},
                     {**cuerpo, 'vistos': [0, 31]}, {**cuerpo, 'vistos': list(range(32))}, {**cuerpo, 'vistos': ['1']},
                     {**cuerpo, 'completada': 'true'}, {**cuerpo, 'completada': 1},
                     {**cuerpo, 'visto_en': '2026-01-01T00:00:00'}, {**cuerpo, 'visto_en': 'ayer'},
                     {**cuerpo, 'leccion_id': 'ARDUINO'}, {'paso': 1}):
            assert c.post(RUTA_P, json=malo, headers=h).status_code == 422, malo
        r = c.post(RUTA_P, content=b'{"leccion_id":"' + b'a' * 20000 + b'"}', headers={**h, 'Content-Type': 'application/json'})
        assert r.status_code == 413
        assert c.post(RUTA_P, content=b'leccion_id=arduino-led-serie', headers={**h, 'Content-Type': 'text/plain'}).status_code == 415
        assert progreso(c)['lecciones'] == []                                                 # nada se registró
        assert c.post(RUTA_P, json=cuerpo, headers=h).status_code == 200


def test_progreso_aislado_entre_estudiantes_y_lecciones():
    with cliente() as a, cliente() as b:
        ha, hb = inscrito(a, 'prog.a@example.com'), inscrito(b, 'prog.b@example.com')
        r = a.post(RUTA_P, json={'leccion_id': 'arduino-pwm-brillo', 'paso': 2, 'vistos': [0, 1], 'completada': True}, headers=ha)
        assert r.status_code == 200 and r.json()['evaluacion'] == 'navegador'
        assert r.json()['progreso']['estado'] == 'completada' and r.json()['progreso']['vistos'] == [0, 1, 2]
        assert progreso(b)['lecciones'] == [] and progreso(b)['ultima'] is None
        # El CSRF de A no sirve con la sesión de B (p. ej., navegador compartido tras cambiar de cuenta).
        assert b.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 0, 'completada': True}, headers=ha).status_code == 403
        assert progreso(b)['lecciones'] == []
        assert b.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 3}, headers=hb).status_code == 200
        # Una lección no toca las demás.
        assert [x['leccion_id'] for x in progreso(a)['lecciones']] == ['arduino-pwm-brillo']
        assert leccion(b, 'arduino-led-serie')['estado'] == 'en-curso'
        assert leccion(b, 'arduino-pwm-brillo') is None
        assert a.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 1}, headers=ha).status_code == 200
        assert leccion(a, 'arduino-led-serie')['estado'] == 'en-curso'
        assert leccion(a, 'arduino-pwm-brillo')['estado'] == 'completada'
        assert leccion(b, 'arduino-led-serie')['paso'] == 3
    assert sql("SELECT count(*) FROM progreso_lecciones p JOIN usuarios u ON u.id = p.usuario_id "
               "WHERE u.correo LIKE 'prog._@example.com'")[0][0] == 3


def test_progreso_leer_guardar_compilar_o_visitar_no_completa(socket_falso):
    with cliente(compilador_socket=socket_falso) as c:
        h = inscrito(c, 'prog.nocompleta@example.com')
        assert c.get(RUTA_B).status_code == 200
        assert c.put(RUTA_B, json={'codigo': 'void loop() {}'}, headers=h).status_code == 200
        assert c.post(RUTA_C, json=PROG, headers=h).status_code == 200
        assert progreso(c)['lecciones'] == []        # borradores y compilaciones no registran progreso
        for paso in range(6):                        # recorrer todos los pasos (incluidas las pistas) no completa
            assert c.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': paso, 'vistos': list(range(paso + 1))},
                          headers=h).json()['progreso']['estado'] == 'en-curso'
        datos = leccion(c, 'arduino-led-serie')
        assert datos['completada_en'] is None and datos['superada_en'] is None and datos['vistos'] == [0, 1, 2, 3, 4, 5]


def test_progreso_idempotente_permanente_y_sin_retroceso():
    L = 'arduino-servo-barrido'
    with cliente() as c:
        h = inscrito(c, 'prog.fusion@example.com')
        primero = c.post(RUTA_P, json={'leccion_id': L, 'paso': 2, 'vistos': [0, 1, 2], 'completada': True}, headers=h).json()['progreso']
        # Reenviar lo mismo (reintento tras fallo de red) no cambia nada.
        for _ in range(3):
            repetido = c.post(RUTA_P, json={'leccion_id': L, 'paso': 2, 'vistos': [0, 1, 2], 'completada': True}, headers=h).json()['progreso']
            assert repetido['completada_en'] == primero['completada_en'] and repetido['vistos'] == [0, 1, 2]
        # Una visita posterior sin «completada» no borra el reto superado; los pasos vistos se unen.
        r = c.post(RUTA_P, json={'leccion_id': L, 'paso': 4, 'vistos': [4]}, headers=h).json()['progreso']
        assert r['estado'] == 'completada' and r['completada_en'] == primero['completada_en'] and r['vistos'] == [0, 1, 2, 4] and r['paso'] == 4
        # Un avance pendiente antiguo (enviado tarde) suma pasos vistos pero no hace retroceder el paso actual.
        r = c.post(RUTA_P, json={'leccion_id': L, 'paso': 3, 'vistos': [3], 'visto_en': '2026-01-01T00:00:00Z'}, headers=h).json()['progreso']
        assert r['paso'] == 4 and r['vistos'] == [0, 1, 2, 3, 4]
        # Fechas en el futuro se acotan a «ahora»; muy antiguas, a 30 días.
        r = c.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 1, 'visto_en': '2099-01-01T00:00:00+00:00'}, headers=h).json()['progreso']
        assert r['visto_en'] < '2099'
        r = c.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 0, 'visto_en': '2000-01-01T00:00:00Z'}, headers=h).json()['progreso']
        assert r['paso'] == 1 and r['visto_en'] < '2099'
        # Superar de nuevo actualiza «superada_en» pero conserva la primera finalización.
        r = c.post(RUTA_P, json={'leccion_id': L, 'paso': 4, 'completada': True}, headers=h).json()['progreso']
        assert r['completada_en'] == primero['completada_en'] and r['superada_en'] >= primero['superada_en']
        assert sql("SELECT count(*) FROM progreso_lecciones p JOIN usuarios u ON u.id = p.usuario_id "
                   "WHERE u.correo = 'prog.fusion@example.com'")[0][0] == 2


def test_progreso_ultima_leccion_y_recuperacion_en_otro_navegador():
    with cliente() as uno:
        h = inscrito(uno, 'prog.otro@example.com')
        uno.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 5, 'completada': True}, headers=h)
        uno.post(RUTA_P, json={'leccion_id': 'arduino-evasor-pista', 'paso': 2, 'vistos': [0, 1]}, headers=h)
        assert uno.delete('/api/aula/sesion', headers=h).status_code == 204
        assert uno.get(RUTA_P).status_code == 401
        assert uno.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 0}, headers=h).status_code == 401
    with cliente() as otro:                          # otro navegador, nueva instancia
        h2 = entrar(otro, 'prog.otro@example.com')
        p = progreso(otro)
        assert p['ultima'] == 'arduino-evasor-pista'
        assert {x['leccion_id']: x['estado'] for x in p['lecciones']} == {'arduino-evasor-pista': 'en-curso', 'arduino-led-serie': 'completada'}
        assert leccion(otro, 'arduino-evasor-pista')['paso'] == 2 and leccion(otro, 'arduino-evasor-pista')['vistos'] == [0, 1, 2]
        otro.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 1}, headers=h2)
        assert progreso(otro)['ultima'] == 'arduino-led-serie'


def test_progreso_se_borra_con_la_cuenta_y_ignora_lecciones_retiradas():
    with cliente() as c:
        h = inscrito(c, 'prog.borrar@example.com')
        c.post(RUTA_P, json={'leccion_id': 'arduino-led-serie', 'paso': 0}, headers=h)
        uid = sql("SELECT id FROM usuarios WHERE correo = 'prog.borrar@example.com'")[0][0]
        sql("INSERT INTO progreso_lecciones (usuario_id, leccion_id) VALUES (%s, 'leccion-retirada')", uid)
        assert [x['leccion_id'] for x in progreso(c)['lecciones']] == ['arduino-led-serie']
        assert progreso(c)['ultima'] == 'arduino-led-serie'
    sql("DELETE FROM usuarios WHERE id = %s", uid)
    assert sql('SELECT count(*) FROM progreso_lecciones WHERE usuario_id = %s', uid)[0][0] == 0


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
        assert c.get('/api/aula/config').json()['registro_abierto'] is False
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


def registro_bajas(tmp_path):
    from app.registro_bajas import Registro
    registro = Registro(tmp_path, pruebas=True)   # destino independiente de PRUEBAS (carpeta temporal)
    registro.inicializar()
    return registro


def test_inactividad_aviso_y_reingreso(tmp_path):
    from app import correo, inactividad
    bajas = registro_bajas(tmp_path)
    email = 'alumna-inactiva@example.com'
    with cliente() as c, psycopg.connect(URL, autocommit=True) as db:
        assert registrar(c, email).status_code == 200
        uid = sql('SELECT id FROM usuarios WHERE correo=%s AND ultimo_acceso IS NOT NULL', email)[0][0]
        sql("UPDATE usuarios SET ultimo_acceso=now()-interval '25 months' WHERE id=%s", uid)

        def falla(*args):
            raise correo.ErrorEnvio()

        assert inactividad.avisar(db, config(), uid, falla) == 'fallido'
        ref = sql('SELECT referencia FROM avisos_inactividad WHERE usuario_id=%s', uid)[0][0]
        assert not inactividad.gestionar(db, 'acreditar', ref)
        assert inactividad.eliminar(db, bajas, ref) == 'sin cambio'
        assert inactividad.gestionar(db, 'invalidar', ref)
        buz = []
        envio = lambda *args: buz.append(args)
        assert inactividad.avisar(db, config(), uid, envio) == 'enviado'
        assert inactividad.avisar(db, config(), uid, envio) == 'sin cambio'
        assert len(buz) == 1 and buz[0][1] == email
        nuevo = sql('SELECT referencia FROM avisos_inactividad WHERE usuario_id=%s', uid)[0][0]
        assert not inactividad.gestionar(db, 'acreditar', ref)
        assert inactividad.gestionar(db, 'acreditar', nuevo)
        assert inactividad.eliminar(db, bajas, nuevo) == 'sin cambio'
        assert c.get('/api/aula/sesion').status_code == 200
        assert not sql('SELECT 1 FROM avisos_inactividad WHERE usuario_id=%s', uid)
        assert inactividad.eliminar(db, bajas, nuevo) == 'sin cambio'
        assert not bajas.leer().pendientes      # nada que no cumpla las condiciones llega a anotarse
        assert inactividad.avisar(db, config(), uid, envio) == 'sin cambio'


def test_limites_de_inactividad_y_supresion(tmp_path):
    from app import inactividad
    from app.registro_bajas import Registro, RegistroNoDisponible
    bajas = registro_bajas(tmp_path)
    email = 'cuenta-plazos@example.com'
    with cliente() as c, psycopg.connect(URL, autocommit=True) as db:
        assert registrar(c, email).status_code == 200
        uid = sql('SELECT id FROM usuarios WHERE correo=%s', email)[0][0]
        sql("INSERT INTO inscripciones(usuario_id,curso_id) VALUES (%s,'course-python')", uid)
        sql("UPDATE usuarios SET ultimo_acceso=NULL WHERE id=%s", uid)
        envio = lambda *args: None
        assert inactividad.avisar(db, config(), uid, envio) == 'sin cambio'
        sql("UPDATE usuarios SET ultimo_acceso=now()-interval '24 months'+interval '31 days' WHERE id=%s", uid)
        assert inactividad.avisar(db, config(), uid, envio) == 'sin cambio'
        sql("UPDATE usuarios SET ultimo_acceso=now()-interval '24 months'+interval '1 day' WHERE id=%s", uid)
        assert inactividad.avisar(db, config(), uid, envio) == 'enviado'
        ref = sql('SELECT referencia FROM avisos_inactividad WHERE usuario_id=%s', uid)[0][0]
        assert inactividad.gestionar(db, 'acreditar', ref)
        sql("UPDATE avisos_inactividad SET acreditado_en=now()-interval '31 days' WHERE referencia=%s", ref)
        assert inactividad.eliminar(db, bajas, ref) == 'sin cambio'
        sql("UPDATE usuarios SET ultimo_acceso=now()-interval '25 months' WHERE id=%s", uid)
        with pytest.raises(ValueError, match='registro externo'):
            inactividad.gestionar(db, 'eliminar', ref)          # la vía anterior ya no borra
        with pytest.raises(psycopg.errors.RaiseException, match='registro externo'):
            sql('DELETE FROM usuarios WHERE id=%s', uid)        # ni el SQL directo del procedimiento anterior
        with pytest.raises(RegistroNoDisponible, match='no está configurado'):
            inactividad.eliminar(db, Registro(''), ref)       # producción sin destino: bloqueada
        with pytest.raises(RegistroNoDisponible, match='independiente'):
            inactividad.eliminar(db, Registro(tmp_path), ref)  # una carpeta local no vale fuera de pruebas
        assert sql('SELECT 1 FROM usuarios WHERE id=%s', uid)
        assert inactividad.eliminar(db, bajas, ref) == 'aplicada'
        assert inactividad.eliminar(db, bajas, ref) == 'sin cambio'
        diario = bajas.leer()
        assert not diario.problemas and not diario.abiertas and len(diario.confirmadas) == 1
        assert diario.confirmadas[0]['usuario_id'] == uid
        assert email not in ''.join(p.read_text() for p in tmp_path.glob('*.json'))
        assert not sql('SELECT 1 FROM usuarios WHERE id=%s', uid)
        assert not sql('SELECT 1 FROM inscripciones WHERE usuario_id=%s', uid)
        assert not sql('SELECT 1 FROM registros_pendientes WHERE correo=%s', email)
        assert c.get('/api/aula/sesion').status_code == 401
