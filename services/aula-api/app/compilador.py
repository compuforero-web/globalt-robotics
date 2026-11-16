"""Cliente HTTP mínimo hacia el servicio de compilación existente, por su socket Unix.

El servicio (services/compilador-arduino) conserva su aislamiento y sus límites: sin red, solo
lectura, usuario sin privilegios y cola propia. Esta API solo reenvía peticiones autorizadas.
"""
import http.client
import json
import socket


class NoDisponible(Exception):
    """El socket no existe, rechaza la conexión o no responde a tiempo."""


class _ConexionUnix(http.client.HTTPConnection):
    def __init__(self, ruta, tiempo):
        super().__init__('localhost', timeout=tiempo)
        self._ruta = ruta

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(self.timeout)
        try:
            s.connect(self._ruta)
        except BaseException:
            s.close()
            raise
        self.sock = s


def pedir(ruta_socket, metodo, ruta, datos=None, tiempo=45.0, max_respuesta=2 * 1024 * 1024):
    """Devuelve (estado, json). Lanza NoDisponible si el servicio no está o no contesta a tiempo."""
    if not ruta_socket:
        raise NoDisponible('sin socket configurado')
    conexion = _ConexionUnix(ruta_socket, tiempo)
    try:
        cuerpo = None if datos is None else json.dumps(datos).encode()
        cabeceras = {'Content-Type': 'application/json'} if cuerpo is not None else {}
        conexion.request(metodo, '/api/arduino' + ruta, body=cuerpo, headers=cabeceras)
        respuesta = conexion.getresponse()
        texto = respuesta.read(max_respuesta + 1)
        if len(texto) > max_respuesta:
            raise NoDisponible('respuesta demasiado grande')
        try:
            contenido = json.loads(texto or b'{}')
        except ValueError:
            raise NoDisponible('respuesta no válida')
        return respuesta.status, contenido
    except (OSError, http.client.HTTPException) as error:   # incluye FileNotFound, rechazo y timeout
        raise NoDisponible(type(error).__name__) from error
    finally:
        conexion.close()
