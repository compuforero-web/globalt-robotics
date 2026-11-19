"""Aplica las bajas confirmadas del registro externo a una base aislada de inspección del aula.

Sin --aplicar solo cuenta. Antes de contar comprueba el registro: si está dañado, incompleto o tiene
operaciones inciertas, la copia NO es apta y no se toca nada.

Uso: AULA_INSPECCION_URL=... AULA_BAJAS_REGISTRO=... python -m app.reconciliar_copia [--aplicar]
"""
import argparse
import os
import sys

import psycopg

from app.registro_bajas import Registro, RegistroInvalido, RegistroNoDisponible, fecha


def problemas_de_copia(db, diario):
    """Problemas que impiden dar la copia por apta, además de los del propio diario."""
    problemas = list(diario.problemas)
    for evento in diario.abiertas:
        problemas.append(f'operación incierta {evento["operacion"]} (cuenta {evento["usuario_id"]}): resolver con '
                         'la base original o decidir según docs/AULA_INACTIVIDAD.md')
    if db.execute("SELECT to_regclass('bajas_inactividad')").fetchone()[0]:
        confirmadas = {e['operacion'] for e in diario.confirmadas}
        for op, uid in db.execute("SELECT operacion::text, usuario_id FROM bajas_inactividad WHERE estado='aplicada'"):
            if op not in confirmadas:
                problemas.append(f'la copia contiene la baja {op} (cuenta {uid}) que no figura confirmada: registro incompleto')
    return problemas


def reconciliar(db, registro, aplicar=False):
    total = 0
    with db.transaction():
        nombre, = db.execute('SELECT current_database()').fetchone()
        if not nombre.startswith('aula_inspeccion_'):
            raise ValueError('Se requiere una base aislada aula_inspeccion_*')
        diario = registro.leer()
        problemas = problemas_de_copia(db, diario)
        if problemas:
            raise RegistroInvalido('Copia NO apta: ' + '; '.join(problemas))
        marcas = db.execute("SELECT to_regclass('bajas_inactividad')").fetchone()[0] is not None
        for evento in diario.confirmadas:
            uid = evento['usuario_id']
            fila = db.execute('SELECT creado_en, rol, correo FROM usuarios WHERE id=%s FOR UPDATE', (uid,)).fetchone()
            if not fila:
                continue
            if fila[:2] != (fecha(evento), 'estudiante'):
                raise ValueError('Identidad o rol distinto: revisar la copia y el registro externo')
            total += 1
            if aplicar:
                if marcas:   # deja la misma constancia que la baja original (y satisface su protección)
                    db.execute("""INSERT INTO bajas_inactividad(operacion, usuario_id, creado_en, estado)
                        VALUES (%s,%s,%s,'aplicada') ON CONFLICT (operacion) DO UPDATE SET estado='aplicada'""",
                               (evento['operacion'], uid, fila[0]))
                db.execute('DELETE FROM registros_pendientes WHERE correo=%s', (fila[2],))
                db.execute('DELETE FROM usuarios WHERE id=%s', (uid,))
    return total


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--aplicar', action='store_true')
    args = parser.parse_args(argv)
    try:
        with psycopg.connect(os.environ['AULA_INSPECCION_URL'], autocommit=True, options='-c timezone=UTC') as db:
            total = reconciliar(db, Registro.desde_entorno(), args.aplicar)
    except (RegistroNoDisponible, RegistroInvalido, ValueError, OSError) as e:
        print(f'Error: {e}', file=sys.stderr)
        return 2
    print(('Cuentas suprimidas: ' if args.aplicar else 'Cuentas coincidentes: ') + str(total))
    return 0


if __name__ == '__main__':
    sys.exit(main())
