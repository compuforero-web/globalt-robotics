"""Configuración por variables de entorno (ver .env.example). Sin secretos en el código."""
import os
from dataclasses import dataclass


def _bool(nombre, defecto):
    return os.environ.get(nombre, str(defecto)).strip().lower() in ('1', 'true', 'si', 'sí', 'yes')


@dataclass(frozen=True)
class Config:
    database_url: str
    origenes: frozenset
    cookie_segura: bool
    inactividad_min: int
    duracion_max_horas: int
    max_fallos_correo: int
    max_fallos_ip: int
    max_registros_ip: int
    ventana_min: int
    # Compilación a través del servicio existente (socket Unix montado en solo lectura).
    compilador_socket: str = ''
    compilar_simultaneos: int = 1      # compilaciones del aula a la vez (deja hueco a los laboratorios)
    compilar_max_espera: int = 4       # peticiones esperando turno; el resto recibe «ocupado»
    compilar_espera_s: float = 8.0     # espera máxima por un turno
    compilar_tiempo_s: float = 45.0    # tiempo máximo de respuesta del compilador
    compilar_por_minuto: int = 6       # por estudiante (no por sesión)
    compilar_por_hora: int = 60


def cargar():
    origenes = [o.strip().rstrip('/') for o in os.environ.get('AULA_ORIGENES', '').split(',') if o.strip()]
    if not origenes:
        raise RuntimeError('Defina AULA_ORIGENES con los orígenes permitidos (p. ej. http://127.0.0.1:8180).')
    return Config(
        database_url=os.environ['AULA_DATABASE_URL'],
        origenes=frozenset(origenes),
        cookie_segura=_bool('AULA_COOKIE_SEGURA', True),
        inactividad_min=int(os.environ.get('AULA_SESION_INACTIVIDAD_MIN', '120')),
        duracion_max_horas=int(os.environ.get('AULA_SESION_MAX_HORAS', '168')),
        max_fallos_correo=int(os.environ.get('AULA_MAX_FALLOS_CORREO', '5')),
        max_fallos_ip=int(os.environ.get('AULA_MAX_FALLOS_IP', '30')),
        max_registros_ip=int(os.environ.get('AULA_MAX_REGISTROS_IP', '10')),
        ventana_min=int(os.environ.get('AULA_VENTANA_INTENTOS_MIN', '15')),
        compilador_socket=os.environ.get('AULA_COMPILADOR_SOCKET', ''),
        compilar_simultaneos=int(os.environ.get('AULA_COMPILAR_SIMULTANEOS', '1')),
        compilar_max_espera=int(os.environ.get('AULA_COMPILAR_MAX_ESPERA', '4')),
        compilar_espera_s=float(os.environ.get('AULA_COMPILAR_ESPERA_S', '8')),
        compilar_tiempo_s=float(os.environ.get('AULA_COMPILAR_TIEMPO_S', '45')),
        compilar_por_minuto=int(os.environ.get('AULA_COMPILAR_POR_MINUTO', '6')),
        compilar_por_hora=int(os.environ.get('AULA_COMPILAR_POR_HORA', '60')),
    )
