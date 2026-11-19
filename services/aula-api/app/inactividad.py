"""Gestión manual de la inactividad. Sin argumentos solo cuenta casos."""
import argparse
import sys
from contextlib import contextmanager
from uuid import UUID, uuid4

import psycopg

from app import config, correo
from app.registro_bajas import Registro, RegistroInvalido, RegistroNoDisponible, base_actual, fecha

ELEGIBLE = """rol = 'estudiante' AND correo_verificado_en IS NOT NULL
    AND ultimo_acceso + interval '24 months' <= now() + interval '30 days'"""
# Condiciones de la baja: se comprueban al preparar y otra vez, con la cuenta bloqueada, al borrar.
APTA = """a.estado='acreditado' AND u.rol='estudiante' AND u.correo_verificado_en IS NOT NULL
    AND u.ultimo_acceso + interval '24 months' <= now() AND a.acreditado_en + interval '30 days' <= now()"""


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
    if accion == 'eliminar':
        raise ValueError('La baja exige el registro externo: use eliminar()')
    if accion not in ('acreditar', 'invalidar'):
        raise ValueError('Acción desconocida')
    # Mismo orden de bloqueo que un acceso: usuario antes que aviso.
    with db.transaction():
        fila = db.execute("""SELECT u.id FROM usuarios u JOIN avisos_inactividad a ON a.usuario_id=u.id
            WHERE a.referencia=%s FOR UPDATE OF u""", (referencia,)).fetchone()
        if not fila:
            return False
        if accion == 'acreditar':
            return bool(db.execute("""UPDATE avisos_inactividad SET estado='acreditado', acreditado_en=clock_timestamp()
                WHERE referencia=%s AND estado='enviado'""", (referencia,)).rowcount)
        return bool(db.execute("DELETE FROM avisos_inactividad WHERE referencia=%s", (referencia,)).rowcount)


@contextmanager
def bloqueo(db, usuario, esperar=True):
    """Serializa las bajas de una cuenta entre procesos. Se libera si la conexión se pierde."""
    clave = ('SELECT pg_advisory_lock(hashtextextended(%s, 0))' if esperar
             else 'SELECT pg_try_advisory_lock(hashtextextended(%s, 0))')
    nombre = f'aula-baja-inactividad:{usuario}'
    obtenido = db.execute(clave, (nombre,)).fetchone()[0] is not False
    try:
        yield obtenido
    finally:
        if obtenido and not db.closed and not db.broken:
            db.execute('SELECT pg_advisory_unlock(hashtextextended(%s, 0))', (nombre,))


def resolver(db, registro, usuario=None):
    """Resuelve operaciones inciertas consultando la base ORIGINAL. Devuelve [(operacion, resultado)]."""
    diario = registro.leer()
    if diario.problemas:
        raise RegistroInvalido('Registro de bajas con problemas: ' + '; '.join(diario.problemas))
    base = base_actual(db)
    resultados = []
    for evento in diario.abiertas:
        uid, op = evento['usuario_id'], evento['operacion']
        if usuario is not None and uid != usuario:
            continue
        if evento['base'] != base:
            resultados.append((op, 'requiere decisión: otra base'))
            continue
        with bloqueo(db, uid, esperar=False) as libre:
            if not libre:
                resultados.append((op, 'en curso'))
                continue
            fila = db.execute('SELECT estado FROM bajas_inactividad WHERE operacion=%s AND usuario_id=%s AND creado_en=%s',
                              (op, uid, fecha(evento))).fetchone()
            if fila is None:
                resultados.append((op, 'requiere decisión: la base no conoce la operación'))
                continue
            if fila[0] == 'aplicada':
                registro.anotar(op, 'confirmada', uid, fecha(evento), base, 'recuperada')
                resultados.append((op, 'confirmada'))
            else:
                # Sin transacción de borrado en curso (bloqueo libre) y sin «aplicada»: la cuenta no se borró.
                db.execute("UPDATE bajas_inactividad SET estado='cancelada' WHERE operacion=%s AND estado='pendiente'", (op,))
                registro.anotar(op, 'cancelada', uid, fecha(evento), base, 'no_aplicada')
                resultados.append((op, 'cancelada'))
    return resultados


def eliminar(db, registro, referencia, pausa=None):
    """Baja individual con constancia externa previa. Devuelve 'aplicada', 'cancelada' o 'sin cambio'.

    Orden: destino operativo → anotación local «pendiente» → anotación externa «pendiente» →
    transacción que revalida y borra (o cancela) → anotación externa del desenlace.
    Si algo falla antes del borrado, la cuenta sigue activa. Si falla después, la operación queda
    incierta en el registro externo y `resolver` la cierra con la base original."""
    registro.comprobar()
    fila = db.execute('SELECT usuario_id FROM avisos_inactividad WHERE referencia=%s', (referencia,)).fetchone()
    if not fila:
        return 'sin cambio'
    uid = fila[0]
    with bloqueo(db, uid):
        if any(r != 'cancelada' and r != 'confirmada' for _, r in resolver(db, registro, uid)):
            raise RegistroInvalido('La cuenta tiene una baja incierta sin resolver: revisar con resolver')
        fila = db.execute(f"""SELECT u.creado_en FROM usuarios u JOIN avisos_inactividad a ON a.usuario_id=u.id
            WHERE a.referencia=%s AND {APTA}""", (referencia,)).fetchone()
        if not fila:
            return 'sin cambio'
        creado, op, base = fila[0], uuid4(), base_actual(db)
        db.execute('INSERT INTO bajas_inactividad(operacion, usuario_id, creado_en) VALUES (%s,%s,%s)', (op, uid, creado))
        try:
            registro.anotar(op, 'pendiente', uid, creado, base)
        except BaseException as e:
            db.execute("UPDATE bajas_inactividad SET estado='cancelada' WHERE operacion=%s", (op,))
            if isinstance(e, OSError):
                raise RegistroNoDisponible(f'No se pudo anotar la baja fuera ({e.strerror}): la cuenta sigue activa') from e
            raise
        if pausa:
            pausa()
        with db.transaction():
            # Mismo orden de bloqueo que un acceso: usuario antes que aviso.
            fila = db.execute(f"""SELECT u.correo FROM usuarios u JOIN avisos_inactividad a ON a.usuario_id=u.id
                WHERE a.referencia=%s AND u.id=%s AND u.creado_en=%s AND {APTA} FOR UPDATE OF u""",
                              (referencia, uid, creado)).fetchone()
            estado = 'aplicada' if fila else 'cancelada'
            db.execute('UPDATE bajas_inactividad SET estado=%s WHERE operacion=%s', (estado, op))
            if fila:
                db.execute('DELETE FROM usuarios WHERE id=%s', (uid,))
                db.execute('DELETE FROM registros_pendientes WHERE correo=%s', (fila[0],))
        try:
            if fila:
                registro.anotar(op, 'confirmada', uid, creado, base, 'aplicada')
            else:
                registro.anotar(op, 'cancelada', uid, creado, base, 'condiciones')
        except OSError as e:
            raise RegistroNoDisponible(f'Baja {estado} en la base, sin desenlace anotado fuera ({e.strerror}). '
                                       f'Operación {op}: ejecutar resolver cuando el destino vuelva') from e
        return estado


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    grupos = parser.add_subparsers(dest='accion')
    grupos.add_parser('listar')
    grupos.add_parser('avisar').add_argument('usuario', type=int)
    for accion in ('acreditar', 'invalidar', 'eliminar'):
        grupos.add_parser(accion).add_argument('referencia', type=UUID)
    grupos.add_parser('resolver', help='cierra bajas inciertas consultando esta base (la original)')
    args = parser.parse_args()
    cfg = config.cargar()
    registro = Registro.desde_config(cfg)
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
        elif args.accion in ('eliminar', 'resolver'):
            try:
                if args.accion == 'eliminar':
                    print({'aplicada': 'Aplicado', 'cancelada': 'Cancelado: la cuenta ya no cumple las condiciones',
                           'sin cambio': 'Sin cambio'}[eliminar(db, registro, args.referencia)])
                else:
                    resultados = resolver(db, registro)
                    for op, resultado in resultados:
                        print(op, resultado)
                    print(f'Operaciones revisadas: {len(resultados)}')
            except (RegistroNoDisponible, RegistroInvalido, OSError) as e:
                print(f'Error: {e}', file=sys.stderr)
                sys.exit(2)
        else:
            print('Aplicado' if gestionar(db, args.accion, args.referencia) else 'Sin cambio')


if __name__ == '__main__':
    main()
