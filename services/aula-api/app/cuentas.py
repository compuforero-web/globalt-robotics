"""Alta de cuentas de estudiante desde la consola del servidor (el registro público está cerrado por defecto).

Uso dentro del contenedor de la API; la contraseña se lee de la entrada estándar (nunca como argumento):
  printf '%s' "$CLAVE" | python -m app.cuentas crear --correo alumno@ejemplo.org --nombre "Nombre visible"
Siempre crea rol «estudiante» con origen «consola» (sin autorizaciones: las acepta la persona en su primer acceso
si hay documentos vigentes). No imprime la contraseña.
"""
import argparse
import os
import sys

import psycopg
from psycopg.errors import UniqueViolation
from pydantic import ValidationError

from . import seguridad
from .main import DatosCuenta


def crear(url, correo, nombre, clave):
    try:
        datos = DatosCuenta(nombre=nombre, correo=correo, clave=clave)
    except ValidationError as error:
        campos = sorted({str(e['loc'][-1]) for e in error.errors() if e.get('loc')})
        raise ValueError('Datos no válidos: ' + ', '.join(campos)) from None
    if datos.clave.lower() == datos.correo.lower():
        raise ValueError('La contraseña no puede ser igual al correo.')
    try:
        with psycopg.connect(url, autocommit=True) as conexion:
            conexion.execute("INSERT INTO usuarios (correo, nombre, hash_clave, rol) VALUES (%s, %s, %s, 'estudiante')",
                             (datos.correo, datos.nombre, seguridad.hash_clave(datos.clave)))
    except UniqueViolation:
        raise ValueError('Ya existe una cuenta con ese correo.') from None
    return datos.correo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='orden', required=True)
    alta = sub.add_parser('crear')
    alta.add_argument('--correo', required=True)
    alta.add_argument('--nombre', required=True)
    args = parser.parse_args()
    clave = sys.stdin.readline().rstrip('\n')
    try:
        correo = crear(os.environ['AULA_DATABASE_URL'], args.correo, args.nombre, clave)
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(2)
    print('Cuenta de estudiante creada: ' + correo)


if __name__ == '__main__':
    main()
