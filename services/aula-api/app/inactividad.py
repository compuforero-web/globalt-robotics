"""Gestión manual de la inactividad. Sin argumentos solo cuenta casos."""
import argparse
from uuid import UUID

import psycopg

from app import config, correo

ELEGIBLE = """rol = 'estudiante' AND correo_verificado_en IS NOT NULL
    AND ultimo_acceso + interval '24 months' <= now() + interval '30 days'"""


def resumen(db):
    return db.execute(f"""SELECT count(*) FILTER (WHERE a.estado IS NULL),
        count(*) FILTER (WHERE a.estado IS NOT NULL)
        FROM usuarios u LEFT JOIN avisos_inactividad a ON a.usuario_id=u.id
        WHERE {ELEGIBLE}""").fetchone()


def avisar(db, cfg, usuario, enviar=correo.enviar):
    # Reservar ANTES del envío: tras un corte de proceso queda para revisión manual.
    with db.transaction():
        fila = db.execute(f"SELECT correo FROM usuarios WHERE id=%s AND {ELEGIBLE} FOR UPDATE",
                          (usuario,)).fetchone()
        if not fila:
            return 'sin cambio'
        caso = db.execute("""INSERT INTO avisos_inactividad(usuario_id) VALUES (%s)
            ON CONFLICT DO NOTHING RETURNING referencia""", (usuario,)).fetchone()
        if not caso:
            return 'sin cambio'
    try:
        enviar(cfg, fila[0], 'Tu cuenta del Aula GLOBALT ROBOTICS',
               'Tu cuenta se acerca a los 24 meses de inactividad o ya los ha cumplido. '
               'Podremos eliminarla junto con tus prácticas guardadas y tu progreso. '
               'Dispones de al menos 30 días desde este aviso para conservarla. '
               f'Entra al aula con tu cuenta para reiniciar el plazo: {correo.pagina(cfg)}', 'inactividad')
        estado = 'enviado'
    except correo.ErrorEnvio:
        estado = 'fallido'
    with db.transaction():
        cambio = db.execute("UPDATE avisos_inactividad SET estado=%s WHERE referencia=%s AND estado='reservado'",
                            (estado, caso[0])).rowcount
    return estado if cambio else 'cancelado'


def gestionar(db, accion, referencia):
    # Mismo orden de bloqueo que un acceso: usuario antes que aviso.
    with db.transaction():
        fila = db.execute("""SELECT u.id FROM usuarios u JOIN avisos_inactividad a ON a.usuario_id=u.id
            WHERE a.referencia=%s FOR UPDATE OF u""", (referencia,)).fetchone()
        if not fila:
            return False
        if accion == 'acreditar':
            return bool(db.execute("""UPDATE avisos_inactividad SET estado='acreditado', acreditado_en=clock_timestamp()
                WHERE referencia=%s AND estado='enviado'""", (referencia,)).rowcount)
        if accion == 'invalidar':
            return bool(db.execute("DELETE FROM avisos_inactividad WHERE referencia=%s", (referencia,)).rowcount)
        if accion != 'eliminar':
            raise ValueError('Acción desconocida')
        fila = db.execute("""DELETE FROM usuarios u USING avisos_inactividad a WHERE a.usuario_id=u.id
            AND a.referencia=%s AND a.estado='acreditado' AND u.rol='estudiante' AND u.correo_verificado_en IS NOT NULL
            AND u.ultimo_acceso + interval '24 months' <= now()
            AND a.acreditado_en + interval '30 days' <= now() RETURNING u.correo""", (referencia,)).fetchone()
        if fila:
            db.execute('DELETE FROM registros_pendientes WHERE correo=%s', (fila[0],))
        return bool(fila)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    grupos = parser.add_subparsers(dest='accion')
    grupos.add_parser('listar')
    grupos.add_parser('avisar').add_argument('usuario', type=int)
    for accion in ('acreditar', 'invalidar', 'eliminar'):
        grupos.add_parser(accion).add_argument('referencia', type=UUID)
    args = parser.parse_args()
    cfg = config.cargar()
    with psycopg.connect(cfg.database_url, autocommit=True, options='-c timezone=UTC') as db:
        if args.accion is None:
            nuevos, abiertos = resumen(db)
            print(f'Para aviso: {nuevos}. Con expediente: {abiertos}.')
        elif args.accion == 'listar':
            for uid, ref, estado in db.execute(f"""SELECT id, referencia, estado FROM usuarios u
                    LEFT JOIN avisos_inactividad a ON a.usuario_id=u.id WHERE {ELEGIBLE} ORDER BY id"""):
                print(uid, ref or '-', estado or 'pendiente')
        elif args.accion == 'avisar':
            print(avisar(db, cfg, args.usuario))
        else:
            print('Aplicado' if gestionar(db, args.accion, args.referencia) else 'Sin cambio')


if __name__ == '__main__':
    main()
