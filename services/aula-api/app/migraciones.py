"""Aplica migraciones SQL en orden, una sola vez, con suma de control y bloqueo consultivo.

Uso: AULA_DATABASE_URL=... python -m app.migraciones
"""
import hashlib
import os
from pathlib import Path

import psycopg

CARPETA = Path(__file__).resolve().parents[1] / 'migrations'
BLOQUEO = 74_201_611  # identificador arbitrario del bloqueo consultivo


def aplicar(url):
    aplicadas = []
    with psycopg.connect(url, autocommit=False) as conexion:
        conexion.execute('SELECT pg_advisory_xact_lock(%s)', (BLOQUEO,))
        conexion.execute('CREATE TABLE IF NOT EXISTS esquema_migraciones ('
                         'version TEXT PRIMARY KEY, suma TEXT NOT NULL, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())')
        previas = dict(conexion.execute('SELECT version, suma FROM esquema_migraciones').fetchall())
        for archivo in sorted(CARPETA.glob('*.sql')):
            texto = archivo.read_text(encoding='utf-8')
            suma = hashlib.sha256(texto.encode()).hexdigest()
            if archivo.stem in previas:
                if previas[archivo.stem] != suma:
                    raise RuntimeError(f'La migración {archivo.name} cambió después de aplicarse.')
                continue
            conexion.execute(texto)
            conexion.execute('INSERT INTO esquema_migraciones (version, suma) VALUES (%s, %s)', (archivo.stem, suma))
            aplicadas.append(archivo.name)
        conexion.commit()
    return aplicadas


if __name__ == '__main__':
    hechas = aplicar(os.environ['AULA_DATABASE_URL'])
    print('Migraciones aplicadas: ' + (', '.join(hechas) if hechas else 'ninguna (al día)'))
