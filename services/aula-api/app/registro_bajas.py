"""Registro externo de bajas por inactividad: diario de solo adición en un destino independiente del servidor.

Cada operación deja, como máximo, dos archivos creados en exclusiva (O_EXCL) y sincronizados en disco:
  <operacion>.pendiente.json   antes de tocar la cuenta
  <operacion>.final.json       «confirmada» o «cancelada», una sola vez
Solo datos técnicos: operación, id interno y fecha de alta de la cuenta, base de origen, estado, motivo e instante.

Uso (variables AULA_BAJAS_REGISTRO y, solo en pruebas, AULA_BAJAS_REGISTRO_PRUEBAS):
  python -m app.registro_bajas comprobar
  python -m app.registro_bajas inicializar
  python -m app.registro_bajas decidir OPERACION (--baja | --conservar) --sin-base-original
"""
import argparse
import errno
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

MARCA = '.aula-registro-bajas'
CABECERA_MARCA = 'aula-registro-bajas v1'
IDENTIFICADOR = re.compile(r'^id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
# Sistemas de archivos montados desde otro equipo. Un disco local del servidor no protege ante su pérdida.
REMOTOS = {'nfs', 'nfs4', 'cifs', 'smb3', 'fuse.sshfs'}
MOTIVOS = {'pendiente': {'previa'},
           'confirmada': {'aplicada', 'recuperada', 'decision_operador'},
           'cancelada': {'condiciones', 'no_aplicada', 'decision_operador'}}
NOMBRE = re.compile(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(pendiente|final)\.json$')
CAMPOS = {'v', 'operacion', 'estado', 'motivo', 'usuario_id', 'creado_en', 'base', 'instante'}


class RegistroNoDisponible(RuntimeError):
    """El destino no está configurado u operativo: no se borra nada."""


class RegistroInvalido(ValueError):
    """El diario está dañado, incompleto o en conflicto."""


@dataclass
class Diario:
    pendientes: dict = field(default_factory=dict)   # operacion -> evento «pendiente»
    finales: dict = field(default_factory=dict)      # operacion -> evento final
    problemas: list = field(default_factory=list)

    @property
    def abiertas(self):
        """Operaciones de resultado incierto: anotadas como pendientes y sin desenlace."""
        return [e for op, e in sorted(self.pendientes.items()) if op not in self.finales]

    @property
    def confirmadas(self):
        return [e for _, e in sorted(self.finales.items()) if e['estado'] == 'confirmada']


def _resumen(cuerpo):
    return hashlib.sha256(json.dumps(cuerpo, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _sincronizar_carpeta(ruta):
    fd = os.open(ruta, os.O_RDONLY)
    try:
        os.fsync(fd)
    except OSError as e:          # algunos sistemas remotos no admiten fsync de carpetas
        if e.errno not in (errno.EINVAL, errno.ENOTSUP, errno.EBADF):
            raise
    finally:
        os.close(fd)


def tipo_montaje(ruta):
    """Tipo de sistema de archivos del montaje que contiene la ruta (según /proc/self/mountinfo)."""
    ruta = os.path.realpath(ruta)
    mejor, tipo = '', None
    try:
        lineas = Path('/proc/self/mountinfo').read_text().splitlines()
    except OSError:
        return None
    for linea in lineas:
        izquierda, _, derecha = linea.partition(' - ')
        punto = re.sub(r'\\([0-7]{3})', lambda m: chr(int(m.group(1), 8)), izquierda.split()[4])
        if (ruta == punto or ruta.startswith(punto.rstrip('/') + '/')) and len(punto) >= len(mejor):
            mejor, tipo = punto, derecha.split()[0]
    return tipo


def base_actual(db):
    """Identificador técnico de la base consultada: cambia al restaurar en una base nueva."""
    return db.execute('SELECT oid::bigint FROM pg_database WHERE datname = current_database()').fetchone()[0]


class Registro:
    def __init__(self, ruta, pruebas=False, identidad=''):
        self.ruta = Path(ruta) if ruta else None
        self.pruebas = pruebas
        self.identidad = identidad   # identificador esperado del registro (AULA_BAJAS_REGISTRO_ID)

    @classmethod
    def desde_config(cls, cfg):
        return cls(cfg.bajas_registro, cfg.bajas_registro_pruebas, cfg.bajas_registro_id)

    @classmethod
    def desde_entorno(cls):
        return cls(os.environ.get('AULA_BAJAS_REGISTRO', '').strip(),
                   os.environ.get('AULA_BAJAS_REGISTRO_PRUEBAS', '').strip().lower() in ('1', 'true', 'si', 'sí', 'yes'),
                   os.environ.get('AULA_BAJAS_REGISTRO_ID', '').strip())

    def _carpeta(self):
        if self.ruta is None:
            raise RegistroNoDisponible('AULA_BAJAS_REGISTRO no está configurado: las bajas quedan bloqueadas')
        if not self.ruta.is_dir():
            raise RegistroNoDisponible('El destino del registro de bajas no está montado o no existe')
        if not self.pruebas and tipo_montaje(self.ruta) not in REMOTOS:
            raise RegistroNoDisponible('El destino del registro de bajas debe ser un almacenamiento independiente '
                                       'montado desde otro equipo (NFS, SMB o SSHFS)')

    def comprobar(self):
        """Destino configurado, identificado y con escritura sincronizada. Si falla, no se borra nada."""
        self._carpeta()
        identidad = self.leer_identidad()
        if self.identidad != identidad and (self.identidad or not self.pruebas):
            raise RegistroNoDisponible('El destino montado no es el registro de bajas configurado '
                                       '(AULA_BAJAS_REGISTRO_ID distinto o sin definir)')
        prueba = self.ruta / f'.prueba-{uuid4()}'
        try:
            self._escribir(prueba, b'ok\n')
            if prueba.read_bytes() != b'ok\n':
                raise RegistroNoDisponible('El destino del registro de bajas no devuelve lo escrito')
        except OSError as e:
            raise RegistroNoDisponible(f'El destino del registro de bajas no admite escritura ({e.strerror})') from e
        finally:
            try:
                prueba.unlink()
            except OSError:
                pass

    def leer_identidad(self):
        """Identificador escrito en la marca al inicializar el registro."""
        try:
            lineas = (self.ruta / MARCA).read_text().splitlines()
        except OSError as e:
            raise RegistroNoDisponible('Destino sin inicializar o inaccesible: falta la marca del registro') from e
        m = IDENTIFICADOR.match(lineas[1]) if len(lineas) == 2 and lineas[0] == CABECERA_MARCA else None
        if not m:
            raise RegistroNoDisponible('La marca del registro de bajas no es válida')
        return m.group(1)

    def inicializar(self):
        self._carpeta()
        if (self.ruta / MARCA).exists():
            return False
        if any(p.name != 'lost+found' for p in self.ruta.iterdir()):
            raise RegistroNoDisponible('La carpeta del registro de bajas no está vacía')
        self._escribir(self.ruta / MARCA, f'{CABECERA_MARCA}\nid={uuid4()}\n'.encode())
        return True

    def _escribir(self, ruta, datos):
        fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            vista = memoryview(datos)
            while vista:
                vista = vista[os.write(fd, vista):]
            os.fsync(fd)
        finally:
            os.close(fd)
        _sincronizar_carpeta(self.ruta)

    def anotar(self, operacion, estado, usuario_id, creado_en, base, motivo='previa'):
        """Anota un evento. Repetir el mismo desenlace es inocuo; uno distinto es un conflicto."""
        if motivo not in MOTIVOS.get(estado, ()):
            raise ValueError('Estado o motivo desconocido')
        cuerpo = {'v': 1, 'operacion': str(operacion), 'estado': estado, 'motivo': motivo,
                  'usuario_id': int(usuario_id), 'creado_en': creado_en.astimezone(timezone.utc).isoformat(),
                  'base': int(base),
                  'instante': datetime.now(timezone.utc).isoformat()}
        datos = json.dumps({**cuerpo, 'sha256': _resumen(cuerpo)}, sort_keys=True).encode() + b'\n'
        tipo = 'pendiente' if estado == 'pendiente' else 'final'
        ruta = self.ruta / f'{operacion}.{tipo}.json'
        try:
            self._escribir(ruta, datos)
        except FileExistsError:
            previo, problema = _validar(ruta, str(operacion), tipo)
            if problema or previo['estado'] != estado or previo['usuario_id'] != cuerpo['usuario_id'] \
                    or previo['creado_en'] != cuerpo['creado_en']:
                raise RegistroInvalido(f'Conflicto en el registro de bajas: operación {operacion}') from None
            return previo
        return cuerpo

    def leer(self):
        self._carpeta()
        diario = Diario()
        if not (self.ruta / MARCA).is_file():
            diario.problemas.append('falta la marca del registro (destino equivocado o sin inicializar)')
            return diario
        for ruta in sorted(self.ruta.iterdir()):
            if ruta.name in (MARCA, 'lost+found') or ruta.name.startswith('.prueba-'):
                continue
            m = NOMBRE.match(ruta.name)
            if not m:
                diario.problemas.append(f'archivo inesperado: {ruta.name}')
                continue
            evento, problema = _validar(ruta, m.group(1), m.group(2))
            if problema:
                diario.problemas.append(f'{ruta.name}: {problema}')
            else:
                (diario.pendientes if m.group(2) == 'pendiente' else diario.finales)[m.group(1)] = evento
        for op, final in list(diario.finales.items()):
            previo = diario.pendientes.get(op)
            if previo is None:
                diario.problemas.append(f'{op}: desenlace sin anotación previa (registro incompleto)')
            elif (previo['usuario_id'], previo['creado_en'], previo['base']) != \
                    (final['usuario_id'], final['creado_en'], final['base']):
                diario.problemas.append(f'{op}: la cuenta no coincide entre anotaciones')
            else:
                continue
            del diario.finales[op]     # un desenlace dudoso nunca cuenta como confirmado
        return diario


def _validar(ruta, operacion, tipo):
    try:
        evento = json.loads(ruta.read_bytes())
        resumen = evento.pop('sha256')
    except (OSError, ValueError, KeyError, AttributeError, TypeError):
        return None, 'ilegible o incompleto'
    if set(evento) != CAMPOS or resumen != _resumen(evento):
        return None, 'suma de control o campos incorrectos'
    try:
        valido = (type(evento['v']) is int and evento['v'] == 1 and evento['operacion'] == operacion
                  and (evento['estado'] == 'pendiente') == (tipo == 'pendiente')
                  and evento['motivo'] in MOTIVOS.get(evento['estado'], ())
                  and type(evento['usuario_id']) is int and evento['usuario_id'] > 0
                  and type(evento['base']) is int
                  and datetime.fromisoformat(evento['creado_en']).tzinfo is not None)
    except (TypeError, ValueError):
        valido = False
    if not valido:
        return None, 'contenido inválido'
    return evento, None


def fecha(evento):
    return datetime.fromisoformat(evento['creado_en'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    grupos = parser.add_subparsers(dest='accion', required=True)
    grupos.add_parser('comprobar')
    grupos.add_parser('inicializar')
    decidir = grupos.add_parser('decidir', help='resuelve una operación incierta cuando la base original se perdió')
    decidir.add_argument('operacion', type=UUID)
    opcion = decidir.add_mutually_exclusive_group(required=True)
    opcion.add_argument('--baja', action='store_true')
    opcion.add_argument('--conservar', action='store_true')
    decidir.add_argument('--sin-base-original', action='store_true', required=True,
                         help='confirma que la base donde se ejecutó la operación ya no existe')
    args = parser.parse_args(argv)
    registro = Registro.desde_entorno()
    try:
        if args.accion == 'inicializar':
            if not registro.inicializar():
                print('Ya estaba inicializado: no se cambia nada', file=sys.stderr)
                return 1
            print(f'Registro inicializado. Identificador: {registro.leer_identidad()}')
            return 0
        registro.comprobar()
        diario = registro.leer()
        if args.accion == 'decidir':
            if diario.problemas:
                raise RegistroInvalido('Registro con problemas: revisar antes de decidir')
            previo = diario.pendientes.get(str(args.operacion))
            if previo is None or str(args.operacion) in diario.finales:
                print('Sin cambio: la operación no está pendiente')
                return 1
            estado = 'confirmada' if args.baja else 'cancelada'
            registro.anotar(args.operacion, estado, previo['usuario_id'], fecha(previo), previo['base'],
                            'decision_operador')
            print(f'Operación {args.operacion}: {estado} por decisión del operador')
            return 0
        canceladas = sum(e['estado'] == 'cancelada' for e in diario.finales.values())
        print(f'Destino operativo. Registro {registro.leer_identidad()}. Confirmadas: {len(diario.confirmadas)}. Canceladas: {canceladas}. '
              f'Inciertas: {len(diario.abiertas)}. Problemas: {len(diario.problemas)}.')
        for evento in diario.abiertas:
            print('Incierta:', evento['operacion'], 'cuenta', evento['usuario_id'])
        for problema in diario.problemas:
            print('Problema:', problema)
        return 1 if diario.problemas or diario.abiertas else 0
    except (RegistroNoDisponible, RegistroInvalido, OSError) as e:
        print(f'Error: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
