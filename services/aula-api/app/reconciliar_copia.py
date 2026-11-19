"""Aplica bajas confirmadas a una base aislada de inspección del aula."""
import argparse
import csv
import os
from datetime import datetime

import psycopg


def leer(archivo):
    filas = csv.DictReader(archivo)
    if filas.fieldnames != ['usuario_id', 'creado_en']:
        raise ValueError('Cabecera de bajas incorrecta')
    for fila in filas:
        uid = int(fila['usuario_id'])
        fecha = datetime.fromisoformat(fila['creado_en'])
        if uid <= 0 or fecha.tzinfo is None or None in fila:
            raise ValueError('Registro de baja inválido')
        yield uid, fecha


def reconciliar(db, archivo, aplicar=False):
    total = 0
    with db.transaction():
        nombre, = db.execute('SELECT current_database()').fetchone()
        if not nombre.startswith('aula_inspeccion_'):
            raise ValueError('Se requiere una base aislada aula_inspeccion_*')
        for uid, fecha in leer(archivo):
            fila = db.execute('SELECT creado_en, rol, correo FROM usuarios WHERE id=%s FOR UPDATE', (uid,)).fetchone()
            if not fila:
                continue
            if fila[:2] != (fecha, 'estudiante'):
                raise ValueError('Identidad o rol distinto: revisar la copia y el registro externo')
            total += 1
            if aplicar:
                db.execute('DELETE FROM registros_pendientes WHERE correo=%s', (fila[2],))
                db.execute('DELETE FROM usuarios WHERE id=%s', (uid,))
    return total


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('registro', type=argparse.FileType('r', encoding='utf-8'))
    parser.add_argument('--aplicar', action='store_true')
    args = parser.parse_args()
    with psycopg.connect(os.environ['AULA_INSPECCION_URL'], autocommit=True) as db:
        print('Cuentas coincidentes:', reconciliar(db, args.registro, args.aplicar))
