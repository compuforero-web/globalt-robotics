"""API del aula: registro de adultos, sesión de servidor y cursos del estudiante. Prefijo: /api/aula."""
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
import re
import threading
import unicodedata
from typing import Literal
from urllib.parse import urlsplit

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg.errors import UniqueViolation
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, StrictInt, field_validator

from . import compilador, correo, seguridad
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
# Términos de uso y autorización de tratamiento de datos (casillas separadas) y política de tratamiento completa,
# que se lee antes de registrarse y se acepta con la casilla de datos (su versión exacta queda en la evidencia).
TIPOS_DOCUMENTO = ('terminos', 'datos', 'politica')
VERSION_DOC = r'^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$'
DIAS_PENDIENTE = 7   # altas sin confirmar: se pueden reenviar durante 7 días y después se borran
ACEPTADO = ('Si los datos son correctos, te enviamos un correo. Revisa tu bandeja de entrada y la carpeta de '
            'correo no deseado. El enlace sirve una sola vez.')
ENLACE_INVALIDO = 'El enlace no es válido, venció o ya se usó. Solicita uno nuevo.'
AUTORIZACION_PENDIENTE = 'Antes de continuar, revisa y acepta los documentos vigentes en el Aula.'


def crear_app(config=None, enviar_correo=None):
    config = config or cargar()
    # enviar_correo(destino, asunto, texto, tipo): inyectable en pruebas; por defecto, SMTP configurado.
    enviar_correo = enviar_correo or (lambda destino, asunto, texto, tipo: correo.enviar(config, destino, asunto, texto, tipo))
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
        sesion = dict(zip(claves, fila))
        sesion['pendientes'] = pendientes_de(conexion, sesion['usuario_id'])
        return sesion

    def con_csrf(request: Request, sesion=Depends(sesion_actual)):
        recibido = request.headers.get('x-csrf-token', '')
        if not recibido or not seguridad.iguales(recibido, sesion['csrf']):
            raise HTTPException(403, 'Falta o no coincide el token CSRF.')
        return sesion

    def publico(sesion):
        return {'nombre': sesion['nombre'], 'correo': sesion['correo'], 'rol': sesion['rol']}

    def autorizada(sesion=Depends(sesion_actual)):
        """Con documentos vigentes, la cuenta debe haber aceptado su versión actual (cuentas anteriores incluidas)."""
        if sesion['pendientes']:
            raise HTTPException(403, AUTORIZACION_PENDIENTE)
        return sesion

    def autorizada_csrf(sesion=Depends(con_csrf)):
        return autorizada(sesion)

    # ---------- Documentos y autorizaciones ----------
    def documentos_vigentes(conexion):
        """Versión vigente de cada documento. Los textos «prueba» solo cuentan con permitir_textos_prueba."""
        estados = ['aprobado', 'prueba'] if config.permitir_textos_prueba else ['aprobado']
        filas = conexion.execute(
            'SELECT DISTINCT ON (tipo) id, tipo, version, titulo, finalidad, sha256, estado FROM documentos_legales '
            'WHERE vigente_desde IS NOT NULL AND vigente_desde <= now() AND estado = ANY(%s) '
            'ORDER BY tipo, vigente_desde DESC, id DESC', (estados,)).fetchall()
        claves = ('id', 'tipo', 'version', 'titulo', 'finalidad', 'sha256', 'estado')
        return {f[1]: dict(zip(claves, f)) for f in filas}

    def doc_publico(doc):
        return {'tipo': doc['tipo'], 'version': doc['version'], 'titulo': doc['titulo'],
                'finalidad': doc['finalidad'], 'prueba': doc['estado'] == 'prueba'}

    def pendientes_de(conexion, usuario_id):
        docs = documentos_vigentes(conexion)
        if not docs:
            return []
        aceptados = {f[0] for f in conexion.execute(
            'SELECT documento_id FROM autorizaciones WHERE usuario_id = %s AND documento_id = ANY(%s)',
            (usuario_id, [d['id'] for d in docs.values()])).fetchall()}
        return [doc_publico(docs[t]) for t in TIPOS_DOCUMENTO if t in docs and docs[t]['id'] not in aceptados]

    def registro_disponible(conexion):
        """El registro público exige decisión explícita, correo configurado y los tres documentos vigentes."""
        docs = documentos_vigentes(conexion)
        abierto = config.registro_abierto and correo.listo(config) and all(t in docs for t in TIPOS_DOCUMENTO)
        return abierto, docs

    def anotar_autorizacion(conexion, usuario_id, documento_id, aceptada_en, via):
        conexion.execute(
            'INSERT INTO autorizaciones (usuario_id, documento_id, tipo, version, sha256, finalidad, aceptada_en, via) '
            'SELECT %s, id, tipo, version, sha256, finalidad, %s, %s FROM documentos_legales WHERE id = %s '
            'ON CONFLICT (usuario_id, documento_id) DO NOTHING', (usuario_id, aceptada_en, via, documento_id))

    def limitar_ip(conexion, request, tipo, maximo):
        if contar(conexion, tipo, ip(request)) >= maximo:
            raise HTTPException(429, 'Demasiadas solicitudes desde esta conexión. Espera unos minutos.',
                                headers={'Retry-After': str(config.ventana_min * 60)})
        anotar(conexion, tipo, ip(request))

    # Límite por dirección y hora, separado para altas (verificación, reenvío y aviso) y para recuperación.
    def puede_enviar(conexion, direccion, motivo='alta'):
        return contar_hora(conexion, 'correo_envio', f'{motivo}:{direccion}') < config.correos_por_hora

    def anotar_envio(conexion, direccion, motivo='alta'):
        anotar(conexion, 'correo_envio', f'{motivo}:{direccion}')

    def contar_hora(conexion, tipo, clave):
        return conexion.execute(
            "SELECT count(*) FROM intentos WHERE tipo = %s AND clave = %s AND creado_en > now() - interval '1 hour'",
            (tipo, seguridad.huella(clave))).fetchone()[0]

    def curso_valido(conexion, curso_id):
        if curso_id and conexion.execute('SELECT 1 FROM cursos WHERE id = %s AND activo', (curso_id,)).fetchone():
            return curso_id
        return None

    def limpiar_enlaces(conexion):
        conexion.execute("DELETE FROM registros_pendientes WHERE creado_en < now() - %s "
                         "OR usado_en < now() - interval '1 day'", (timedelta(days=DIAS_PENDIENTE),))
        conexion.execute("DELETE FROM enlaces_recuperacion WHERE expira_en < now() - interval '1 day'")

    # ---------- Rutas ----------
    @app.get('/api/aula/salud')
    def salud(conexion=Depends(bd)):
        conexion.execute('SELECT 1')
        return {'ok': True}

    @app.get('/api/aula/config')
    def configuracion_publica(conexion=Depends(bd)):
        abierto, docs = registro_disponible(conexion)
        return {'registro_abierto': abierto, 'recuperacion': correo.listo(config),
                'documentos': {t: doc_publico(docs[t]) for t in TIPOS_DOCUMENTO if t in docs}}

    @app.get('/api/aula/documentos/{tipo}/{version}')
    def documento(tipo: Literal['terminos', 'datos', 'politica'], version: str, conexion=Depends(bd)):
        """Texto exacto de una versión (vigente o anterior), para consultarlo antes y después de aceptarlo."""
        if not re.fullmatch(VERSION_DOC, version):
            raise HTTPException(404, 'Documento no disponible.')
        fila = conexion.execute(
            'SELECT tipo, version, titulo, finalidad, texto, sha256, estado, vigente_desde FROM documentos_legales '
            'WHERE tipo = %s AND version = %s', (tipo, version)).fetchone()
        if not fila or (fila[6] == 'prueba' and not config.permitir_textos_prueba):
            raise HTTPException(404, 'Documento no disponible.')
        return {'tipo': fila[0], 'version': fila[1], 'titulo': fila[2], 'finalidad': fila[3], 'texto': fila[4],
                'sha256': fila[5], 'prueba': fila[6] == 'prueba',
                'vigente_desde': fila[7].isoformat() if fila[7] else None}

    @app.post('/api/aula/registro', status_code=202)
    def registro(datos: Registro, request: Request, conexion=Depends(bd)):
        """Alta de ADULTO en dos pasos: aquí solo se guarda la solicitud y se envía el enlace; la cuenta se crea al
        abrirlo (verificar). La respuesta es la misma tenga o no cuenta el correo."""
        abierto, docs = registro_disponible(conexion)
        if not abierto:
            raise HTTPException(403, 'El registro de cuentas no está abierto. Puedes practicar sin cuenta.')
        if contar(conexion, 'registro_ip', ip(request)) >= config.max_registros_ip:
            raise HTTPException(429, 'Demasiados registros desde esta conexión. Intenta más tarde.')
        anotar(conexion, 'registro_ip', ip(request))
        if datos.clave.lower() == datos.correo.lower():
            raise HTTPException(422, 'La contraseña no puede ser igual al correo.')
        if any(getattr(datos, t) != docs[t]['version'] for t in TIPOS_DOCUMENTO):
            raise HTTPException(409, 'Se publicó una versión nueva de los documentos mientras completabas el formulario. Léela y marca de nuevo la casilla para continuar.')
        hash_clave = seguridad.hash_clave(datos.clave)   # también si el correo ya tiene cuenta (tiempos similares)
        curso = curso_valido(conexion, datos.curso)
        if not puede_enviar(conexion, datos.correo):
            return {'mensaje': ACEPTADO}   # límite por dirección: misma respuesta, sin correo
        limpiar_enlaces(conexion)
        token = seguridad.token()
        existe = conexion.execute('SELECT 1 FROM usuarios WHERE correo = %s', (datos.correo,)).fetchone()
        pendiente = None
        if existe:
            asunto = 'Ya tienes una cuenta en el Aula de GLOBALT ROBOTICS'
            texto = correo.texto_cuenta_existente(correo.pagina(config, curso))
            tipo = 'aviso-cuenta-existente'
        else:
            # La aceptación expresa queda fijada aquí (fecha y versiones exactas) y pasa a la cuenta al verificar.
            pendiente = conexion.execute(
                'INSERT INTO registros_pendientes (correo, nombre, hash_clave, terminos_id, datos_id, politica_id, curso_id, '
                'token_hash, expira_en) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now() + %s) RETURNING id',
                (datos.correo, datos.nombre, hash_clave, docs['terminos']['id'], docs['datos']['id'], docs['politica']['id'], curso,
                 seguridad.huella(token), timedelta(minutes=config.verificacion_min))).fetchone()[0]
            asunto = 'Confirma tu correo · Aula GLOBALT ROBOTICS'
            texto = correo.texto_verificacion(datos.nombre, correo.enlace(config, 'verificar', token, curso),
                                              max(1, config.verificacion_min // 60))
            tipo = 'verificacion'
        try:
            enviar_correo(datos.correo, asunto, texto, tipo)
        except correo.ErrorEnvio:
            if pendiente:
                conexion.execute('DELETE FROM registros_pendientes WHERE id = %s', (pendiente,))
            raise HTTPException(503, 'No pudimos enviar el correo en este momento. No se guardó nada: inténtalo de nuevo en unos minutos.')
        anotar_envio(conexion, datos.correo)
        return {'mensaje': ACEPTADO}

    @app.post('/api/aula/cuenta/reenviar', status_code=202)
    def reenviar(datos: SoloCorreo, request: Request, tareas: BackgroundTasks, conexion=Depends(bd)):
        """Nuevo enlace para un alta pendiente (el anterior deja de servir). Misma respuesta en todos los casos."""
        limitar_ip(conexion, request, 'correo_ip', config.max_correos_ip)
        if not correo.listo(config) or not puede_enviar(conexion, datos.correo):
            return {'mensaje': ACEPTADO}
        fila = conexion.execute(
            'SELECT p.id, p.nombre, p.curso_id FROM registros_pendientes p WHERE p.correo = %s AND p.usado_en IS NULL '
            'AND p.creado_en > now() - %s AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.correo = p.correo) '
            'ORDER BY p.creado_en DESC LIMIT 1', (datos.correo, timedelta(days=DIAS_PENDIENTE))).fetchone()
        if fila:
            token = seguridad.token()
            conexion.execute('UPDATE registros_pendientes SET token_hash = %s, expira_en = now() + %s WHERE id = %s',
                             (seguridad.huella(token), timedelta(minutes=config.verificacion_min), fila[0]))
            anotar_envio(conexion, datos.correo)
            texto = correo.texto_verificacion(fila[1], correo.enlace(config, 'verificar', token, fila[2]),
                                              max(1, config.verificacion_min // 60))
            tareas.add_task(enviar_en_segundo_plano, datos.correo, 'Confirma tu correo · Aula GLOBALT ROBOTICS', texto, 'verificacion')
        return {'mensaje': ACEPTADO}

    def enviar_en_segundo_plano(destino, asunto, texto, tipo):
        # Tras responder: el tiempo de envío no revela si el correo tiene cuenta. Un fallo solo se anota (sin enlace);
        # la persona puede volver a pedirlo dentro del límite por hora.
        try:
            enviar_correo(destino, asunto, texto, tipo)
        except correo.ErrorEnvio:
            pass

    @app.post('/api/aula/cuenta/verificar')
    def verificar(datos: Enlace, request: Request, respuesta: Response, conexion=Depends(bd)):
        """Abre el enlace del correo: con la contraseña elegida al registrarse se crea la cuenta y se inicia sesión."""
        if contar(conexion, 'enlace_ip', ip(request)) >= config.max_fallos_ip:
            raise HTTPException(429, 'Demasiados intentos. Espera unos minutos.', headers={'Retry-After': str(config.ventana_min * 60)})
        fila = conexion.execute(
            'SELECT id, correo, nombre, hash_clave, terminos_id, datos_id, politica_id, curso_id, creado_en FROM registros_pendientes '
            'WHERE token_hash = %s AND usado_en IS NULL AND expira_en > now()', (seguridad.huella(datos.token),)).fetchone()
        if not fila:
            anotar(conexion, 'enlace_ip', ip(request))
            raise HTTPException(410, ENLACE_INVALIDO)
        pid, direccion, nombre, hash_clave, terminos_id, datos_id, politica_id, curso, aceptada_en = fila
        if contar(conexion, 'acceso_correo', direccion) >= config.max_fallos_correo:
            raise HTTPException(429, 'Demasiados intentos fallidos. Espera unos minutos.',
                                headers={'Retry-After': str(config.ventana_min * 60)})
        if not seguridad.verificar_clave(hash_clave, datos.clave):
            anotar(conexion, 'acceso_correo', direccion)
            anotar(conexion, 'acceso_ip', ip(request))
            raise HTTPException(401, 'La contraseña no coincide con la que elegiste al crear la cuenta.')
        try:
            with conexion.transaction():
                if not conexion.execute('UPDATE registros_pendientes SET usado_en = now() WHERE id = %s AND usado_en IS NULL '
                                        'RETURNING id', (pid,)).fetchone():
                    raise HTTPException(410, ENLACE_INVALIDO)
                usuario_id = conexion.execute(
                    "INSERT INTO usuarios (correo, nombre, hash_clave, rol, origen, correo_verificado_en, mayor_edad_declarada_en) "
                    "VALUES (%s, %s, %s, 'estudiante', 'registro', now(), %s) RETURNING id",
                    (direccion, nombre, hash_clave, aceptada_en)).fetchone()[0]
                for documento_id in (d for d in (terminos_id, datos_id, politica_id) if d):
                    anotar_autorizacion(conexion, usuario_id, documento_id, aceptada_en, 'registro')
                conexion.execute('DELETE FROM registros_pendientes WHERE correo = %s AND id <> %s', (direccion, pid))
                csrf = abrir_sesion(conexion, respuesta, usuario_id)
        except UniqueViolation:
            conexion.execute('UPDATE registros_pendientes SET usado_en = now() WHERE id = %s', (pid,))
            raise HTTPException(409, 'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.')
        return {'usuario': {'nombre': nombre, 'correo': direccion, 'rol': 'estudiante'}, 'csrf': csrf,
                'curso_id': curso, 'pendientes': pendientes_de(conexion, usuario_id)}

    @app.post('/api/aula/cuenta/recuperar', status_code=202)
    def recuperar(datos: SoloCorreo, request: Request, tareas: BackgroundTasks, conexion=Depends(bd)):
        """Enlace para elegir otra contraseña. Misma respuesta (y sin esperar al envío) tenga o no cuenta el correo."""
        if not correo.listo(config):
            raise HTTPException(503, 'La recuperación por correo todavía no está disponible.')
        limitar_ip(conexion, request, 'correo_ip', config.max_correos_ip)
        fila = conexion.execute('SELECT id FROM usuarios WHERE correo = %s', (datos.correo,)).fetchone()
        if fila and puede_enviar(conexion, datos.correo, 'recuperacion'):
            limpiar_enlaces(conexion)
            token = seguridad.token()
            conexion.execute('INSERT INTO enlaces_recuperacion (token_hash, usuario_id, expira_en) VALUES (%s, %s, now() + %s)',
                             (seguridad.huella(token), fila[0], timedelta(minutes=config.recuperacion_min)))
            anotar_envio(conexion, datos.correo, 'recuperacion')
            texto = correo.texto_recuperacion(correo.enlace(config, 'restablecer', token, curso_valido(conexion, datos.curso)),
                                              config.recuperacion_min)
            tareas.add_task(enviar_en_segundo_plano, datos.correo, 'Cambia tu contraseña · Aula GLOBALT ROBOTICS', texto, 'recuperacion')
        return {'mensaje': ACEPTADO}

    @app.post('/api/aula/cuenta/restablecer')
    def restablecer(datos: Enlace, request: Request, respuesta: Response, conexion=Depends(bd)):
        """Enlace de recuperación (un solo uso): nueva contraseña, cierre de las demás sesiones e inicio de sesión."""
        if contar(conexion, 'enlace_ip', ip(request)) >= config.max_fallos_ip:
            raise HTTPException(429, 'Demasiados intentos. Espera unos minutos.', headers={'Retry-After': str(config.ventana_min * 60)})
        if len(datos.clave) < 10:
            raise HTTPException(422, 'La contraseña debe tener al menos 10 caracteres.')
        if not conexion.execute('SELECT 1 FROM enlaces_recuperacion WHERE token_hash = %s AND usado_en IS NULL AND expira_en > now()',
                                (seguridad.huella(datos.token),)).fetchone():
            anotar(conexion, 'enlace_ip', ip(request))   # sin calcular Argon2 para enlaces inválidos
            raise HTTPException(410, ENLACE_INVALIDO)
        hash_nuevo = seguridad.hash_clave(datos.clave)
        with conexion.transaction():
            fila = conexion.execute(
                'UPDATE enlaces_recuperacion e SET usado_en = now() FROM usuarios u WHERE e.token_hash = %s '
                'AND e.usado_en IS NULL AND e.expira_en > now() AND u.id = e.usuario_id RETURNING u.id, u.correo, u.nombre, u.rol',
                (seguridad.huella(datos.token),)).fetchone()
            if not fila:
                anotar(conexion, 'enlace_ip', ip(request))
                usuario_id = None
            else:
                usuario_id, direccion, nombre, rol = fila
                if datos.clave.lower() == direccion:
                    raise HTTPException(422, 'La contraseña no puede ser igual al correo.')   # deshace: el enlace sigue sirviendo
                conexion.execute('UPDATE usuarios SET hash_clave = %s, correo_verificado_en = COALESCE(correo_verificado_en, now()) '
                                 'WHERE id = %s', (hash_nuevo, usuario_id))
                conexion.execute('UPDATE sesiones SET revocada_en = now() WHERE usuario_id = %s AND revocada_en IS NULL', (usuario_id,))
                conexion.execute('DELETE FROM enlaces_recuperacion WHERE usuario_id = %s AND usado_en IS NULL', (usuario_id,))
                conexion.execute('DELETE FROM intentos WHERE tipo = %s AND clave = %s', ('acceso_correo', seguridad.huella(direccion)))
                csrf = abrir_sesion(conexion, respuesta, usuario_id)
        if usuario_id is None:
            raise HTTPException(410, ENLACE_INVALIDO)
        return {'usuario': {'nombre': nombre, 'correo': direccion, 'rol': rol}, 'csrf': csrf,
                'pendientes': pendientes_de(conexion, usuario_id)}

    @app.post('/api/aula/cuenta/autorizar')
    def autorizar(datos: Autorizacion, sesion=Depends(con_csrf), conexion=Depends(bd)):
        """Aceptación expresa de las versiones vigentes por una cuenta que aún no las aceptó (p. ej. anterior al registro)."""
        recibidas = {t: getattr(datos, t) for t in TIPOS_DOCUMENTO}
        pendientes = sesion['pendientes']
        if not pendientes:
            return {'pendientes': []}
        if any(recibidas[p['tipo']] != p['version'] for p in pendientes):
            raise HTTPException(409, 'Los documentos cambiaron. Recarga la página y revísalos de nuevo.')
        docs = documentos_vigentes(conexion)
        with conexion.transaction():
            for p in pendientes:
                anotar_autorizacion(conexion, sesion['usuario_id'], docs[p['tipo']]['id'], datetime.now(UTC), 'cuenta-existente')
        return {'pendientes': pendientes_de(conexion, sesion['usuario_id'])}

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
        return {'usuario': {'nombre': fila[2], 'correo': datos.correo, 'rol': fila[3]}, 'csrf': csrf,
                'pendientes': pendientes_de(conexion, fila[0])}

    @app.get('/api/aula/sesion')
    def consultar(sesion=Depends(sesion_actual)):
        return {'usuario': publico(sesion), 'csrf': sesion['csrf'], 'pendientes': sesion['pendientes']}

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
    def mis_cursos(sesion=Depends(autorizada), conexion=Depends(bd)):
        filas = conexion.execute(
            'SELECT c.id, c.titulo, c.ruta_laboratorio, i.creada_en FROM inscripciones i '
            'JOIN cursos c ON c.id = i.curso_id WHERE i.usuario_id = %s ORDER BY i.creada_en',
            (sesion['usuario_id'],)).fetchall()
        progreso = progreso_por_curso(conexion, sesion['usuario_id'])
        return {'cursos': [{'id': f[0], 'titulo': f[1], 'laboratorio': f[2], 'inscrito_en': f[3].isoformat(),
                            'progreso': progreso.get(f[0], vacio(f[0]))} for f in filas]}

    @app.post('/api/aula/inscripciones')
    def inscribir(datos: Inscripcion, respuesta: Response, sesion=Depends(autorizada_csrf), conexion=Depends(bd)):
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
    def ver_borrador(leccion_id: str, sesion=Depends(autorizada), conexion=Depends(bd)):
        leccion_permitida(leccion_id, sesion, conexion)
        return {'borrador': borrador_publico(leer_borrador(conexion, sesion['usuario_id'], leccion_id))}

    @app.put('/api/aula/borradores/{leccion_id}')
    def guardar_borrador(leccion_id: str, datos: Borrador, sesion=Depends(autorizada_csrf), conexion=Depends(bd)):
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
    def registrar_progreso(datos: Progreso, sesion=Depends(autorizada_csrf), conexion=Depends(bd)):
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
    def salud_compilador(sesion=Depends(autorizada), conexion=Depends(bd)):
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
            sesion = autorizada(con_csrf(request, sesion_actual(request, conexion)))
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


class DatosCuenta(BaseModel):
    """Nombre visible o alias, correo y contraseña: lo único que se pide (ni documento, ni teléfono, ni fecha de nacimiento)."""
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


class Registro(DatosCuenta):
    """Registro público: solo adultos, con aceptación expresa de las versiones exactas de ambos documentos."""
    mayor_de_edad: Literal[True]                       # declaración expresa; quien indica ser menor no llega a enviar
    terminos: str = Field(pattern=VERSION_DOC)         # versión de los términos de uso que se aceptan
    datos: str = Field(pattern=VERSION_DOC)            # versión de la autorización de tratamiento de datos
    politica: str | None = Field(default=None, pattern=VERSION_DOC)   # versión de la política leída (exigida si está vigente)
    curso: str | None = Field(default=None, pattern=r'^[a-z0-9-]{3,60}$')   # curso elegido (para volver a él)


class SoloCorreo(BaseModel):
    model_config = ConfigDict(extra='forbid')
    correo: EmailStr = Field(max_length=254)
    curso: str | None = Field(default=None, pattern=r'^[a-z0-9-]{3,60}$')

    @field_validator('correo')
    @classmethod
    def correo_minusculas(cls, valor):
        return str(valor).lower()


class Enlace(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=20, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')
    clave: str = Field(min_length=1, max_length=128)


class Autorizacion(BaseModel):
    model_config = ConfigDict(extra='forbid')
    terminos: str | None = Field(default=None, pattern=VERSION_DOC)
    datos: str | None = Field(default=None, pattern=VERSION_DOC)
    politica: str | None = Field(default=None, pattern=VERSION_DOC)


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
