"""Ensayo optativo con dos bases efímeras, pg_dump -Fc y pg_restore del mismo servidor."""
import os
import subprocess
from contextlib import ExitStack
from io import StringIO
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from app import inactividad, migraciones
from app.reconciliar_copia import reconciliar

URL = os.getenv('AULA_TEST_DATABASE_URL')
ENSAYAR = os.getenv('GITHUB_ACTIONS') == 'true' or os.getenv('AULA_ENSAYAR_RESTAURACION') == '1'
pytestmark = pytest.mark.skipif(not URL or not ENSAYAR,
                                reason='requiere PostgreSQL de pruebas con permiso CREATEDB y cliente compatible')


def test_restaurar_y_reconciliar(tmp_path):
    with psycopg.connect(URL, autocommit=True) as admin, ExitStack() as recursos:
        def crear(prefijo):
            nombre = prefijo + uuid4().hex
            nombre_sql = sql.Identifier(nombre)
            admin.execute(sql.SQL('CREATE DATABASE {}').format(nombre_sql))
            recursos.callback(admin.execute, sql.SQL('DROP DATABASE {}').format(nombre_sql))
            return make_conninfo(URL, dbname=nombre)

        origen = crear('aula_ensayo_')
        destino = crear('aula_inspeccion_')
        migraciones.aplicar(origen)
        live = recursos.enter_context(psycopg.connect(origen, autocommit=True))
        copia = recursos.enter_context(psycopg.connect(destino, autocommit=True))
        cuentas = []
        for alias in ('Baja', 'Activa'):
            uid, fecha = live.execute("""INSERT INTO usuarios(correo,nombre,hash_clave,correo_verificado_en,ultimo_acceso)
                VALUES (%s,%s,'$argon2id$ensayo',now(),now()-interval '25 months') RETURNING id,creado_en""",
                                      (alias.lower()+'@example.invalid', alias)).fetchone()
            cuentas.append((uid, fecha))
            live.execute("INSERT INTO inscripciones VALUES (%s,'course-arduino',now())", (uid,))
            live.execute("INSERT INTO progreso_lecciones(usuario_id,leccion_id,paso) VALUES (%s,'arduino-led-serie',3)", (uid,))
            live.execute("INSERT INTO borradores(usuario_id,leccion_id,codigo) VALUES (%s,'arduino-led-serie',%s)", (uid,alias))

        dump = tmp_path / 'anterior.dump'
        subprocess.run(['pg_dump', '-Fc', '-f', dump, '-d', origen], check=True)
        uid, fecha = cuentas[0]
        ref, = live.execute("""INSERT INTO avisos_inactividad(usuario_id,estado,acreditado_en)
            VALUES (%s,'acreditado',now()-interval '31 days') RETURNING referencia""", (uid,)).fetchone()
        assert inactividad.gestionar(live, 'eliminar', ref)
        registro = tmp_path / 'bajas-confirmadas.csv'
        registro.write_text(f'usuario_id,creado_en\n{uid},{fecha.isoformat()}\n')
        subprocess.run(['pg_restore','--exit-on-error','--no-owner','-d', destino,dump], check=True)

        def contenido(db):
            return db.execute("""SELECT u.id,u.nombre,i.curso_id,b.codigo,p.paso FROM usuarios u
                JOIN inscripciones i ON i.usuario_id=u.id JOIN borradores b ON b.usuario_id=u.id
                JOIN progreso_lecciones p ON p.usuario_id=u.id ORDER BY u.id""").fetchall()

        antes = contenido(copia)
        assert len(antes) == 2 and len(contenido(live)) == 1
        with registro.open() as f:
            assert reconciliar(copia, f) == 1
        assert contenido(copia) == antes
        invalido = registro.read_text() + f'{cuentas[1][0]},2000-01-01T00:00:00+00:00\n'
        with pytest.raises(ValueError, match='Identidad'):
            reconciliar(copia, StringIO(invalido), aplicar=True)
        assert contenido(copia) == antes
        with registro.open() as f, pytest.raises(ValueError, match='aislada'):
            reconciliar(live, f, aplicar=True)
        with registro.open() as f:
            assert reconciliar(copia, f, aplicar=True) == 1
        with registro.open() as f:
            assert reconciliar(copia, f, aplicar=True) == 0
        assert contenido(copia) == contenido(live) == [(cuentas[1][0], 'Activa','course-arduino','Activa',3)]
        assert not copia.execute('SELECT 1 FROM usuarios WHERE id=%s',(uid,)).fetchall()
