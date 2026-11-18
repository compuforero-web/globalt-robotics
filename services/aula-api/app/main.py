"""API del aula: registro, sesión de servidor y cursos del estudiante. Prefijo: /api/aula."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import re
import threading
import unicodedata
from typing import Literal
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg.errors import UniqueViolation
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, StrictInt, field_validator

from . import compilador, seguridad
from .config import cargar

COOKIE = 'aula_sesion'
RUTA_COOKIE = '/api/aula'
MAX_CUERPO = 16 * 1024
METODOS_SEGUROS = {'GET', 'HEAD', 'OPTIONS'}
MAX_CODIGO = 12000   # caracteres; el cuerpo completo sigue limitado a MAX_CUERPO
MAX_PASO = 30        # pasos 0..30 de una lección (cabe en la máscara INTEGER de progreso_lecciones)
MARGEN_VISITA_DIAS = 30   # una visita pendiente más antigua se registra con esta antigüedad máxima
# Lecciones con borrador en la cuenta y el curso en el que hay que estar inscrito. Los identificadores son
# definitivos y coinciden con el manifiesto del laboratorio (games/laboratorio-arduino/src/lessons/index.js;
# lo comprueba tests/test_laboratorio.py). Añadir una lección no requiere migración: la tabla borradores
# ya usa (usuario_id, leccion_id) como clave.
LECCIONES = {
    'arduino-led-serie': 'course-arduino',
    'arduino-protoboard-semaforo': 'course-arduino',
    'arduino-pwm-brillo': 'course-arduino',
    'arduino-boton-entrada': 'course-arduino',
    'arduino-boton-flanco': 'course-arduino',
    'arduino-potenciometro-pwm': 'course-arduino',
    'arduino-ultrasonico-distancia': 'course-arduino',
    'arduino-ultrasonico-alerta': 'course-arduino',
    'arduino-l298n-direccion': 'course-arduino',
    'arduino-l298n-velocidad': 'course-arduino',
    'arduino-l298n-dos-motores': 'course-arduino',
    'arduino-servo-posiciones': 'course-arduino',
    'arduino-servo-barrido': 'course-arduino',
    'arduino-evasor-decision': 'course-arduino',
    'arduino-evasor-pista': 'course-arduino',
}
# Prácticas de Desarrollo Web y Python: SOLO progreso (sin borradores en la cuenta ni compilación). Cada curso
# tiene su espacio de nombres: «web-» + identificador del taller (games/laboratorio-web/lessons.js) y los de
# «Python desde Cero», que ya empiezan por «python-» (games/laboratorio-python/src/practicas.js). Lo comprueba
# tests/test_progreso_practicas.py. Los cursos los crea la migración 0005 (catálogo); sin ellos no hay inscripción.
PRACTICAS = {
    'web-estructura': 'course-web',
    'web-rejilla': 'course-web',
    'web-adaptable': 'course-web',
    'web-eventos': 'course-web',
    'web-publicacion': 'course-web',
    'python-variables': 'course-python',
    'python-condicionales': 'course-python',
    'python-funciones': 'course-python',
    'python-archivos': 'course-python',
    'python-asistente': 'course-python',
}
CON_PROGRESO = {**LECCIONES, **PRACTICAS}   # lección o práctica → curso, para el progreso


def crear_app(config=None):
    config = config or cargar()
    pool = ConnectionPool(config.database_url, min_size=1, max_size=10, open=False,
                          kwargs={'autocommit': True})

    @asynccontextmanager
    async def ciclo(_app):
        pool.open(wait=True, timeout=30)
        yield
        pool.close()

    app = FastAPI(title='Aula GLOBALT', lifespan=ciclo, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.pool = pool
    app.state.config = config

    # ---------- Protección general: tamaño, tipo de contenido y origen ----------
    @app.middleware('http')
    async def proteger(request: Request, siguiente):
        if request.method not in METODOS_SEGUROS:
            origen = request.headers.get('origin')
            if not origen and request.headers.get('referer'):
                partes = urlsplit(request.headers['referer'])
                origen = f'{partes.scheme}://{partes.netloc}'
            if not origen or origen.rstrip('/') not in config.origenes:
                return error(403, 'Origen no permitido.')
            try:
                largo = int(request.headers.get('content-length', '0'))
            except ValueError:
                largo = MAX_CUERPO + 1
            if largo > MAX_CUERPO:
                return error(413, 'Solicitud demasiado grande.')
            if largo and not request.headers.get('content-type', '').startswith('application/json'):
                return error(415, 'Se espera JSON.')
        respuesta = await siguiente(request)
        respuesta.headers['Cache-Control'] = 'no-store'
        respuesta.headers['X-Content-Type-Options'] = 'nosniff'
        respuesta.headers['Referrer-Policy'] = 'same-origin'
        return respuesta

    @app.exception_handler(RequestValidationError)
    async def validacion(_request, exc):
        # No se devuelven los valores recibidos (podrían incluir la contraseña).
        campos = sorted({str(e['loc'][-1]) for e in exc.errors() if e.get('loc')})
        return error(422, 'Datos no válidos: ' + ', '.join(campos) if campos else 'Datos no válidos.')

    # ---------- Utilidades de base de datos ----------
    def bd():
        with pool.connection() as conexion:
            yield conexion

    def ip(request: Request) -> str:
        return request.client.host if request.client else 'desconocida'

    def contar(conexion, tipo, clave):
        fila = conexion.execute(
            'SELECT count(*) FROM intentos WHERE tipo = %s AND clave = %s AND creado_en > now() - %s',
            (tipo, seguridad.huella(clave), timedelta(minutes=config.ventana_min))).fetchone()
        return fila[0]

    def anotar(conexion, tipo, clave):
        conexion.execute('INSERT INTO intentos (tipo, clave) VALUES (%s, %s)', (tipo, seguridad.huella(clave)))
        conexion.execute("DELETE FROM intentos WHERE creado_en < now() - interval '1 day'")

    def abrir_sesion(conexion, respuesta: Response, usuario_id: int):
        sesion, csrf = seguridad.token(), seguridad.token()
        conexion.execute("DELETE FROM sesiones WHERE expira_en < now() - interval '30 days' "
                         "OR revocada_en < now() - interval '30 days'")
        conexion.execute(
            'INSERT INTO sesiones (id_hash, usuario_id, csrf, expira_en) VALUES (%s, %s, %s, now() + %s)',
            (seguridad.huella(sesion), usuario_id, csrf, timedelta(hours=config.duracion_max_horas)))
        respuesta.set_cookie(COOKIE, sesion, max_age=config.duracion_max_horas * 3600, path=RUTA_COOKIE,
                             httponly=True, secure=config.cookie_segura, samesite='strict')
        return csrf

    def sesion_actual(request: Request, conexion=Depends(bd)):
        """Devuelve la sesión válida o responde 401. Renueva la marca de inactividad."""
        valor = request.cookies.get(COOKIE)
        if not valor or len(valor) > 100:
            raise HTTPException(401, 'Sesión no iniciada.')
        fila = conexion.execute(
            'UPDATE sesiones s SET ultimo_uso = now() FROM usuarios u '
            'WHERE s.id_hash = %s AND u.id = s.usuario_id AND s.revocada_en IS NULL '
            'AND s.expira_en > now() AND s.ultimo_uso > now() - %s '
            'RETURNING s.id_hash, s.csrf, u.id, u.nombre, u.correo, u.rol',
            (seguridad.huella(valor), timedelta(minutes=config.inactividad_min))).fetchone()
        if not fila:
            raise HTTPException(401, 'La sesión no existe, se cerró o caducó.')
        claves = ('id_hash', 'csrf', 'usuario_id', 'nombre', 'correo', 'rol')
        return dict(zip(claves, fila))

    def con_csrf(request: Request, sesion=Depends(sesion_actual)):
        recibido = request.headers.get('x-csrf-token', '')
        if not recibido or not seguridad.iguales(recibido, sesion['csrf']):
            raise HTTPException(403, 'Falta o no coincide el token CSRF.')
        return sesion

    def publico(sesion):
        return {'nombre': sesion['nombre'], 'correo': sesion['correo'], 'rol': sesion['rol']}

    # ---------- Rutas ----------
    @app.get('/api/aula/salud')
    def salud(conexion=Depends(bd)):
        conexion.execute('SELECT 1')
        return {'ok': True}

    @app.get('/api/aula/config')
    def configuracion_publica():
        return {'registro_abierto': config.registro_abierto}

    @app.post('/api/aula/registro', status_code=201)
    def registro(datos: Registro, request: Request, respuesta: Response, conexion=Depends(bd)):
        if not config.registro_abierto:
            raise HTTPException(403, 'El registro de cuentas no está abierto. Pide tu cuenta a GLOBALT ROBOTICS.')
        if contar(conexion, 'registro_ip', ip(request)) >= config.max_registros_ip:
            raise HTTPException(429, 'Demasiados registros desde esta conexión. Intenta más tarde.')
        anotar(conexion, 'registro_ip', ip(request))
        if datos.clave.lower() == datos.correo.lower():
            raise HTTPException(422, 'La contraseña no puede ser igual al correo.')
        try:
            with conexion.transaction():
                # El rol nunca procede del cliente: el registro público solo crea estudiantes.
                fila = conexion.execute(
                    "INSERT INTO usuarios (correo, nombre, hash_clave, rol) VALUES (%s, %s, %s, 'estudiante') RETURNING id",
                    (datos.correo, datos.nombre, seguridad.hash_clave(datos.clave))).fetchone()
                csrf = abrir_sesion(conexion, respuesta, fila[0])
        except UniqueViolation:
            raise HTTPException(409, 'Ya existe una cuenta con ese correo.')
        return {'usuario': {'nombre': datos.nombre, 'correo': datos.correo, 'rol': 'estudiante'}, 'csrf': csrf}

    @app.post('/api/aula/sesion')
    def iniciar(datos: Acceso, request: Request, respuesta: Response, conexion=Depends(bd)):
        if (contar(conexion, 'acceso_correo', datos.correo) >= config.max_fallos_correo
                or contar(conexion, 'acceso_ip', ip(request)) >= config.max_fallos_ip):
            raise HTTPException(429, 'Demasiados intentos fallidos. Espera unos minutos.',
                                headers={'Retry-After': str(config.ventana_min * 60)})
        fila = conexion.execute('SELECT id, hash_clave, nombre, rol FROM usuarios WHERE correo = %s',
                                (datos.correo,)).fetchone()
        if not seguridad.verificar_clave(fila[1] if fila else None, datos.clave):
            anotar(conexion, 'acceso_correo', datos.correo)
            anotar(conexion, 'acceso_ip', ip(request))
            raise HTTPException(401, 'Correo o contraseña incorrectos.')
        if seguridad.necesita_rehash(fila[1]):
            conexion.execute('UPDATE usuarios SET hash_clave = %s WHERE id = %s', (seguridad.hash_clave(datos.clave), fila[0]))
        conexion.execute('DELETE FROM intentos WHERE tipo = %s AND clave = %s',
                         ('acceso_correo', seguridad.huella(datos.correo)))
        anterior = request.cookies.get(COOKIE)
        if anterior:
            conexion.execute('UPDATE sesiones SET revocada_en = now() WHERE id_hash = %s', (seguridad.huella(anterior),))
        csrf = abrir_sesion(conexion, respuesta, fila[0])
        return {'usuario': {'nombre': fila[2], 'correo': datos.correo, 'rol': fila[3]}, 'csrf': csrf}

    @app.get('/api/aula/sesion')
    def consultar(sesion=Depends(sesion_actual)):
        return {'usuario': publico(sesion), 'csrf': sesion['csrf']}

    @app.delete('/api/aula/sesion', status_code=204)
    def cerrar(respuesta: Response, sesion=Depends(con_csrf), conexion=Depends(bd)):
        conexion.execute('UPDATE sesiones SET revocada_en = now() WHERE id_hash = %s', (sesion['id_hash'],))
        respuesta.delete_cookie(COOKIE, path=RUTA_COOKIE, httponly=True, secure=config.cookie_segura, samesite='strict')
        respuesta.status_code = 204
        return respuesta

    @app.get('/api/aula/cursos')
    def cursos(conexion=Depends(bd)):
        filas = conexion.execute('SELECT id, titulo, ruta_laboratorio FROM cursos WHERE activo ORDER BY id').fetchall()
        return {'cursos': [{'id': f[0], 'titulo': f[1], 'laboratorio': f[2]} for f in filas]}

    @app.get('/api/aula/mis-cursos')
    def mis_cursos(sesion=Depends(sesion_actual), conexion=Depends(bd)):
        filas = conexion.execute(
            'SELECT c.id, c.titulo, c.ruta_laboratorio, i.creada_en FROM inscripciones i '
            'JOIN cursos c ON c.id = i.curso_id WHERE i.usuario_id = %s ORDER BY i.creada_en',
            (sesion['usuario_id'],)).fetchall()
        progreso = progreso_por_curso(conexion, sesion['usuario_id'])
        return {'cursos': [{'id': f[0], 'titulo': f[1], 'laboratorio': f[2], 'inscrito_en': f[3].isoformat(),
                            'progreso': progreso.get(f[0], vacio(f[0]))} for f in filas]}

    @app.post('/api/aula/inscripciones')
    def inscribir(datos: Inscripcion, respuesta: Response, sesion=Depends(con_csrf), conexion=Depends(bd)):
        if not conexion.execute('SELECT 1 FROM cursos WHERE id = %s AND activo', (datos.curso_id,)).fetchone():
            raise HTTPException(404, 'Curso no disponible.')
        nueva = conexion.execute(
            'INSERT INTO inscripciones (usuario_id, curso_id) VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING curso_id',
            (sesion['usuario_id'], datos.curso_id)).fetchone()
        respuesta.status_code = 201 if nueva else 200
        return {'curso_id': datos.curso_id, 'nueva': bool(nueva)}

    # ---------- Borradores de código (identidad siempre desde la sesión) ----------
    def leccion_permitida(leccion_id, sesion, conexion, catalogo=LECCIONES,
                          aviso='Inscríbete en el curso desde el aula para guardar tu código.'):
        curso = catalogo.get(leccion_id)
        if not curso:
            raise HTTPException(404, 'Lección no disponible.')
        if not conexion.execute('SELECT 1 FROM inscripciones WHERE usuario_id = %s AND curso_id = %s',
                                (sesion['usuario_id'], curso)).fetchone():
            raise HTTPException(403, aviso)

    def borrador_publico(fila):
        return {'codigo': fila[0], 'version': fila[1], 'actualizado_en': fila[2].isoformat()} if fila else None

    def leer_borrador(conexion, usuario_id, leccion_id):
        return conexion.execute('SELECT codigo, version, actualizado_en FROM borradores '
                                'WHERE usuario_id = %s AND leccion_id = %s', (usuario_id, leccion_id)).fetchone()

    @app.get('/api/aula/borradores/{leccion_id}')
    def ver_borrador(leccion_id: str, sesion=Depends(sesion_actual), conexion=Depends(bd)):
        leccion_permitida(leccion_id, sesion, conexion)
        return {'borrador': borrador_publico(leer_borrador(conexion, sesion['usuario_id'], leccion_id))}

    @app.put('/api/aula/borradores/{leccion_id}')
    def guardar_borrador(leccion_id: str, datos: Borrador, sesion=Depends(con_csrf), conexion=Depends(bd)):
        leccion_permitida(leccion_id, sesion, conexion)
        usuario = sesion['usuario_id']
        if datos.version_base is None:   # primera copia en la cuenta
            fila = conexion.execute(
                'INSERT INTO borradores (usuario_id, leccion_id, codigo) VALUES (%s, %s, %s) '
                'ON CONFLICT DO NOTHING RETURNING codigo, version, actualizado_en',
                (usuario, leccion_id, datos.codigo)).fetchone()
        else:                            # solo sobre la versión que el navegador conoce
            fila = conexion.execute(
                'UPDATE borradores SET codigo = %s, version = version + 1, actualizado_en = now() '
                'WHERE usuario_id = %s AND leccion_id = %s AND version = %s '
                'RETURNING codigo, version, actualizado_en',
                (datos.codigo, usuario, leccion_id, datos.version_base)).fetchone()
        if not fila:
            # Otro navegador guardó antes: no se sobrescribe; se devuelve la versión de la cuenta.
            return JSONResponse({'detail': 'Tu cuenta tiene una versión más reciente de este código.',
                                 'borrador': borrador_publico(leer_borrador(conexion, usuario, leccion_id))},
                                status_code=409)
        return {'borrador': borrador_publico(fila)}

    # ---------- Progreso del curso (DECLARATIVO: la evaluación ocurre en el navegador) ----------
    # Ruta dentro de la lista cerrada del nginx público (/api/aula/mis-cursos): no requiere cambiar la
    # infraestructura. La identidad sale siempre de la sesión; el cuerpo nunca indica el usuario.
    # Los datos se fusionan (pasos vistos = unión, reto superado = permanente, paso = visita más reciente),
    # así que repetir o reenviar una petición pendiente no cambia el resultado ni retrocede el progreso.
    # El servidor no puede verificar que el reto se superó: no usar para certificados, notas ni permisos.
    COLUMNAS = 'leccion_id, paso, pasos_vistos, visto_en, completada_en, superada_en'

    def leccion_publica(fila):
        leccion, paso, mascara, visto, completada, superada = fila
        return {'leccion_id': leccion, 'estado': 'completada' if completada else 'en-curso', 'paso': paso,
                'vistos': [n for n in range(31) if mascara >> n & 1], 'visto_en': visto.isoformat(),
                'completada_en': completada.isoformat() if completada else None,
                'superada_en': superada.isoformat() if superada else None}

    def vacio(curso):
        if curso not in set(CON_PROGRESO.values()):
            return None
        return {'evaluacion': 'navegador', 'ultima': None, 'lecciones': []}

    def progreso_por_curso(conexion, usuario_id):
        filas = conexion.execute(f'SELECT {COLUMNAS} FROM progreso_lecciones WHERE usuario_id = %s '
                                 'ORDER BY visto_en DESC, leccion_id', (usuario_id,)).fetchall()
        cursos = {}
        for fila in filas:
            curso = CON_PROGRESO.get(fila[0])
            if not curso:   # lección retirada del manifiesto: se conserva en la base pero no se muestra
                continue
            datos = cursos.setdefault(curso, vacio(curso))
            datos['ultima'] = datos['ultima'] or fila[0]   # filas ordenadas por visita más reciente
            datos['lecciones'].append(leccion_publica(fila))
        return cursos

    @app.post('/api/aula/mis-cursos')
    def registrar_progreso(datos: Progreso, sesion=Depends(con_csrf), conexion=Depends(bd)):
        # Lecciones de Arduino y prácticas de Web/Python; cada una exige inscripción en SU curso.
        leccion_permitida(datos.leccion_id, sesion, conexion, CON_PROGRESO,
                          'Inscríbete en el curso desde el aula para guardar tu avance.')
        mascara = 0
        for paso in {*datos.vistos, datos.paso}:
            mascara |= 1 << paso
        fila = conexion.execute(
            'WITH v AS (SELECT LEAST(now(), GREATEST(now() - %(margen)s, COALESCE(%(visto)s::timestamptz, now()))) AS t) '
            'INSERT INTO progreso_lecciones AS p (usuario_id, leccion_id, paso, pasos_vistos, visto_en, completada_en, superada_en) '
            'SELECT %(u)s, %(l)s, %(paso)s, %(m)s, v.t, CASE WHEN %(c)s THEN v.t END, CASE WHEN %(c)s THEN v.t END FROM v '
            'ON CONFLICT (usuario_id, leccion_id) DO UPDATE SET '
            '  paso = CASE WHEN EXCLUDED.visto_en >= p.visto_en THEN EXCLUDED.paso ELSE p.paso END, '
            '  visto_en = GREATEST(p.visto_en, EXCLUDED.visto_en), '
            '  pasos_vistos = p.pasos_vistos | EXCLUDED.pasos_vistos, '
            '  completada_en = LEAST(p.completada_en, EXCLUDED.completada_en), '
            '  superada_en = GREATEST(p.superada_en, EXCLUDED.superada_en), '
            '  actualizado_en = now() '
            f'RETURNING {COLUMNAS}',
            {'margen': timedelta(days=MARGEN_VISITA_DIAS), 'visto': datos.visto_en, 'u': sesion['usuario_id'],
             'l': datos.leccion_id, 'paso': datos.paso, 'm': mascara, 'c': datos.completada}).fetchone()
        return {'progreso': leccion_publica(fila), 'evaluacion': 'navegador'}

    # ---------- Compilación con el servicio existente (sesión, CSRF, inscripción y límites) ----------
    CURSO_ARDUINO = 'course-arduino'
    NO_DISPONIBLE = 'El compilador no está disponible en este momento. Tu código sigue guardado; inténtalo más tarde.'
    OCUPADO = 'El compilador está ocupado. Espera unos segundos e inténtalo de nuevo.'
    turnos = threading.BoundedSemaphore(max(1, config.compilar_simultaneos))
    cerrojo = threading.Lock()
    estado_cola = {'esperando': 0, 'en_curso': set()}   # usuarios con una compilación en marcha

    def exigir_inscripcion(conexion, usuario_id):
        if not conexion.execute('SELECT 1 FROM inscripciones WHERE usuario_id = %s AND curso_id = %s',
                                (usuario_id, CURSO_ARDUINO)).fetchone():
            raise HTTPException(403, 'Inscríbete en el curso de Arduino desde el aula para compilar.')

    @app.get('/api/aula/compilador/salud')
    def salud_compilador(sesion=Depends(sesion_actual), conexion=Depends(bd)):
        exigir_inscripcion(conexion, sesion['usuario_id'])
        try:
            estado, datos = compilador.pedir(config.compilador_socket, 'GET', '/salud', tiempo=5)
        except compilador.NoDisponible:
            raise HTTPException(503, NO_DISPONIBLE)
        if estado != 200 or not datos.get('ok'):
            raise HTTPException(503, NO_DISPONIBLE)
        return {'ok': True, 'version': datos.get('version') or {}}

    @app.post('/api/aula/compilar')
    def compilar(datos: Compilacion, request: Request):
        # Conexiones a la base cortas: no se retiene ninguna mientras se espera al compilador.
        with pool.connection() as conexion:
            sesion = con_csrf(request, sesion_actual(request, conexion))
            usuario = sesion['usuario_id']
            exigir_inscripcion(conexion, usuario)
            minuto, hora = conexion.execute(
                "SELECT count(*) FILTER (WHERE creado_en > now() - interval '1 minute'), count(*) "
                "FROM compilaciones WHERE usuario_id = %s AND creado_en > now() - interval '1 hour'",
                (usuario,)).fetchone()
        if minuto >= config.compilar_por_minuto:
            raise HTTPException(429, 'Has compilado muchas veces seguidas. Espera un minuto y vuelve a intentarlo.',
                                headers={'Retry-After': '60'})
        if hora >= config.compilar_por_hora:
            raise HTTPException(429, 'Alcanzaste el límite de compilaciones de esta hora. Tu código sigue guardado.',
                                headers={'Retry-After': '600'})
        with cerrojo:   # una compilación por estudiante, aunque use varias sesiones o pestañas
            if usuario in estado_cola['en_curso']:
                raise HTTPException(429, 'Ya tienes una compilación en curso. Espera a que termine.',
                                    headers={'Retry-After': '5'})
            if estado_cola['esperando'] >= config.compilar_max_espera:
                raise HTTPException(503, OCUPADO, headers={'Retry-After': '10'})
            estado_cola['en_curso'].add(usuario)
            estado_cola['esperando'] += 1
        try:
            try:
                turno = turnos.acquire(timeout=config.compilar_espera_s)
            finally:
                with cerrojo:
                    estado_cola['esperando'] -= 1
            if not turno:
                raise HTTPException(503, OCUPADO, headers={'Retry-After': '10'})
            try:
                with pool.connection() as conexion:
                    conexion.execute('INSERT INTO compilaciones (usuario_id) VALUES (%s)', (usuario,))
                    conexion.execute("DELETE FROM compilaciones WHERE usuario_id = %s AND creado_en < now() - interval '1 day'",
                                     (usuario,))
                estado, respuesta = compilador.pedir(config.compilador_socket, 'POST', '/compilar',
                                                     {'placa': 'nano', 'codigo': datos.codigo},
                                                     tiempo=config.compilar_tiempo_s)
            except compilador.NoDisponible as fallo:
                if str(fallo) in ('TimeoutError', 'timeout'):
                    raise HTTPException(504, 'El compilador tardó demasiado en responder. Inténtalo de nuevo.')
                raise HTTPException(503, NO_DISPONIBLE)
            finally:
                turnos.release()
        finally:
            with cerrojo:
                estado_cola['en_curso'].discard(usuario)
        if estado == 200:
            # Resultado del compilador tal cual (incluidos errores del código). No se registra ninguna aprobación.
            return JSONResponse(respuesta)
        if estado in (429, 503):
            raise HTTPException(503, OCUPADO, headers={'Retry-After': '10'})
        if estado in (400, 413):
            raise HTTPException(estado, str(respuesta.get('error') or 'El código no se puede compilar.')[:300])
        raise HTTPException(502, 'Respuesta inesperada del compilador.')

    return app


def error(estado, mensaje):
    return JSONResponse({'detail': mensaje}, status_code=estado,
                        headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})


CONTROL = re.compile(r'[\x00-\x1f\x7f-\x9f​-‏ -‮⁦-⁩]')


class Registro(BaseModel):
    model_config = ConfigDict(extra='forbid')   # campos como «rol» se rechazan
    nombre: str = Field(min_length=2, max_length=60)
    correo: EmailStr = Field(max_length=254)
    clave: str = Field(min_length=10, max_length=128)

    @field_validator('nombre')
    @classmethod
    def nombre_limpio(cls, valor):
        valor = ' '.join(unicodedata.normalize('NFC', valor).split())
        if CONTROL.search(valor) or len(valor) < 2:
            raise ValueError('nombre no válido')
        return valor

    @field_validator('correo')
    @classmethod
    def correo_minusculas(cls, valor):
        return str(valor).lower()


class Acceso(BaseModel):
    model_config = ConfigDict(extra='forbid')
    correo: EmailStr = Field(max_length=254)
    clave: str = Field(min_length=1, max_length=128)

    @field_validator('correo')
    @classmethod
    def correo_minusculas(cls, valor):
        return str(valor).lower()


class Borrador(BaseModel):
    model_config = ConfigDict(extra='forbid')   # sin usuario_id: la identidad sale de la sesión
    codigo: str = Field(max_length=MAX_CODIGO)
    version_base: int | None = Field(default=None, ge=1, le=2_000_000_000)

    @field_validator('codigo')
    @classmethod
    def sin_nulos(cls, valor):
        if '\x00' in valor:
            raise ValueError('carácter nulo')
        return valor


class Compilacion(BaseModel):
    model_config = ConfigDict(extra='forbid')
    placa: Literal['nano'] = 'nano'
    codigo: str = Field(min_length=1, max_length=MAX_CODIGO)

    @field_validator('codigo')
    @classmethod
    def sin_nulos(cls, valor):
        if '\x00' in valor:
            raise ValueError('carácter nulo')
        return valor


class Progreso(BaseModel):
    """Avance declarado por el laboratorio. «completada» solo se envía tras superar el evaluador del navegador."""
    model_config = ConfigDict(extra='forbid')   # sin usuario_id ni fechas de finalización: las decide el servidor
    leccion_id: str = Field(pattern=r'^[a-z0-9-]{3,60}$')
    paso: StrictInt = Field(ge=0, le=MAX_PASO)
    vistos: list[StrictInt] = Field(default_factory=list, max_length=MAX_PASO + 1)
    visto_en: datetime | None = None   # momento de la visita en el navegador (se acota a [ahora - 30 días, ahora])
    completada: StrictBool = False

    @field_validator('vistos')
    @classmethod
    def pasos_validos(cls, valor):
        if any(not 0 <= n <= MAX_PASO for n in valor):
            raise ValueError('paso fuera de rango')
        return valor

    @field_validator('visto_en')
    @classmethod
    def con_zona(cls, valor):
        if valor is not None and valor.tzinfo is None:
            raise ValueError('fecha sin zona horaria')
        return valor


class Inscripcion(BaseModel):
    model_config = ConfigDict(extra='forbid')
    curso_id: str = Field(pattern=r'^[a-z0-9-]{3,60}$')
