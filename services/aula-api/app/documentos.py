"""Documentos del registro (términos de uso, autorización de datos y política de tratamiento de datos) y estado del registro público.

Uso dentro del contenedor de la API (AULA_DATABASE_URL definida):
  python -m app.documentos cargar --tipo terminos --version 2026-12-01 --titulo "…" --finalidad "…" --aprobado < texto.md
  python -m app.documentos activar --tipo terminos --version 2026-12-01
  python -m app.documentos listar
  python -m app.documentos estado [--produccion]     # código 0 solo si el registro puede abrirse
  python -m app.documentos cargar-prueba             # SOLO pruebas: exige AULA_PERMITIR_TEXTOS_PRUEBA=true

Una versión cargada no se modifica ni se borra (la base lo impide). Sin --aprobado queda como «prueba» y nunca se
usa sin AULA_PERMITIR_TEXTOS_PRUEBA=true. Este módulo no redacta textos: carga los que se le entregan.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import psycopg

from . import correo
from .config import _bool

TIPOS = ('terminos', 'datos', 'politica')
VERSION = re.compile(r'^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$')
PRUEBA = Path(__file__).resolve().parents[1] / 'documentos' / 'prueba'
VERSION_PRUEBA = 'prueba-1'


def cargar(url, tipo, version, titulo, finalidad, texto, aprobado):
    if tipo not in TIPOS:
        raise ValueError('Tipo no válido (terminos, datos o politica).')
    if not VERSION.match(version):
        raise ValueError('Versión no válida: letras, números, puntos y guiones (máx. 40).')
    texto = texto.replace('\r\n', '\n')
    if len(texto.strip()) < 20:
        raise ValueError('El texto está vacío o es demasiado corto.')
    suma = hashlib.sha256(texto.encode()).hexdigest()
    with psycopg.connect(url, autocommit=True) as conexion:
        previa = conexion.execute('SELECT sha256 FROM documentos_legales WHERE tipo = %s AND version = %s',
                                  (tipo, version)).fetchone()
        if previa:
            if previa[0] != suma:
                raise ValueError(f'La versión {version} ya existe con otro texto: usa una versión nueva.')
            return suma, False
        conexion.execute(
            'INSERT INTO documentos_legales (tipo, version, titulo, finalidad, texto, sha256, estado) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s)',
            (tipo, version, titulo.strip(), finalidad.strip(), texto, suma, 'aprobado' if aprobado else 'prueba'))
    return suma, True


def activar(url, tipo, version, permitir_prueba=False):
    with psycopg.connect(url, autocommit=True) as conexion:
        fila = conexion.execute('SELECT estado FROM documentos_legales WHERE tipo = %s AND version = %s',
                                (tipo, version)).fetchone()
        if not fila:
            raise ValueError('No existe esa versión. Cárgala primero.')
        if fila[0] == 'prueba' and not permitir_prueba:
            raise ValueError('Es un texto de prueba: solo se activa con AULA_PERMITIR_TEXTOS_PRUEBA=true.')
        conexion.execute('UPDATE documentos_legales SET vigente_desde = now() WHERE tipo = %s AND version = %s',
                         (tipo, version))


def listar(url):
    with psycopg.connect(url, autocommit=True) as conexion:
        return conexion.execute(
            'SELECT tipo, version, estado, sha256, cargado_en, vigente_desde, '
            '(SELECT count(*) FROM autorizaciones a WHERE a.documento_id = d.id) FROM documentos_legales d '
            'ORDER BY tipo, cargado_en').fetchall()


def leer_prueba(nombre):
    cabecera, texto = (PRUEBA / f'{nombre}.md').read_text(encoding='utf-8').split('\n---\n', 1)
    campos = dict(linea.split(': ', 1) for linea in cabecera.splitlines() if ': ' in linea)
    return campos['titulo'], campos['finalidad'], texto


def cargar_prueba(url):
    if not _bool('AULA_PERMITIR_TEXTOS_PRUEBA', False):
        raise ValueError('Los textos de prueba solo se cargan con AULA_PERMITIR_TEXTOS_PRUEBA=true (nunca en producción).')
    with psycopg.connect(url, autocommit=True) as conexion:
        vigentes = {f[0] for f in conexion.execute(
            'SELECT tipo FROM documentos_legales WHERE vigente_desde IS NOT NULL').fetchall()}
    for tipo in TIPOS:
        titulo, finalidad, texto = leer_prueba(tipo)
        cargar(url, tipo, VERSION_PRUEBA, titulo, finalidad, texto, aprobado=False)
        if tipo not in vigentes:
            activar(url, tipo, VERSION_PRUEBA, permitir_prueba=True)


def estado(url, config, produccion=False):
    """¿Puede abrirse el registro público? Devuelve (listo, detalle)."""
    estados = ['aprobado', 'prueba'] if config.permitir_textos_prueba and not produccion else ['aprobado']
    with psycopg.connect(url, autocommit=True) as conexion:
        filas = conexion.execute(
            'SELECT DISTINCT ON (tipo) tipo, version, estado FROM documentos_legales WHERE vigente_desde IS NOT NULL '
            'AND vigente_desde <= now() AND estado = ANY(%s) ORDER BY tipo, vigente_desde DESC, id DESC',
            (estados,)).fetchall()
    vigentes = {f[0]: {'version': f[1], 'estado': f[2]} for f in filas}
    faltan = [f'falta un documento «{t}» vigente{" y aprobado" if produccion else ""}' for t in TIPOS if t not in vigentes]
    if not correo.listo(config):
        faltan.append('correo sin configurar')
    if produccion:
        faltan += [p for p in correo.problemas_produccion(config) if p not in faltan and not p.startswith('correo sin')]
    detalle = {'registro_solicitado': config.registro_abierto, 'correo_listo': correo.listo(config),
               'documentos_vigentes': vigentes, 'faltan': faltan}
    return not faltan, detalle


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='orden', required=True)
    c = sub.add_parser('cargar')
    c.add_argument('--tipo', required=True, choices=TIPOS)
    c.add_argument('--version', required=True)
    c.add_argument('--titulo', required=True)
    c.add_argument('--finalidad', required=True)
    c.add_argument('--aprobado', action='store_true', help='texto definitivo aprobado por el responsable')
    a = sub.add_parser('activar')
    a.add_argument('--tipo', required=True, choices=TIPOS)
    a.add_argument('--version', required=True)
    sub.add_parser('listar')
    sub.add_parser('cargar-prueba')
    e = sub.add_parser('estado')
    e.add_argument('--produccion', action='store_true')
    args = parser.parse_args()
    url = os.environ['AULA_DATABASE_URL']
    try:
        if args.orden == 'cargar':
            suma, nueva = cargar(url, args.tipo, args.version, args.titulo, args.finalidad,
                                 sys.stdin.read(), args.aprobado)
            print(('Cargada' if nueva else 'Ya estaba cargada') + f' {args.tipo} {args.version} '
                  f'({"aprobado" if args.aprobado else "prueba"}) sha256={suma}')
        elif args.orden == 'activar':
            activar(url, args.tipo, args.version, _bool('AULA_PERMITIR_TEXTOS_PRUEBA', False))
            print(f'Vigente: {args.tipo} {args.version}')
        elif args.orden == 'listar':
            for tipo, version, est, suma, cargado, vigente, n in listar(url):
                print(f'{tipo:9} {version:20} {est:9} vigente_desde={vigente.isoformat() if vigente else "-":32} '
                      f'autorizaciones={n} sha256={suma[:16]}…')
        elif args.orden == 'cargar-prueba':
            cargar_prueba(url)
            print('Textos de PRUEBA cargados (solo entornos de prueba).')
        elif args.orden == 'estado':
            from .config import cargar as cargar_config
            listo, detalle = estado(url, cargar_config(), args.produccion)
            print(json.dumps(detalle, ensure_ascii=False, indent=2))
            sys.exit(0 if listo else 3)
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
