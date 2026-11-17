#!/usr/bin/env python3
"""Servicio de compilación Arduino Nano (ATmega328P) de GLOBALT Robotics.

Solo compila: recibe el código del estudiante, ejecuta avr-gcc con límites y
devuelve el archivo HEX y los diagnósticos. Nunca ejecuta el programa compilado;
la emulación ocurre en el navegador. Sin dependencias fuera de la biblioteca estándar.

Variables de entorno:
  COMPILADOR_SOCKET   ruta de socket Unix donde escuchar (recomendado en producción)
  COMPILADOR_TCP      alternativa de desarrollo, p. ej. 127.0.0.1:8090
  COMPILADOR_NUCLEO   carpeta con core.a e include/ (ver build-core.sh) y, si existe, servo/ (build-servo.sh)
  COMPILADOR_SIMULTANEOS (2)  COMPILADOR_ESPERA (10 s)  COMPILADOR_TIEMPO (20 s)
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import socketserver
import subprocess
import tempfile
import threading
import time

NUCLEO = Path(os.environ.get('COMPILADOR_NUCLEO', '/opt/nucleo-nano'))
SIMULTANEOS = int(os.environ.get('COMPILADOR_SIMULTANEOS', '2'))
ESPERA = float(os.environ.get('COMPILADOR_ESPERA', '10'))
TIEMPO = float(os.environ.get('COMPILADOR_TIEMPO', '20'))
MAX_CUERPO = 64 * 1024
MAX_CODIGO = 32 * 1024
MAX_EN_COLA = SIMULTANEOS * 4
FLASH_MAX, RAM_MAX = 30720, 2048
VERSION = {'placa': 'Arduino Nano (ATmega328P, 16 MHz)',
           'compilador': 'avr-gcc', 'nucleo': 'ArduinoCore-avr 1.8.6'}

FLAGS = ['-mmcu=atmega328p', '-DF_CPU=16000000L', '-DARDUINO=10819', '-DARDUINO_AVR_NANO',
         '-DARDUINO_ARCH_AVR', '-Os', '-Wall', '-std=gnu++11', '-fpermissive', '-fno-exceptions',
         '-ffunction-sections', '-fdata-sections', '-fno-threadsafe-statics',
         '-fno-diagnostics-color', '-fmax-errors=20']
# Primera capa (texto): rechaza pronto las directivas de lectura de archivos con un mensaje claro.
# No es el control de seguridad: el control decisivo usa la salida real del preprocesador y del
# compilador (ver revisar_preprocesado y revisar_ensamblador), y el aislamiento lo da el contenedor.
INCLUDE_VALIDO = re.compile(r'^#\s*include\s*[<"]([A-Za-z0-9_][A-Za-z0-9_.-]*(?:/[A-Za-z0-9_][A-Za-z0-9_.-]*)*)[>"]\s*$')
DIRECTIVAS_PROHIBIDAS = re.compile(r'^#\s*(include_next|import|embed)\b|^#\s*pragma\s+GCC\s+(system_header|dependency|poison)\b')
IDENTIFICADORES_PROHIBIDOS = re.compile(r'\b(__has_include|__has_include_next|_Pragma|asm|__asm|__asm__)\b')
# Directivas de GNU as que leen archivos o generan instrucciones que el filtro no podría ver.
ENSAMBLADOR_PROHIBIDO = re.compile(r'\.(incbin|include|macro|irpc?|rept|altmacro|purgem)\b', re.I)
DIAGNOSTICO = re.compile(r'^sketch\.ino:(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)$')

cola = threading.BoundedSemaphore(SIMULTANEOS)
en_cola = threading.BoundedSemaphore(MAX_EN_COLA)
activas = {'n': 0}                    # peticiones en curso (para terminar las pendientes al detener el servicio)
activas_cerrojo = threading.Lock()


def carpeta_servo():
    """Librería Servo precompilada (build-servo.sh) o None si esta imagen no la incluye."""
    carpeta = NUCLEO / 'servo'
    return carpeta if (carpeta / 'servo.a').is_file() and (carpeta / 'include' / 'Servo.h').is_file() else None


def version_servo():
    carpeta = carpeta_servo()
    try:
        return (carpeta / 'VERSION').read_text().strip()[:200] if carpeta else None
    except OSError:
        return None


def version():
    """Versión que informan /salud y /compilar. «servo» solo aparece si la imagen incluye la librería
    (los clientes existentes ignoran claves nuevas)."""
    datos = {**VERSION, 'compilador': version_compilador()}
    servo = version_servo()
    if servo:
        datos['servo'] = servo
    return datos


def version_compilador():
    try:
        salida = subprocess.run(['avr-gcc', '-dumpversion'], capture_output=True, text=True, timeout=5)
        return 'avr-gcc ' + salida.stdout.strip()
    except Exception:
        return 'avr-gcc (no disponible)'


def texto_canonico(codigo):
    """Aproxima las primeras fases de traducción de C++: une líneas con «\\» final, cambia los
    dígrafos «%:» por «#» y reemplaza los comentarios por un espacio (fuera de cadenas)."""
    texto = re.sub(r'\\[ \t]*\r?\n', '', codigo).replace('%:', '#')
    return re.sub(r'//[^\n]*|/\*.*?(?:\*/|$)|"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'',
                  lambda m: m[0] if m[0][0] in '"\'' else ' ', texto, flags=re.S)


def validar(codigo):
    if not isinstance(codigo, str) or not codigo.strip():
        return 'El programa está vacío.'
    if len(codigo.encode()) > MAX_CODIGO:
        return 'El programa supera 32 KB.'
    if '\0' in codigo:
        return 'El programa contiene caracteres no válidos.'
    canonico = texto_canonico(codigo)
    for numero, linea in enumerate(canonico.splitlines(), 1):
        directiva = linea.strip()
        if not directiva.startswith('#'):
            continue
        if DIRECTIVAS_PROHIBIDAS.match(directiva):
            return f'Directiva {numero}: no permitida en el laboratorio.'
        if re.match(r'^#\s*include', directiva) and (not INCLUDE_VALIDO.match(directiva) or '..' in directiva):
            return f'Directiva {numero}: solo se permiten #include de bibliotecas por nombre, sin rutas ni macros.'
    sin_cadenas = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', canonico)
    if IDENTIFICADORES_PROHIBIDOS.search(sin_cadenas) or ENSAMBLADOR_PROHIBIDO.search(canonico):
        return 'El laboratorio no admite ensamblador en línea ni directivas de lectura de archivos.'
    return None


TIPOS_SIMPLES = re.compile(r'^(?:const|unsigned|signed|long|short|int|void|bool|boolean|byte|word|char|float|double|'
                           r'String|size_t|u?int(?:8|16|32|64)_t|\s|\*|&)+$')
FUNCION = re.compile(r'(?m)^[ \t]*((?:[A-Za-z_][\w]*[ \t*&]+)+)([A-Za-z_]\w*)[ \t]*\(([^;{}()]*)\)[ \t]*\{')


def prototipos(codigo):
    """Como el IDE de Arduino, declara antes del programa las funciones definidas en él.

    Solo para funciones de nivel superior con tipos básicos; el resto queda como C++ normal."""
    sin_comentarios = re.sub(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\\n])*"', lambda m: re.sub(r'[^\n]', ' ', m[0]), codigo, flags=re.S)
    profundidad, nivel_superior = 0, []
    for caracter in sin_comentarios:
        nivel_superior.append(profundidad == 0)
        profundidad += (caracter == '{') - (caracter == '}')
    declaraciones = []
    for m in FUNCION.finditer(sin_comentarios):
        tipo, nombre, parametros = m[1].strip(), m[2], m[3].strip()
        if not nivel_superior[m.start(2)] or nombre in ('setup', 'loop', 'if', 'while', 'for', 'switch'):
            continue
        partes = [p.strip() for p in parametros.split(',') if p.strip()] if parametros else []
        if TIPOS_SIMPLES.match(tipo) and all(TIPOS_SIMPLES.match(re.sub(r'\b[A-Za-z_]\w*$', '', p).strip() or 'x') or p == 'void' for p in partes):
            declaraciones.append(f'{tipo} {nombre}({parametros});')
    return '\n'.join(dict.fromkeys(declaraciones))


MAX_SALIDA = 64 * 1024          # salida que se conserva para el estudiante
MAX_SALIDA_TOTAL = 4 * 1024 ** 2  # salida que se tolera antes de detener el proceso


def con_limites(args, cpu):
    """Límites por proceso con prlimit(1): se aplican antes de exec, sin preexec_fn en un servidor
    multihilo. Los descendientes (cc1plus, as, ld) los heredan."""
    return ['prlimit', f'--cpu={cpu}:{cpu + 1}', f'--as={1024 ** 3}', f'--fsize={16 * 1024 ** 2}',
            '--nofile=64', '--core=0', '--', *args]


def matar_grupo(pid):
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def ejecutar(args, carpeta, limite):
    """Ejecuta un comando del compilador en su propio grupo de procesos (start_new_session).

    Lee la salida mientras se produce: conserva MAX_SALIDA bytes, descarta el resto sin bloquear el
    proceso y lo detiene si supera MAX_SALIDA_TOTAL. Al vencer el tiempo mata a todo el grupo."""
    limite = float(limite)
    if limite <= 0:
        raise TimeoutError
    entorno = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TMPDIR': str(carpeta)}
    proceso = subprocess.Popen(con_limites(args, max(1, int(limite + 0.999))), cwd=carpeta, env=entorno,
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               start_new_session=True)
    fin = time.monotonic() + limite
    partes, conservados, total, excedido = [], 0, 0, False
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(proceso.stdout, selectors.EVENT_READ)
            while True:
                restante = fin - time.monotonic()
                if restante <= 0:
                    raise TimeoutError
                if not selector.select(timeout=min(restante, 0.5)):
                    continue
                bloque = os.read(proceso.stdout.fileno(), 65536)
                if not bloque:
                    break
                total += len(bloque)
                if conservados < MAX_SALIDA:
                    partes.append(bloque[:MAX_SALIDA - conservados])
                    conservados += len(partes[-1])
                if total > MAX_SALIDA_TOTAL:
                    excedido = True
                    break
        if excedido:
            matar_grupo(proceso.pid)
        try:
            proceso.wait(timeout=max(0.1, fin - time.monotonic()))
        except subprocess.TimeoutExpired:
            raise TimeoutError
    except BaseException:
        matar_grupo(proceso.pid)
        proceso.wait()
        raise
    finally:
        proceso.stdout.close()
    matar_grupo(proceso.pid)  # por si quedó algún descendiente
    texto = b''.join(partes).decode('utf-8', 'replace')
    if total > conservados:
        texto += f'\n[salida recortada: {total - conservados} bytes omitidos]\n'
    return (proceso.returncode if not excedido else -9), texto


def diagnosticos(texto):
    resultado = []
    for linea in texto.splitlines():
        m = DIAGNOSTICO.match(linea)
        if m:
            resultado.append({'linea': int(m[1]), 'columna': int(m[2]) if m[2] else None,
                              'tipo': 'error' if 'error' in m[3] else m[3], 'mensaje': m[4]})
        elif 'undefined reference to' in linea or 'region `' in linea or 'ld returned' in linea:
            resultado.append({'linea': None, 'columna': None, 'tipo': 'error',
                              'mensaje': linea.split(': ', 1)[-1] if ': ' in linea else linea})
    return resultado[:40]


def tamanos(texto):
    flash = ram = 0
    for linea in texto.splitlines():
        partes = linea.split()
        if len(partes) >= 2 and partes[1].isdigit():
            if partes[0] in ('.text', '.data'):
                flash += int(partes[1])
            if partes[0] in ('.data', '.bss', '.noinit'):
                ram += int(partes[1])
    return flash, ram


LINEMARKER = re.compile(r'^#\s*(?:line\s+)?\d+\s+"((?:\\.|[^"\\])*)"', re.M)
ARCHIVO_EN_MENSAJE = re.compile(r'^(?:In file included from |\s+from )?([^\s:][^:\n]*):\d+(?::\d+)?[:,]', re.M)
NOMBRES_INTERNOS = {'<built-in>', '<command-line>', '<stdin>', 'sketch.ino', 'sketch.cpp'}
_directorios = None


def directorios_permitidos():
    """Carpetas de cabeceras del sistema (según el propio avr-g++) y del núcleo Arduino."""
    global _directorios
    if _directorios is None:
        salida = subprocess.run(['avr-g++', '-xc++', '-E', '-v', '-'], input='', capture_output=True,
                                text=True, timeout=10).stderr
        bloque = salida.split('search starts here:')[-1].split('End of search list.')[0]
        _directorios = [os.path.realpath(l.strip()) for l in bloque.splitlines() if l.strip().startswith('/')]
    servo = carpeta_servo()
    # Solo dos carpetas propias: cabeceras del núcleo y las dos cabeceras de Servo (Servo.h y avr/ServoTimers.h).
    return [*_directorios, os.path.realpath(NUCLEO / 'include'), *([os.path.realpath(servo / 'include')] if servo else [])]


def archivo_permitido(nombre, carpeta):
    nombre = nombre.replace('\\"', '"').replace('\\\\', '\\')
    if nombre in NOMBRES_INTERNOS:
        return True
    ruta = os.path.realpath(os.path.join(carpeta, nombre))
    return any(ruta.startswith(d + os.sep) for d in directorios_permitidos())


def revisar_preprocesado(carpeta, mensajes):
    """Control decisivo de lectura de archivos: el preprocesador real indica en sus marcas de línea
    y mensajes cada archivo que abrió; todos deben ser cabeceras permitidas."""
    preprocesado = carpeta / 'sketch.ii'
    marcas = LINEMARKER.findall(preprocesado.read_text(errors='replace')) if preprocesado.exists() else []
    nombres = set(marcas) | set(ARCHIVO_EN_MENSAJE.findall(mensajes))
    return all(archivo_permitido(n, carpeta) for n in nombres)


def revisar_ensamblador(carpeta):
    """El ensamblador generado no puede contener directivas que lean archivos o creen código oculto."""
    return not ENSAMBLADOR_PROHIBIDO.search((carpeta / 'sketch.s').read_text(errors='replace'))


def rechazo(mensaje):
    return {'ok': False, 'salida': '', 'version': version(),
            'diagnosticos': [{'linea': None, 'columna': None, 'tipo': 'error', 'mensaje': mensaje}]}


def compilar(codigo):
    inicio = time.monotonic()
    restante = lambda: TIEMPO - (time.monotonic() - inicio)
    carpeta = Path(tempfile.mkdtemp(prefix='sketch-'))
    try:
        fuente = carpeta / 'sketch.cpp'
        fuente.write_text('#include <Arduino.h>\n' + prototipos(codigo) + '\n#line 1 "sketch.ino"\n' + codigo + '\n')
        servo = carpeta_servo()
        incluir = ['-I', str(NUCLEO / 'include'), '-I', str(NUCLEO / 'include' / 'variant'),
                   *(['-I', str(servo / 'include')] if servo else [])]
        # servo.a va antes que core.a: el enlazador solo toma Servo.o (y su interrupción de Timer1) si el programa
        # usa la clase Servo; los programas sin Servo producen el mismo HEX que sin la librería.
        bibliotecas = [*([str(servo / 'servo.a')] if servo else []), str(NUCLEO / 'core.a')]
        limpio = lambda t: t.replace(str(carpeta) + '/', '').replace(str(NUCLEO) + '/', '')
        # 1) Preprocesar y comprobar qué archivos se abrieron antes de devolver ningún mensaje.
        codigo_salida, texto = ejecutar(['avr-g++', '-E', *FLAGS, *incluir, 'sketch.cpp', '-o', 'sketch.ii'],
                                        carpeta, restante())
        if not revisar_preprocesado(carpeta, texto):
            return rechazo('El programa intenta leer archivos que no son bibliotecas del laboratorio.')
        # 2) Compilar el texto ya revisado a ensamblador y revisarlo antes de ensamblar.
        if codigo_salida == 0:
            codigo_salida, texto = ejecutar(['avr-g++', '-S', *FLAGS, 'sketch.ii', '-o', 'sketch.s'],
                                            carpeta, restante())
            if codigo_salida == 0 and not revisar_ensamblador(carpeta):
                return rechazo('El programa genera directivas de ensamblador no permitidas en el laboratorio.')
        # 3) Ensamblar y enlazar con el núcleo Arduino precompilado.
        for paso in (['avr-gcc', '-mmcu=atmega328p', '-c', 'sketch.s', '-o', 'sketch.o'],
                     ['avr-gcc', '-mmcu=atmega328p', '-Os', '-Wl,--gc-sections', '-o', 'sketch.elf',
                      'sketch.o', *bibliotecas, '-lm']):
            if codigo_salida != 0:
                break
            codigo_salida, adicional = ejecutar(paso, carpeta, restante())
            texto += adicional
        texto = limpio(texto)
        respuesta = {'ok': False, 'diagnosticos': diagnosticos(texto), 'salida': texto,
                     'version': version()}
        if codigo_salida == 0:
            ejecutar(['avr-objcopy', '-O', 'ihex', '-R', '.eeprom', 'sketch.elf', 'sketch.hex'], carpeta, 10)
            _, medidas = ejecutar(['avr-size', '-A', 'sketch.elf'], carpeta, 10)
            flash, ram = tamanos(medidas)
            respuesta.update(ok=flash <= FLASH_MAX and ram <= RAM_MAX,
                             hex=(carpeta / 'sketch.hex').read_text(),
                             memoria={'flash': flash, 'flashMax': FLASH_MAX, 'ram': ram, 'ramMax': RAM_MAX})
            if not respuesta['ok']:
                respuesta['diagnosticos'].append({'linea': None, 'columna': None, 'tipo': 'error',
                                                  'mensaje': 'El programa no cabe en la memoria del ATmega328P.'})
        respuesta['duracionMs'] = round((time.monotonic() - inicio) * 1000)
        return respuesta
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


class Manejador(BaseHTTPRequestHandler):
    server_version = 'GlobaltCompilador/1'
    sys_version = ''
    timeout = 15

    def handle(self):
        with activas_cerrojo:
            activas['n'] += 1
        try:
            super().handle()
        finally:
            with activas_cerrojo:
                activas['n'] -= 1

    def address_string(self):
        return 'cliente'

    def log_message(self, formato, *args):
        print('[compilador] ' + (formato % args), flush=True)

    def responder(self, estado, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode()
        self.send_response(estado)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(cuerpo)

    def ruta(self):
        ruta = self.path.split('?')[0]
        return ruta[len('/api/arduino'):] if ruta.startswith('/api/arduino/') else ruta

    def do_GET(self):
        if self.ruta() == '/salud':
            listo = (NUCLEO / 'core.a').is_file() and shutil.which('avr-g++') is not None
            self.responder(200 if listo else 503, {'ok': listo, 'version': version()})
        else:
            self.responder(404, {'ok': False, 'error': 'Ruta no encontrada'})

    def do_POST(self):
        if self.ruta() != '/compilar':
            return self.responder(404, {'ok': False, 'error': 'Ruta no encontrada'})
        if 'application/json' not in self.headers.get('Content-Type', ''):
            return self.responder(415, {'ok': False, 'error': 'Se espera JSON'})
        try:
            largo = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            largo = -1
        if largo <= 0 or largo > MAX_CUERPO:
            return self.responder(413, {'ok': False, 'error': 'Solicitud vacía o mayor de 64 KB'})
        try:
            datos = json.loads(self.rfile.read(largo))
            codigo = datos.get('codigo') if isinstance(datos, dict) else None
        except (ValueError, UnicodeDecodeError):
            return self.responder(400, {'ok': False, 'error': 'JSON no válido'})
        if isinstance(datos, dict) and datos.get('placa', 'nano') != 'nano':
            return self.responder(400, {'ok': False, 'error': 'Solo se admite la placa nano'})
        problema = validar(codigo)
        if problema:
            return self.responder(400, {'ok': False, 'error': problema})
        if not en_cola.acquire(blocking=False):
            return self.responder(429, {'ok': False, 'error': 'Demasiadas compilaciones en espera; intenta en unos segundos.'})
        try:
            if not cola.acquire(timeout=ESPERA):
                return self.responder(503, {'ok': False, 'error': 'El compilador está ocupado; intenta de nuevo.'})
            try:
                self.responder(200, compilar(codigo))
            except TimeoutError:
                self.responder(200, {'ok': False, 'diagnosticos': [{'linea': None, 'columna': None, 'tipo': 'error',
                                     'mensaje': f'La compilación superó {int(TIEMPO)} segundos.'}], 'salida': ''})
            finally:
                cola.release()
        finally:
            en_cola.release()


class ServidorUnix(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    socket_unix = os.environ.get('COMPILADOR_SOCKET')
    if socket_unix:
        Path(socket_unix).unlink(missing_ok=True)
        servidor = ServidorUnix(socket_unix, Manejador)
        os.chmod(socket_unix, int(os.environ.get('COMPILADOR_SOCKET_MODO', '660'), 8))
        print('Compilador escuchando en ' + socket_unix, flush=True)
    else:
        host, puerto = os.environ.get('COMPILADOR_TCP', '127.0.0.1:8090').rsplit(':', 1)
        servidor = ThreadingHTTPServer((host, int(puerto)), Manejador)
        servidor.daemon_threads = True
        print(f'Compilador escuchando en http://{host}:{puerto}', flush=True)
    signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=servidor.shutdown).start())
    servidor.serve_forever()
    terminar(servidor)


def terminar(servidor, limite=None):
    """Parada ordenada (SIGTERM, p. ej. docker stop --time 30): deja de aceptar conexiones y espera a que
    terminen las compilaciones en curso (como máximo COMPILADOR_TIEMPO + 5 s) antes de salir."""
    servidor.server_close()
    fin = time.monotonic() + (TIEMPO + 5 if limite is None else limite)
    while time.monotonic() < fin:
        with activas_cerrojo:
            if activas['n'] == 0:
                break
        time.sleep(0.1)
    with activas_cerrojo:
        pendientes = activas['n']
    print(f'Compilador detenido ({pendientes} peticiones sin terminar).', flush=True)


if __name__ == '__main__':
    main()
