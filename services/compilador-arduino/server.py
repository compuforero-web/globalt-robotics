#!/usr/bin/env python3
"""Servicio de compilación Arduino Nano (ATmega328P) de GLOBALT Robotics.

Solo compila: recibe el código del estudiante, ejecuta avr-gcc con límites y
devuelve el archivo HEX y los diagnósticos. Nunca ejecuta el programa compilado;
la emulación ocurre en el navegador. Sin dependencias fuera de la biblioteca estándar.

Variables de entorno:
  COMPILADOR_SOCKET   ruta de socket Unix donde escuchar (recomendado en producción)
  COMPILADOR_TCP      alternativa de desarrollo, p. ej. 127.0.0.1:8090
  COMPILADOR_NUCLEO   carpeta con core.a e include/ (ver build-core.sh)
  COMPILADOR_SIMULTANEOS (2)  COMPILADOR_ESPERA (10 s)  COMPILADOR_TIEMPO (20 s)
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import resource
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
# Evita que el código lea archivos del contenedor y los devuelva en el HEX o en errores.
INCLUDE_VALIDO = re.compile(r'^\s*#\s*include\s*[<"]([A-Za-z0-9_][A-Za-z0-9_.-]*(?:/[A-Za-z0-9_][A-Za-z0-9_.-]*)*)[>"]\s*$')
DIAGNOSTICO = re.compile(r'^sketch\.ino:(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)$')

cola = threading.BoundedSemaphore(SIMULTANEOS)
en_cola = threading.BoundedSemaphore(MAX_EN_COLA)


def version_compilador():
    try:
        salida = subprocess.run(['avr-gcc', '-dumpversion'], capture_output=True, text=True, timeout=5)
        return 'avr-gcc ' + salida.stdout.strip()
    except Exception:
        return 'avr-gcc (no disponible)'


def validar(codigo):
    if not isinstance(codigo, str) or not codigo.strip():
        return 'El programa está vacío.'
    if len(codigo.encode()) > MAX_CODIGO:
        return 'El programa supera 32 KB.'
    if '\0' in codigo:
        return 'El programa contiene caracteres no válidos.'
    for numero, linea in enumerate(codigo.splitlines(), 1):
        if re.match(r'^\s*#\s*include', linea) and (not INCLUDE_VALIDO.match(linea) or '..' in linea):
            return f'Línea {numero}: solo se permiten #include de bibliotecas por nombre, sin rutas.'
    if re.search(r'incbin|__has_include|#\s*pragma\s+GCC\s+(system_header|dependency)', codigo, re.I):
        return 'El programa usa directivas de lectura de archivos no permitidas.'
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


def limites():
    os.setsid()
    resource.setrlimit(resource.RLIMIT_CPU, (int(TIEMPO), int(TIEMPO) + 1))
    resource.setrlimit(resource.RLIMIT_AS, (1024 ** 3, 1024 ** 3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 ** 2, 16 * 1024 ** 2))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def ejecutar(args, carpeta, limite):
    entorno = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TMPDIR': str(carpeta)}
    proceso = subprocess.Popen(args, cwd=carpeta, env=entorno, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               preexec_fn=limites)
    try:
        salida, _ = proceso.communicate(timeout=max(1, limite))
    except subprocess.TimeoutExpired:
        os.killpg(proceso.pid, signal.SIGKILL)
        proceso.communicate()
        raise TimeoutError
    return proceso.returncode, salida.decode('utf-8', 'replace')[:20000]


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


def compilar(codigo):
    inicio = time.monotonic()
    carpeta = Path(tempfile.mkdtemp(prefix='sketch-'))
    try:
        fuente = carpeta / 'sketch.cpp'
        fuente.write_text('#include <Arduino.h>\n' + prototipos(codigo) + '\n#line 1 "sketch.ino"\n' + codigo + '\n')
        incluir = ['-I', str(NUCLEO / 'include'), '-I', str(NUCLEO / 'include' / 'variant')]
        limpio = lambda t: t.replace(str(carpeta) + '/', '').replace(str(NUCLEO) + '/', '')
        codigo_salida, texto = ejecutar(['avr-g++', '-c', *FLAGS, *incluir, 'sketch.cpp', '-o', 'sketch.o'],
                                        carpeta, TIEMPO - (time.monotonic() - inicio))
        if codigo_salida == 0:
            enlace, texto2 = ejecutar(['avr-gcc', '-mmcu=atmega328p', '-Os', '-Wl,--gc-sections',
                                       '-o', 'sketch.elf', 'sketch.o', str(NUCLEO / 'core.a'), '-lm'],
                                      carpeta, TIEMPO - (time.monotonic() - inicio))
            texto += texto2
            codigo_salida = enlace
        texto = limpio(texto)
        respuesta = {'ok': False, 'diagnosticos': diagnosticos(texto), 'salida': texto,
                     'version': {**VERSION, 'compilador': version_compilador()}}
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
            self.responder(200 if listo else 503, {'ok': listo, 'version': {**VERSION, 'compilador': version_compilador()}})
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


if __name__ == '__main__':
    main()
