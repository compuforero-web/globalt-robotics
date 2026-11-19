"""Registro de adultos: autorizaciones con evidencia, verificación de correo, recuperación y transición de cuentas.

Contra PostgreSQL real (la base indicada se VACÍA). Cuentas ficticias @example.com; textos de PRUEBA.
Uso: AULA_TEST_DATABASE_URL=postgresql://... python -m pytest -q services/aula-api/tests
"""
import hashlib
import logging
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from email import message_from_bytes, policy
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import correo, cuentas, documentos, migraciones
from app.config import Config
from app.main import COOKIE, crear_app

URL = os.environ.get('AULA_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='requiere AULA_TEST_DATABASE_URL (PostgreSQL de pruebas)')
ORIGEN = 'http://aula.test'
CLAVE = 'clave-de-adulto-123'
BUZON = []


@pytest.fixture(scope='module', autouse=True)
def base_limpia():
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    migraciones.aplicar(URL)
    os.environ['AULA_PERMITIR_TEXTOS_PRUEBA'] = 'true'
    documentos.cargar_prueba(URL)


@pytest.fixture(autouse=True)
def sin_limites():
    sql('DELETE FROM intentos')
    BUZON.clear()


def config(**cambios):
    base = dict(database_url=URL, origenes=frozenset({ORIGEN}), cookie_segura=False, inactividad_min=120,
                duracion_max_horas=168, max_fallos_correo=5, max_fallos_ip=30, max_registros_ip=100, ventana_min=15,
                registro_abierto=True, correo_modo='smtp', smtp_host='buzon.invalid', correo_remitente='aula@example.com',
                url_publica='https://aula.test', permitir_textos_prueba=True)
    base.update(cambios)
    return Config(**base)


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


def solicitud(correo_, **cambios):
    datos = {'nombre': 'Adulta Ficticia', 'correo': correo_, 'clave': CLAVE, 'mayor_de_edad': True,
             'terminos': 'prueba-1', 'datos': 'prueba-1', 'curso': 'course-web'}
    datos.update(cambios)
    return {k: v for k, v in datos.items() if v is not None}


def enlace(destino, accion):
    texto = next(m[2] for m in reversed(BUZON) if m[0] == destino)
    return re.search(r'(https://aula\.test/aula/\S*)#' + accion + r'=([A-Za-z0-9_-]+)', texto).groups()


def contar(tabla, donde='true', *p):
    return sql(f'SELECT count(*) FROM {tabla} WHERE {donde}', *p)[0][0]


# ---------------------------------------------------------------- registro cerrado por defecto
def test_registro_cerrado_sin_decision_correo_o_documentos():
    assert Config(database_url=URL, origenes=frozenset({ORIGEN}), cookie_segura=True, inactividad_min=1,
                  duracion_max_horas=1, max_fallos_correo=1, max_fallos_ip=1, max_registros_ip=1, ventana_min=1)\
        .correo_modo == 'desactivado'
    casos = [dict(registro_abierto=False), dict(correo_modo='desactivado'), dict(smtp_host=''),
             dict(url_publica=''), dict(permitir_textos_prueba=False)]   # sin textos aprobados no hay documentos
    for cambios in casos:
        with cliente(**cambios) as c:
            assert c.get('/api/aula/config').json()['registro_abierto'] is False, cambios
            r = c.post('/api/aula/registro', json=solicitud('cerrado@example.com'))
            assert r.status_code == 403, cambios
    assert not BUZON and contar('registros_pendientes') == 0 and contar('usuarios') == 0
    with cliente() as c:
        conf = c.get('/api/aula/config').json()
        assert conf['registro_abierto'] is True and conf['recuperacion'] is True
        assert conf['documentos']['terminos']['version'] == 'prueba-1' and conf['documentos']['datos']['prueba'] is True
        assert conf['documentos']['terminos']['finalidad'] != conf['documentos']['datos']['finalidad']


def test_documento_consultable_exacto_e_inmutable():
    with cliente() as c:
        d = c.get('/api/aula/documentos/datos/prueba-1').json()
        assert d['texto'].startswith('TEXTO PROVISIONAL SOLO PARA PRUEBAS') and d['prueba'] is True
        assert d['sha256'] == hashlib.sha256(d['texto'].encode()).hexdigest()
        assert c.get('/api/aula/documentos/datos/no-existe').status_code == 404
        assert c.get('/api/aula/documentos/otro/prueba-1').status_code == 422
    with cliente(permitir_textos_prueba=False) as c:   # en producción los textos de prueba no se sirven
        assert c.get('/api/aula/documentos/datos/prueba-1').status_code == 404
    with pytest.raises(psycopg.errors.RaiseException):
        sql("UPDATE documentos_legales SET texto = texto || ' cambio' WHERE version = 'prueba-1'")
    with pytest.raises(psycopg.errors.RaiseException):
        sql("DELETE FROM documentos_legales WHERE version = 'prueba-1'")
    with pytest.raises(ValueError):
        documentos.cargar(URL, 'datos', 'prueba-1', 'Otro', 'Otra', 'Un texto distinto para la misma versión.', False)
    with pytest.raises(ValueError):   # un texto de prueba no se activa sin permiso explícito
        documentos.cargar(URL, 'datos', 'prueba-2', 'Título', 'Finalidad', 'Texto de prueba número dos, ficticio.', False)
        documentos.activar(URL, 'datos', 'prueba-2', permitir_prueba=False)


# ---------------------------------------------------------------- alta de adulto
def test_solo_adultos_con_aceptacion_expresa_y_datos_minimos():
    with cliente() as c:
        for cambios in (dict(mayor_de_edad=False), dict(mayor_de_edad=None), dict(mayor_de_edad='true'),
                        dict(terminos=None), dict(datos=None), dict(cedula='123'), dict(telefono='300'),
                        dict(fecha_nacimiento='2000-01-01'), dict(rol='administrador')):
            assert c.post('/api/aula/registro', json=solicitud('menor@example.com', **cambios)).status_code == 422, cambios
        r = c.post('/api/aula/registro', json=solicitud('menor@example.com', datos='otra-version'))
        assert r.status_code == 409
    assert not BUZON and contar('registros_pendientes') == 0 and contar('usuarios') == 0


def test_alta_verificada_con_evidencia_y_curso_elegido():
    with cliente() as c:
        r = c.post('/api/aula/registro', json=solicitud('Adulta@Example.com', nombre='  Alias   Robótico '))
        assert r.status_code == 202 and 'set-cookie' not in r.headers
        assert contar('usuarios') == 0 and contar('registros_pendientes') == 1   # aún no hay cuenta
        destino, asunto, texto, tipo = BUZON[-1]
        assert destino == 'adulta@example.com' and tipo == 'verificacion' and CLAVE not in texto
        pagina, token = enlace('adulta@example.com', 'verificar')
        assert pagina == 'https://aula.test/aula/?curso=course-web'           # el curso elegido viaja en el enlace
        assert c.post('/api/aula/sesion', json={'correo': 'adulta@example.com', 'clave': CLAVE}).status_code == 401
        mala = c.post('/api/aula/cuenta/verificar', json={'token': token, 'clave': 'otra-clave-1234'})
        assert mala.status_code == 401 and contar('usuarios') == 0
        ok = c.post('/api/aula/cuenta/verificar', json={'token': token, 'clave': CLAVE})
        assert ok.status_code == 200 and ok.json()['curso_id'] == 'course-web' and ok.json()['pendientes'] == []
        assert ok.json()['usuario'] == {'nombre': 'Alias Robótico', 'correo': 'adulta@example.com', 'rol': 'estudiante'}
        assert c.get('/api/aula/sesion').status_code == 200
        h = {'X-CSRF-Token': ok.json()['csrf']}
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-web'}, headers=h).status_code == 201
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-web'}, headers=h).status_code == 200   # repetida
        # Enlace reutilizado
        assert c.post('/api/aula/cuenta/verificar', json={'token': token, 'clave': CLAVE}).status_code == 410
    u = sql("SELECT id, origen, correo_verificado_en IS NOT NULL, mayor_edad_declarada_en FROM usuarios WHERE correo = 'adulta@example.com'")[0]
    assert u[1] == 'registro' and u[2] and u[3] is not None
    evidencia = sql('SELECT a.tipo, a.version, a.sha256 = d.sha256, a.finalidad = d.finalidad, a.aceptada_en, a.via '
                    'FROM autorizaciones a JOIN documentos_legales d ON d.id = a.documento_id WHERE a.usuario_id = %s '
                    'ORDER BY a.tipo', u[0])
    assert [(e[0], e[1], e[2], e[3], e[5]) for e in evidencia] == [('datos', 'prueba-1', True, True, 'registro'),
                                                                  ('terminos', 'prueba-1', True, True, 'registro')]
    assert evidencia[0][4] == evidencia[1][4] == u[3]   # fecha de la acción expresa (envío del formulario)
    with pytest.raises(psycopg.errors.RaiseException):
        sql("UPDATE autorizaciones SET version = 'otra' WHERE usuario_id = %s", u[0])


def test_enlace_vencido_y_reenvio_con_limites():
    with cliente(correos_por_hora=3) as c:
        assert c.post('/api/aula/registro', json=solicitud('vence@example.com')).status_code == 202
        _, viejo = enlace('vence@example.com', 'verificar')
        sql("UPDATE registros_pendientes SET expira_en = now() - interval '1 second' WHERE correo = 'vence@example.com'")
        assert c.post('/api/aula/cuenta/verificar', json={'token': viejo, 'clave': CLAVE}).status_code == 410
        r = c.post('/api/aula/cuenta/reenviar', json={'correo': 'vence@example.com'})
        assert r.status_code == 202
        assert r.json() == c.post('/api/aula/cuenta/reenviar', json={'correo': 'nadie@example.com'}).json()
        _, nuevo = enlace('vence@example.com', 'verificar')
        assert nuevo != viejo and len(BUZON) == 2
        assert c.post('/api/aula/cuenta/reenviar', json={'correo': 'vence@example.com'}).status_code == 202
        assert len(BUZON) == 3   # tercer correo de la hora para esta dirección
        _, ultimo = enlace('vence@example.com', 'verificar')
        assert c.post('/api/aula/cuenta/reenviar', json={'correo': 'vence@example.com'}).status_code == 202
        assert len(BUZON) == 3   # límite por dirección: misma respuesta, ningún correo
        assert c.post('/api/aula/cuenta/verificar', json={'token': nuevo, 'clave': CLAVE}).status_code == 410   # sustituido
        assert c.post('/api/aula/cuenta/verificar', json={'token': ultimo, 'clave': CLAVE}).status_code == 200
    with cliente(max_correos_ip=2) as c:
        sql('DELETE FROM intentos')
        for _ in range(2):
            assert c.post('/api/aula/cuenta/reenviar', json={'correo': 'x@example.com'}).status_code == 202
        assert c.post('/api/aula/cuenta/reenviar', json={'correo': 'y@example.com'}).status_code == 429


def test_correo_duplicado_no_revela_ni_crea_nada():
    cuentas.crear(URL, 'existe@example.com', 'Cuenta Existente', CLAVE)
    with cliente() as c:
        a = c.post('/api/aula/registro', json=solicitud('existe@example.com', clave='intento-ajeno-123'))
        b = c.post('/api/aula/registro', json=solicitud('libre@example.com'))
        assert a.status_code == b.status_code == 202 and a.json() == b.json()
        assert BUZON[0][3] == 'aviso-cuenta-existente' and '#' not in BUZON[0][2] and '?curso=course-web' in BUZON[0][2]
    assert contar('registros_pendientes', "correo = 'existe@example.com'") == 0
    with cliente() as c:   # la contraseña original sigue valiendo; la del intento, no
        assert c.post('/api/aula/sesion', json={'correo': 'existe@example.com', 'clave': 'intento-ajeno-123'}).status_code == 401
        assert c.post('/api/aula/sesion', json={'correo': 'existe@example.com', 'clave': CLAVE}).status_code == 200


def test_correo_ajeno_no_permite_quedarse_con_la_cuenta():
    with cliente() as c:
        c.post('/api/aula/registro', json=solicitud('victima@example.com', clave='clave-del-atacante'))
        _, del_atacante = enlace('victima@example.com', 'verificar')
        c.post('/api/aula/registro', json=solicitud('victima@example.com'))
        _, propio = enlace('victima@example.com', 'verificar')
        # La víctima abre el enlace del atacante: sin su contraseña no se crea nada.
        assert c.post('/api/aula/cuenta/verificar', json={'token': del_atacante, 'clave': CLAVE}).status_code == 401
        assert c.post('/api/aula/cuenta/verificar', json={'token': propio, 'clave': CLAVE}).status_code == 200
        assert c.post('/api/aula/cuenta/verificar', json={'token': del_atacante, 'clave': 'clave-del-atacante'}).status_code == 410
    assert contar('registros_pendientes', "correo = 'victima@example.com'") == 1   # solo la usada (se purga luego)


def test_fallo_del_envio_no_guarda_nada_y_se_puede_reintentar(caplog):
    caplog.set_level(logging.DEBUG)

    def caido(*_):
        raise correo.ErrorEnvio('SMTPServerDisconnected')
    with cliente(enviar=caido) as c:
        r = c.post('/api/aula/registro', json=solicitud('reintento@example.com'))
        assert r.status_code == 503 and 'inténtalo de nuevo' in r.json()['detail']
    assert contar('registros_pendientes', "correo = 'reintento@example.com'") == 0
    assert contar('usuarios', "correo = 'reintento@example.com'") == 0
    with cliente() as c:
        assert c.post('/api/aula/registro', json=solicitud('reintento@example.com')).status_code == 202
        _, token = enlace('reintento@example.com', 'verificar')
        assert c.post('/api/aula/cuenta/verificar', json={'token': token, 'clave': CLAVE}).status_code == 200
    # El envío real a un servidor inexistente falla sin dejar el enlace ni la clave en los registros.
    real = config(smtp_host='127.0.0.1', smtp_puerto=_puerto_libre(), smtp_tls='ninguno', smtp_clave='clave-smtp-secreta')
    with pytest.raises(correo.ErrorEnvio):
        correo.enviar(real, 'x@example.com', 'Asunto', 'Enlace https://aula.test/aula/#verificar=SECRETO123', 'verificacion')
    assert 'SECRETO123' not in caplog.text and 'clave-smtp-secreta' not in caplog.text
    assert 'No se pudo enviar el correo de verificacion (ConnectionRefusedError)' in caplog.text


# ---------------------------------------------------------------- recuperación
def test_recuperacion_un_solo_uso_cierra_sesiones():
    cuentas.crear(URL, 'olvido@example.com', 'Olvidadiza', CLAVE)
    with cliente() as vieja:
        assert vieja.post('/api/aula/sesion', json={'correo': 'olvido@example.com', 'clave': CLAVE}).status_code == 200
        with cliente() as c:
            a = c.post('/api/aula/cuenta/recuperar', json={'correo': 'olvido@example.com', 'curso': 'course-python'})
            b = c.post('/api/aula/cuenta/recuperar', json={'correo': 'no-existe@example.com'})
            assert a.status_code == b.status_code == 202 and a.json() == b.json()
            assert [m[0] for m in BUZON] == ['olvido@example.com'] and BUZON[0][3] == 'recuperacion'
            pagina, token = enlace('olvido@example.com', 'restablecer')
            assert pagina == 'https://aula.test/aula/?curso=course-python'
            r = c.post('/api/aula/cuenta/restablecer', json={'token': token, 'clave': 'olvido@example.com'})
            assert r.status_code == 422                                             # el enlace sigue sirviendo
            assert c.post('/api/aula/cuenta/restablecer', json={'token': token, 'clave': 'corta'}).status_code == 422
            r = c.post('/api/aula/cuenta/restablecer', json={'token': token, 'clave': 'nueva-clave-segura-1'})
            assert r.status_code == 200 and r.json()['usuario']['correo'] == 'olvido@example.com'
            assert c.get('/api/aula/sesion').status_code == 200
            assert c.post('/api/aula/cuenta/restablecer', json={'token': token, 'clave': 'otra-mas-segura-2'}).status_code == 410
        assert vieja.get('/api/aula/sesion').status_code == 401                     # sesiones anteriores cerradas
    with cliente() as c:
        assert c.post('/api/aula/sesion', json={'correo': 'olvido@example.com', 'clave': CLAVE}).status_code == 401
        assert c.post('/api/aula/sesion', json={'correo': 'olvido@example.com', 'clave': 'nueva-clave-segura-1'}).status_code == 200
        c.post('/api/aula/cuenta/recuperar', json={'correo': 'olvido@example.com'})
        _, token = enlace('olvido@example.com', 'restablecer')
        sql("UPDATE enlaces_recuperacion SET expira_en = now() - interval '1 second' WHERE usado_en IS NULL")
        assert c.post('/api/aula/cuenta/restablecer', json={'token': token, 'clave': 'otra-mas-segura-2'}).status_code == 410
        assert c.post('/api/aula/cuenta/restablecer', json={'token': 'x' * 43, 'clave': 'otra-mas-segura-2'}).status_code == 410
    assert sql("SELECT correo_verificado_en IS NOT NULL FROM usuarios WHERE correo = 'olvido@example.com'")[0][0]
    with cliente(correo_modo='desactivado') as c:
        assert c.post('/api/aula/cuenta/recuperar', json={'correo': 'olvido@example.com'}).status_code == 503


def test_fallo_de_envio_en_recuperacion_misma_respuesta():
    cuentas.crear(URL, 'sin-envio@example.com', 'Sin Envio', CLAVE)

    def caido(*_):
        raise correo.ErrorEnvio('x')
    with cliente(enviar=caido) as c:
        assert c.post('/api/aula/cuenta/recuperar', json={'correo': 'sin-envio@example.com'}).status_code == 202
    with cliente() as c:   # reintento
        assert c.post('/api/aula/cuenta/recuperar', json={'correo': 'sin-envio@example.com'}).status_code == 202
        _, token = enlace('sin-envio@example.com', 'restablecer')
        assert c.post('/api/aula/cuenta/restablecer', json={'token': token, 'clave': 'clave-tras-fallo-1'}).status_code == 200


# ---------------------------------------------------------------- cuentas existentes
def test_cuenta_existente_sin_autorizaciones_historicas_acepta_al_entrar():
    cuentas.crear(URL, 'antigua@example.com', 'Antigua', CLAVE)
    uid = sql("SELECT id FROM usuarios WHERE correo = 'antigua@example.com'")[0][0]
    sql("UPDATE usuarios SET origen = 'anterior' WHERE id = %s", uid)
    assert contar('autorizaciones', 'usuario_id = %s', uid) == 0
    with cliente() as c:
        r = c.post('/api/aula/sesion', json={'correo': 'antigua@example.com', 'clave': CLAVE})
        assert r.status_code == 200 and [p['tipo'] for p in r.json()['pendientes']] == ['terminos', 'datos']
        h = {'X-CSRF-Token': r.json()['csrf']}
        assert c.get('/api/aula/mis-cursos').status_code == 403
        assert c.post('/api/aula/inscripciones', json={'curso_id': 'course-web'}, headers=h).status_code == 403
        assert c.post('/api/aula/cuenta/autorizar', json={'terminos': 'prueba-1'}, headers=h).status_code == 409
        assert c.post('/api/aula/cuenta/autorizar', json={'terminos': 'prueba-1', 'datos': 'prueba-1'}).status_code == 403
        r = c.post('/api/aula/cuenta/autorizar', json={'terminos': 'prueba-1', 'datos': 'prueba-1'}, headers=h)
        assert r.status_code == 200 and r.json() == {'pendientes': []}
        assert c.get('/api/aula/mis-cursos').status_code == 200
    assert sql('SELECT array_agg(via), bool_and(aceptada_en > now() - interval \'1 minute\') FROM autorizaciones '
               'WHERE usuario_id = %s', uid)[0] == (['cuenta-existente', 'cuenta-existente'], True)
    with cliente(permitir_textos_prueba=False) as c:   # sin documentos vigentes no se exige nada (como hoy)
        r = c.post('/api/aula/sesion', json={'correo': 'existe@example.com', 'clave': CLAVE})
        assert r.json()['pendientes'] == [] and c.get('/api/aula/mis-cursos').status_code == 200


def test_menor_no_crea_registros_y_registro_no_pide_datos_sensibles():
    # La salida de menor ocurre en el navegador antes de enviar nada (ver e2e); el servidor exige la declaración.
    antes = (contar('usuarios'), contar('registros_pendientes'))
    with cliente() as c:
        assert c.post('/api/aula/registro', json=solicitud('menor2@example.com', mayor_de_edad=False)).status_code == 422
    assert (contar('usuarios'), contar('registros_pendientes')) == antes and not BUZON
    columnas = {f[0] for f in sql("SELECT column_name FROM information_schema.columns WHERE table_name IN "
                                  "('usuarios', 'registros_pendientes')")}
    assert not columnas & {'cedula', 'documento', 'telefono', 'fecha_nacimiento', 'nacimiento'}


# ---------------------------------------------------------------- SMTP real contra el buzón de pruebas
def _puerto_libre():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def test_smtp_con_buzon_de_pruebas_local(tmp_path):
    puerto = _puerto_libre()
    buzon = subprocess.Popen([sys.executable, str(Path(__file__).resolve().parents[1] / 'dev/buzon_pruebas.py'),
                              str(tmp_path), '127.0.0.1', str(puerto)], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                socket.create_connection(('127.0.0.1', puerto), 0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        real = config(smtp_host='127.0.0.1', smtp_puerto=puerto, smtp_tls='ninguno')
        with TestClient(crear_app(real), base_url='http://aula.test') as c:
            c.headers.update({'Origin': ORIGEN})
            (tmp_path / 'FALLAR').touch()
            assert c.post('/api/aula/registro', json=solicitud('smtp@example.com')).status_code == 503
            (tmp_path / 'FALLAR').unlink()
            assert c.post('/api/aula/registro', json=solicitud('smtp@example.com')).status_code == 202
            mensajes = sorted(tmp_path.glob('*.eml'))
            assert len(mensajes) == 1
            m = message_from_bytes(mensajes[0].read_bytes(), policy=policy.default)
            assert m['To'] == 'smtp@example.com' and m['From'] == 'aula@example.com'
            token = re.search(r'#verificar=([A-Za-z0-9_-]+)', m.get_content())[1]
            assert c.post('/api/aula/cuenta/verificar', json={'token': token, 'clave': CLAVE}).status_code == 200
    finally:
        buzon.terminate()
        buzon.wait()


# ---------------------------------------------------------------- actualización desde la versión anterior
def test_actualizacion_desde_0005_conserva_cuentas_y_avances(tmp_path, monkeypatch):
    with psycopg.connect(URL, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    anteriores = tmp_path / 'migrations'
    anteriores.mkdir()
    for f in sorted(migraciones.CARPETA.glob('*.sql'))[:5]:
        shutil.copy(f, anteriores)
    monkeypatch.setattr(migraciones, 'CARPETA', anteriores)
    assert migraciones.aplicar(URL)[-1] == '0005_catalogo.sql'
    from app import seguridad
    sql("INSERT INTO usuarios (correo, nombre, hash_clave) VALUES ('previa@example.com', 'Previa', %s)", seguridad.hash_clave(CLAVE))
    uid = sql("SELECT id FROM usuarios WHERE correo = 'previa@example.com'")[0][0]
    sql("INSERT INTO inscripciones (usuario_id, curso_id) VALUES (%s, 'course-arduino'), (%s, 'course-web'), (%s, 'course-python')", uid, uid, uid)
    sql("INSERT INTO progreso_lecciones (usuario_id, leccion_id, paso, pasos_vistos, completada_en, superada_en) VALUES "
        "(%s, 'arduino-led-serie', 2, 7, now(), now()), (%s, 'web-rejilla', 1, 3, NULL, NULL), (%s, 'python-variables', 0, 1, now(), now())",
        uid, uid, uid)
    sql("INSERT INTO borradores (usuario_id, leccion_id, codigo) VALUES (%s, 'arduino-led-serie', 'void setup(){}')", uid)
    antes = sql('SELECT leccion_id, paso, pasos_vistos, completada_en FROM progreso_lecciones ORDER BY 1')
    monkeypatch.undo()
    assert migraciones.aplicar(URL) == ['0006_registro_adultos.sql', '0007_inactividad.sql']
    assert sql('SELECT leccion_id, paso, pasos_vistos, completada_en FROM progreso_lecciones ORDER BY 1') == antes
    assert sql('SELECT origen, correo_verificado_en, mayor_edad_declarada_en FROM usuarios WHERE id = %s', uid) == [('anterior', None, None)]
    assert contar('autorizaciones') == 0
    with cliente(registro_abierto=False) as c:   # registro cerrado y sin documentos: todo sigue igual
        assert c.get('/api/aula/config').json() == {'registro_abierto': False, 'recuperacion': True, 'documentos': {}}
        r = c.post('/api/aula/sesion', json={'correo': 'previa@example.com', 'clave': CLAVE})
        assert r.status_code == 200 and r.json()['pendientes'] == []
        cursos = {x['id']: x for x in c.get('/api/aula/mis-cursos').json()['cursos']}
        assert set(cursos) == {'course-arduino', 'course-web', 'course-python'}
        assert cursos['course-arduino']['progreso']['lecciones'][0]['estado'] == 'completada'
        assert cursos['course-web']['progreso']['ultima'] == 'web-rejilla'
        assert c.get('/api/aula/borradores/arduino-led-serie').json()['borrador']['codigo'] == 'void setup(){}'
    cuentas.crear(URL, 'nueva-consola@example.com', 'Nueva Consola', CLAVE)
    assert sql("SELECT origen FROM usuarios WHERE correo = 'nueva-consola@example.com'") == [('consola',)]
