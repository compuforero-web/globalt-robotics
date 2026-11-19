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
    registro_abierto: bool = False     # registro público de estudiantes: cerrado salvo decisión explícita
    compilador_socket: str = ''
    compilar_simultaneos: int = 1      # compilaciones del aula a la vez (deja hueco a los laboratorios)
    compilar_max_espera: int = 4       # peticiones esperando turno; el resto recibe «ocupado»
    compilar_espera_s: float = 8.0     # espera máxima por un turno
    compilar_tiempo_s: float = 45.0    # tiempo máximo de respuesta del compilador
    compilar_por_minuto: int = 6       # por estudiante (no por sesión)
    compilar_por_hora: int = 60
    # Registro de adultos: correo (enlaces de un solo uso) y documentos. Sin correo listo o sin documentos
    # vigentes de ambos tipos, el registro sigue cerrado aunque AULA_REGISTRO_ABIERTO=true.
    url_publica: str = ''              # base de los enlaces de los correos, p. ej. https://globalt-robotics.com
    correo_modo: str = 'desactivado'   # 'smtp' o 'desactivado'
    smtp_host: str = ''
    smtp_puerto: int = 587
    smtp_tls: str = 'starttls'         # 'starttls', 'ssl' o 'ninguno' (este último solo para el buzón de pruebas local)
    smtp_usuario: str = ''
    smtp_clave: str = ''
    correo_remitente: str = ''
    permitir_textos_prueba: bool = False   # solo pruebas: admite documentos marcados «prueba»
    verificacion_min: int = 1440       # validez del enlace de verificación
    recuperacion_min: int = 60         # validez del enlace de recuperación
    correos_por_hora: int = 3          # correos por dirección y hora (registro, reenvío, recuperación)
    max_correos_ip: int = 10           # solicitudes de correo por IP en la ventana de intentos
    # Registro externo de bajas por inactividad (docs/AULA_INACTIVIDAD.md). Sin él, `eliminar` se niega.
    bajas_registro: str = ''           # carpeta montada desde un almacenamiento independiente del servidor
    bajas_registro_pruebas: bool = False   # solo pruebas: admite una carpeta local


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
        registro_abierto=_bool('AULA_REGISTRO_ABIERTO', False),
        compilador_socket=os.environ.get('AULA_COMPILADOR_SOCKET', ''),
        compilar_simultaneos=int(os.environ.get('AULA_COMPILAR_SIMULTANEOS', '1')),
        compilar_max_espera=int(os.environ.get('AULA_COMPILAR_MAX_ESPERA', '4')),
        compilar_espera_s=float(os.environ.get('AULA_COMPILAR_ESPERA_S', '8')),
        compilar_tiempo_s=float(os.environ.get('AULA_COMPILAR_TIEMPO_S', '45')),
        compilar_por_minuto=int(os.environ.get('AULA_COMPILAR_POR_MINUTO', '6')),
        compilar_por_hora=int(os.environ.get('AULA_COMPILAR_POR_HORA', '60')),
        url_publica=os.environ.get('AULA_URL_PUBLICA', '').strip().rstrip('/'),
        correo_modo=os.environ.get('AULA_CORREO_MODO', 'desactivado').strip().lower(),
        smtp_host=os.environ.get('AULA_SMTP_HOST', '').strip(),
        smtp_puerto=int(os.environ.get('AULA_SMTP_PUERTO', '587')),
        smtp_tls=os.environ.get('AULA_SMTP_TLS', 'starttls').strip().lower(),
        smtp_usuario=os.environ.get('AULA_SMTP_USUARIO', ''),
        smtp_clave=os.environ.get('AULA_SMTP_CLAVE', ''),
        correo_remitente=os.environ.get('AULA_CORREO_REMITENTE', '').strip(),
        permitir_textos_prueba=_bool('AULA_PERMITIR_TEXTOS_PRUEBA', False),
        verificacion_min=int(os.environ.get('AULA_ENLACE_VERIFICACION_MIN', '1440')),
        recuperacion_min=int(os.environ.get('AULA_ENLACE_RECUPERACION_MIN', '60')),
        correos_por_hora=int(os.environ.get('AULA_CORREOS_POR_HORA', '3')),
        max_correos_ip=int(os.environ.get('AULA_MAX_CORREOS_IP', '10')),
        bajas_registro=os.environ.get('AULA_BAJAS_REGISTRO', '').strip(),
        bajas_registro_pruebas=_bool('AULA_BAJAS_REGISTRO_PRUEBAS', False),
    )
