"""Ensayo optativo con bases efímeras, pg_dump -Fc y pg_restore del mismo servidor.

Bajas reales con el registro externo de PRUEBAS (carpeta temporal) y cuentas ficticias (@example.invalid)."""
import os
import shutil
import subprocess
import sys
import threading
import time
from contextlib import ExitStack
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from app import inactividad, migraciones, registro_bajas
from app.reconciliar_copia import reconciliar
from app.registro_bajas import Registro, RegistroInvalido, RegistroNoDisponible

URL = os.getenv('AULA_TEST_DATABASE_URL')
ENSAYAR = os.getenv('GITHUB_ACTIONS') == 'true' or os.getenv('AULA_ENSAYAR_RESTAURACION') == '1'
pytestmark = pytest.mark.skipif(not URL or not ENSAYAR,
                                reason='requiere PostgreSQL de pruebas con permiso CREATEDB y cliente compatible')


@pytest.fixture
def entorno(tmp_path):
    """Crea bases efímeras (se borran al terminar) y un registro de bajas de pruebas inicializado."""
    with psycopg.connect(URL, autocommit=True) as admin, ExitStack() as recursos:
        def crear(prefijo, migrar=False):
            nombre = prefijo + uuid4().hex
            nombre_sql = sql.Identifier(nombre)
            admin.execute(sql.SQL('CREATE DATABASE {}').format(nombre_sql))
            recursos.callback(admin.execute, sql.SQL('DROP DATABASE {} WITH (FORCE)').format(nombre_sql))
            url = make_conninfo(URL, dbname=nombre)
            if migrar:
                migraciones.aplicar(url)
            return url, recursos.enter_context(psycopg.connect(url, autocommit=True, options='-c timezone=UTC'))

        def respaldar(origen, archivo):
            subprocess.run(['pg_dump', '-Fc', '-f', archivo, '-d', origen], check=True)

        def restaurar(archivo):
            url, db = crear('aula_inspeccion_')
            subprocess.run(['pg_restore', '--exit-on-error', '--no-owner', '-d', url, archivo], check=True)
            return db

        (tmp_path / 'registro').mkdir()
        registro = Registro(tmp_path / 'registro', pruebas=True)
        assert registro.inicializar()
        yield admin, crear, respaldar, restaurar, registro


def alta(db, alias, meses=25, dias_acreditado=31, aviso=True):
    """Cuenta ficticia con inscripción, borrador y progreso. Devuelve (id, creado_en, referencia del aviso)."""
    uid, fecha = db.execute("""INSERT INTO usuarios(correo,nombre,hash_clave,correo_verificado_en,ultimo_acceso)
        VALUES (%s,%s,'$argon2id$ensayo',now(),now()-make_interval(months=>%s)) RETURNING id,creado_en""",
                            (alias.lower() + '@example.invalid', alias, meses)).fetchone()
    db.execute("INSERT INTO inscripciones VALUES (%s,'course-arduino',now())", (uid,))
    db.execute("INSERT INTO progreso_lecciones(usuario_id,leccion_id,paso) VALUES (%s,'arduino-led-serie',3)", (uid,))
    db.execute("INSERT INTO borradores(usuario_id,leccion_id,codigo) VALUES (%s,'arduino-led-serie',%s)", (uid, alias))
    ref = None
    if aviso:
        ref, = db.execute("""INSERT INTO avisos_inactividad(usuario_id,estado,acreditado_en)
            VALUES (%s,'acreditado',now()-make_interval(days=>%s)) RETURNING referencia""",
                          (uid, dias_acreditado)).fetchone()
    return uid, fecha, ref


def contenido(db):
    return db.execute("""SELECT u.id,u.nombre,i.curso_id,b.codigo,p.paso FROM usuarios u
        JOIN inscripciones i ON i.usuario_id=u.id JOIN borradores b ON b.usuario_id=u.id
        JOIN progreso_lecciones p ON p.usuario_id=u.id ORDER BY u.id""").fetchall()


def existe(db, uid):
    return bool(db.execute('SELECT 1 FROM usuarios WHERE id=%s', (uid,)).fetchall())


def acceder(db, uid):
    """Un acceso autenticado, como lo registra la API (dispara la cancelación del expediente)."""
    db.execute("""INSERT INTO sesiones(id_hash,usuario_id,csrf,expira_en)
        VALUES (sha256(gen_random_uuid()::text::bytea),%s,repeat('c',32),now()+interval '1 hour')""", (uid,))


def interrumpir():
    raise KeyboardInterrupt


class FallaAl(Registro):
    """Destino de pruebas que falla (o simula la caída del proceso) al anotar un estado concreto."""

    def __init__(self, base, estado, error):
        super().__init__(base.ruta, pruebas=True)
        self.estado, self.error = estado, error

    def anotar(self, operacion, estado, *args, **kw):
        if estado == self.estado:
            raise self.error
        return super().anotar(operacion, estado, *args, **kw)


def test_baja_confirmada_se_aplica_al_restaurar_y_protege_otras_cuentas(entorno, tmp_path):
    admin, crear, respaldar, restaurar, registro = entorno
    origen, live = crear('aula_ensayo_', migrar=True)
    baja, fecha, ref = alta(live, 'Baja')
    activa, fecha_activa, _ = alta(live, 'Activa', meses=1, aviso=False)
    respaldar(origen, tmp_path / 'anterior.dump')

    assert inactividad.eliminar(live, registro, ref) == 'aplicada'
    diario = registro.leer()
    assert not diario.problemas and not diario.abiertas
    assert [(e['usuario_id'], e['creado_en'], e['motivo']) for e in diario.confirmadas] == [(baja, fecha.isoformat(), 'aplicada')]
    texto = ''.join(p.read_text() for p in registro.ruta.glob('*.json'))
    assert 'example.invalid' not in texto and 'Baja' not in texto and 'argon2' not in texto

    copia = restaurar(tmp_path / 'anterior.dump')
    antes = contenido(copia)
    assert len(antes) == 2 and len(contenido(live)) == 1
    assert reconciliar(copia, registro) == 1                     # simulación por defecto
    assert contenido(copia) == antes
    cli = subprocess.run([sys.executable, '-m', 'app.reconciliar_copia'], capture_output=True, text=True, check=True,
                         env={**os.environ, 'AULA_INSPECCION_URL': make_conninfo(URL, dbname=copia.info.dbname),
                              'AULA_BAJAS_REGISTRO': str(registro.ruta), 'AULA_BAJAS_REGISTRO_PRUEBAS': 'true'})
    assert cli.stdout.strip() == 'Cuentas coincidentes: 1' and contenido(copia) == antes
    with pytest.raises(ValueError, match='aislada'):
        reconciliar(live, registro, aplicar=True)
    assert reconciliar(copia, registro, aplicar=True) == 1
    assert reconciliar(copia, registro, aplicar=True) == 0       # volver a reconciliar no cambia nada
    assert contenido(copia) == contenido(live) == [(activa, 'Activa', 'course-arduino', 'Activa', 3)]
    assert copia.execute("SELECT estado FROM bajas_inactividad").fetchall() == [('aplicada',)]

    # Identidad distinta para el mismo id: se cancela toda la operación.
    otro = Registro(tmp_path / 'otro', pruebas=True)
    otro.ruta.mkdir()
    otro.inicializar()
    copia2 = restaurar(tmp_path / 'anterior.dump')
    falsa = uuid4()
    otro.anotar(falsa, 'pendiente', activa, fecha_activa.replace(year=2000), 1)
    otro.anotar(falsa, 'confirmada', activa, fecha_activa.replace(year=2000), 1, 'aplicada')
    for e in diario.pendientes.values():
        otro.anotar(e['operacion'], 'pendiente', e['usuario_id'], registro_bajas.fecha(e), e['base'])
        otro.anotar(e['operacion'], 'confirmada', e['usuario_id'], registro_bajas.fecha(e), e['base'], 'aplicada')
    with pytest.raises(ValueError, match='Identidad'):
        reconciliar(copia2, otro, aplicar=True)
    assert len(contenido(copia2)) == 2

    # Cuenta nueva con el mismo correo, creada después de la baja: una copia posterior la conserva.
    nueva, _, _ = alta(live, 'Baja', meses=0, aviso=False)
    assert nueva != baja
    respaldar(origen, tmp_path / 'posterior.dump')
    copia3 = restaurar(tmp_path / 'posterior.dump')
    assert reconciliar(copia3, registro, aplicar=True) == 0
    assert existe(copia3, nueva) and existe(copia3, activa) and not existe(copia3, baja)
    # Y la vía anterior por SQL directo no puede borrar una cuenta con aviso acreditado sin registro.
    _, _, ref2 = alta(live, 'Otra')
    with pytest.raises(psycopg.errors.RaiseException, match='registro externo'):
        live.execute('DELETE FROM usuarios u USING avisos_inactividad a WHERE a.usuario_id=u.id AND a.referencia=%s', (ref2,))


def test_fallo_del_destino_antes_de_borrar_conserva_la_cuenta(entorno):
    admin, crear, _, _, registro = entorno
    _, live = crear('aula_ensayo_', migrar=True)
    uid, _, ref = alta(live, 'Destino')

    # El comando del operador, como en producción sin destino configurado: se niega y no toca nada.
    entorno_api = {k: v for k, v in os.environ.items() if not k.startswith('AULA_BAJAS_')}
    cli = subprocess.run([sys.executable, '-m', 'app.inactividad', 'eliminar', str(ref)], capture_output=True, text=True,
                         env={**entorno_api, 'AULA_DATABASE_URL': make_conninfo(URL, dbname=live.info.dbname),
                              'AULA_ORIGENES': 'http://aula.test'})
    assert cli.returncode == 2 and 'no está configurado' in cli.stderr and 'example.invalid' not in cli.stderr + cli.stdout
    assert existe(live, uid)
    (registro.ruta / registro_bajas.MARCA).rename(registro.ruta / 'marca.apartada')
    with pytest.raises(RegistroNoDisponible):
        inactividad.eliminar(live, registro, ref)            # destino no operativo: no se prepara nada
    (registro.ruta / 'marca.apartada').rename(registro.ruta / registro_bajas.MARCA)
    assert not live.execute('SELECT 1 FROM bajas_inactividad').fetchall()

    with pytest.raises(RegistroNoDisponible, match='sigue activa'):
        inactividad.eliminar(live, FallaAl(registro, 'pendiente', OSError(5, 'Error de E/S')), ref)
    assert existe(live, uid) and len(contenido(live)) == 1
    assert live.execute('SELECT estado FROM bajas_inactividad').fetchall() == [('cancelada',)]
    assert not registro.leer().pendientes

    # Con el destino de vuelta, la misma referencia se aplica con normalidad.
    assert inactividad.eliminar(live, registro, ref) == 'aplicada'
    assert not existe(live, uid)


def test_caida_tras_borrar_se_recupera_con_la_base_original(entorno, tmp_path):
    admin, crear, respaldar, restaurar, registro = entorno
    origen, live = crear('aula_ensayo_', migrar=True)
    uid, _, ref = alta(live, 'Caida')
    activa, _, _ = alta(live, 'Activa', meses=1, aviso=False)
    respaldar(origen, tmp_path / 'anterior.dump')

    with pytest.raises(SystemExit):        # el proceso cae justo después del COMMIT, antes de confirmar fuera
        inactividad.eliminar(live, FallaAl(registro, 'confirmada', SystemExit(1)), ref)
    assert not existe(live, uid)
    diario = registro.leer()
    assert [e['usuario_id'] for e in diario.abiertas] == [uid] and not diario.confirmadas
    op = diario.abiertas[0]['operacion']

    # Ninguna copia se da por apta mientras la operación siga incierta.
    copia = restaurar(tmp_path / 'anterior.dump')
    with pytest.raises(RegistroInvalido, match='NO apta.*incierta'):
        reconciliar(copia, registro)
    # Resolver contra otra base (la copia) no decide nada: no es la base donde se ejecutó.
    assert inactividad.resolver(copia, registro) == [(op, 'requiere decisión: otra base')]
    perdida = Registro(tmp_path / 'sin-original', pruebas=True)
    shutil.copytree(registro.ruta, perdida.ruta)            # estado del registro si también se pierde la base

    # Base original disponible: la constancia local «aplicada» permite confirmar.
    assert inactividad.resolver(live, registro) == [(op, 'confirmada')]
    assert inactividad.resolver(live, registro) == []
    assert registro.leer().finales[op]['motivo'] == 'recuperada'
    assert reconciliar(copia, registro, aplicar=True) == 1
    assert contenido(copia) == contenido(live) == [(activa, 'Activa', 'course-arduino', 'Activa', 3)]

    # Base original perdida: el operador decide de forma explícita; la anotación pendiente sola no borra.
    copia2 = restaurar(tmp_path / 'anterior.dump')
    with pytest.raises(RegistroInvalido, match='incierta'):
        reconciliar(copia2, perdida, aplicar=True)
    assert len(contenido(copia2)) == 2
    entorno_cli = {'AULA_BAJAS_REGISTRO': str(perdida.ruta), 'AULA_BAJAS_REGISTRO_PRUEBAS': 'true'}
    with pytest.MonkeyPatch.context() as mp:
        for k, v in entorno_cli.items():
            mp.setenv(k, v)
        assert registro_bajas.main(['comprobar']) == 1
        with pytest.raises(SystemExit):
            registro_bajas.main(['decidir', op, '--baja'])           # exige declarar que falta la base original
        assert registro_bajas.main(['decidir', op, '--baja', '--sin-base-original']) == 0
        assert registro_bajas.main(['decidir', op, '--conservar', '--sin-base-original']) == 1
        assert registro_bajas.main(['comprobar']) == 0
    assert perdida.leer().finales[op]['motivo'] == 'decision_operador'
    assert reconciliar(copia2, perdida, aplicar=True) == 1
    assert contenido(copia2) == contenido(live)


def test_caida_o_conexion_perdida_antes_del_commit_conserva_la_cuenta(entorno):
    admin, crear, _, _, registro = entorno
    _, live = crear('aula_ensayo_', migrar=True)
    uid, _, ref = alta(live, 'Corte')

    with pytest.raises(KeyboardInterrupt):   # interrupción tras anotar fuera y antes de borrar
        inactividad.eliminar(live, registro, ref, pausa=interrumpir)
    pid = live.info.backend_pid
    with pytest.raises(psycopg.OperationalError):   # se pierde la conexión con PostgreSQL justo antes de borrar
        inactividad.eliminar(live, registro, ref,
                             pausa=lambda: admin.execute('SELECT pg_terminate_backend(%s)', (pid,)))
    assert live.broken
    assert len(registro.leer().abiertas) == 1   # la primera ya la cerró la segunda llamada al empezar
    nueva = psycopg.connect(make_conninfo(URL, dbname=live.info.dbname), autocommit=True)
    with nueva:
        assert existe(nueva, uid)
        [(op, resultado)] = inactividad.resolver(nueva, registro)
        assert resultado == 'cancelada'
        diario = registro.leer()
        assert not diario.abiertas and not diario.confirmadas
        assert {e['motivo'] for e in diario.finales.values()} == {'no_aplicada'} and len(diario.finales) == 2
        assert inactividad.eliminar(nueva, registro, ref) == 'aplicada'
        assert not existe(nueva, uid)


def test_reingreso_durante_la_operacion_conserva_la_cuenta(entorno):
    admin, crear, _, _, registro = entorno
    _, live = crear('aula_ensayo_', migrar=True)
    uid, _, ref = alta(live, 'Vuelve')
    with psycopg.connect(make_conninfo(URL, dbname=live.info.dbname), autocommit=True) as web:
        assert inactividad.eliminar(live, registro, ref, pausa=lambda: acceder(web, uid)) == 'cancelada'
    assert existe(live, uid) and len(contenido(live)) == 1
    diario = registro.leer()
    assert not diario.abiertas and not diario.confirmadas
    [final] = diario.finales.values()
    assert (final['estado'], final['motivo'], final['usuario_id']) == ('cancelada', 'condiciones', uid)
    assert live.execute('SELECT estado FROM bajas_inactividad').fetchall() == [('cancelada',)]
    assert inactividad.eliminar(live, registro, ref) == 'sin cambio'     # el expediente se canceló con el acceso


def test_dos_bajas_en_paralelo_y_repeticion(entorno):
    admin, crear, _, _, registro = entorno
    _, live = crear('aula_ensayo_', migrar=True)
    uid, _, ref = alta(live, 'Paralela')
    url = make_conninfo(URL, dbname=live.info.dbname)
    resultados, errores = [], []

    def ejecutar(espera):
        try:
            with psycopg.connect(url, autocommit=True, options='-c timezone=UTC') as db:
                resultados.append(inactividad.eliminar(db, registro, ref, pausa=lambda: time.sleep(espera)))
        except Exception as e:     # noqa: BLE001 - se comprueba abajo
            errores.append(e)

    hilos = [threading.Thread(target=ejecutar, args=(1.0,)), threading.Thread(target=ejecutar, args=(0,))]
    hilos[0].start()
    time.sleep(0.3)
    hilos[1].start()
    for h in hilos:
        h.join(30)
    assert not errores and sorted(resultados) == ['aplicada', 'sin cambio']
    assert inactividad.eliminar(live, registro, ref) == 'sin cambio'
    diario = registro.leer()
    assert not diario.problemas and not diario.abiertas and len(diario.finales) == len(diario.confirmadas) == 1
    assert not existe(live, uid)
