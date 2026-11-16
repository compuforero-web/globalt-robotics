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
    )
