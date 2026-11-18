"""Arnés de ejecución del Laboratorio Python de GLOBALT (se ejecuta dentro del intérprete del navegador).

Un mismo archivo para el Worker (Pyodide) y para las pruebas con CPython, así el reto se comprueba igual en
ambos. Cada ejecución:
  - crea una carpeta virtual nueva (solo memoria del navegador) con los archivos de la práctica,
  - sustituye input() por una lectura de la «Entrada» (una línea por llamada; EOFError si se acaban),
  - limita la salida para que un print() en un bucle infinito no bloquee la página,
  - devuelve la salida, el error con archivo, línea y tipo, los archivos resultantes y, si se piden,
    los valores de expresiones evaluadas después del programa (para comprobar funciones).
No hay red ni acceso al disco del estudiante: los archivos son virtuales y se borran al terminar.
"""
import builtins
import importlib
import os
import shutil
import sys
import tempfile
import traceback

LIMITE_SALIDA = 20000          # caracteres
LIMITE_ARCHIVO = 20000         # caracteres por archivo devuelto
BLOQUEADOS = {'js', 'pyodide', 'pyodide_js', '_pyodide', 'micropip', 'pyodide_http'}


class SalidaExcedida(BaseException):
    """No hereda de Exception: un «except Exception» del estudiante no la atrapa."""


class _Flujo:
    def __init__(self, clase, emitir, estado):
        self.clase, self.emitir, self.estado = clase, emitir, estado

    def write(self, texto):
        texto = str(texto)
        if not texto:
            return 0
        restante = LIMITE_SALIDA - self.estado['caracteres']
        if restante <= 0:
            raise SalidaExcedida()
        trozo = texto[:restante]
        self.estado['caracteres'] += len(trozo)
        self.estado['partes'].append((self.clase, trozo))
        self.emitir(self.clase, trozo)
        if len(trozo) < len(texto):
            raise SalidaExcedida()
        return len(texto)

    def flush(self):
        pass

    def isatty(self):
        return False


def _info_error(exc, nombres):
    """Tipo, mensaje y la línea más interna que pertenezca a un archivo del estudiante."""
    mensaje = str(exc)
    try:   # incluye las sugerencias de Python («Did you mean: 'total'?»), que str(exc) no trae
        ultima = list(traceback.TracebackException.from_exception(exc).format_exception_only())[-1].strip()
        prefijo = type(exc).__name__ + ': '
        if ultima.startswith(prefijo):
            mensaje = ultima[len(prefijo):]
    except Exception:   # noqa: BLE001
        pass
    info = {'tipo': type(exc).__name__, 'mensaje': mensaje, 'archivo': None, 'linea': None, 'columna': None,
            'texto': None, 'traza': []}
    if isinstance(exc, SyntaxError):
        info.update(mensaje=exc.msg, archivo=os.path.basename(exc.filename or '') or None,
                    linea=exc.lineno, columna=exc.offset, texto=(exc.text or '').rstrip('\n') or None)
    for marco in traceback.extract_tb(exc.__traceback__):
        nombre = os.path.basename(marco.filename)
        if nombre in nombres:
            info['traza'].append({'archivo': nombre, 'linea': marco.lineno, 'funcion': marco.name, 'texto': marco.line})
    if info['traza'] and not isinstance(exc, SyntaxError):
        ultimo = info['traza'][-1]
        info.update(archivo=ultimo['archivo'], linea=ultimo['linea'], texto=ultimo['texto'])
    return info


def ejecutar(archivos, principal, entrada, llamadas=(), emitir=None):
    """archivos: {nombre: texto}; principal: nombre del .py que se ejecuta; entrada: lista de líneas."""
    emitir = emitir or (lambda clase, texto: None)
    estado = {'caracteres': 0, 'partes': []}
    pendientes = [str(x) for x in entrada]
    usadas = [0]
    carpeta = tempfile.mkdtemp(prefix='practica-')
    anterior_dir = os.getcwd()
    anterior = (sys.stdout, sys.stderr, builtins.input, builtins.__import__, list(sys.path))
    modulos = {n[:-3] for n in archivos if n.endswith('.py')}
    nombres = set(archivos)
    resultado = {'estado': 'ok', 'error': None, 'archivos': {}, 'llamadas': [], 'entradas_usadas': 0}

    def leer(mensaje=''):
        indicador.write(str(mensaje))
        if not pendientes:
            raise EOFError('EOF when reading a line')
        valor = pendientes.pop(0)
        usadas[0] += 1
        eco.write(valor + '\n')
        return valor

    importar_original = builtins.__import__

    def importar(nombre, *args, **kwargs):
        if nombre.split('.')[0] in BLOQUEADOS:
            raise ImportError(f"El módulo '{nombre}' no está disponible en el laboratorio")
        return importar_original(nombre, *args, **kwargs)

    salida = _Flujo('salida', emitir, estado)
    eco = _Flujo('entrada', emitir, estado)
    indicador = _Flujo('indicador', emitir, estado)   # texto de input(): se muestra pero no se compara
    errores = _Flujo('error', emitir, estado)
    espacio = {'__name__': '__main__', '__builtins__': builtins}
    try:
        for nombre, texto in archivos.items():
            with open(os.path.join(carpeta, nombre), 'w', encoding='utf-8') as f:
                f.write(texto)
        for m in modulos:
            sys.modules.pop(m, None)
        importlib.invalidate_caches()
        os.chdir(carpeta)
        sys.path.insert(0, carpeta)
        sys.stdout, sys.stderr = salida, errores
        builtins.input, builtins.__import__ = leer, importar
        try:
            codigo = compile(archivos[principal], principal, 'exec')
            exec(codigo, espacio)
        except SystemExit as e:
            if e.code not in (None, 0):
                resultado['estado'] = 'error'
                resultado['error'] = {'tipo': 'SystemExit', 'mensaje': str(e.code), 'archivo': None, 'linea': None,
                                      'columna': None, 'texto': None, 'traza': []}
        except SalidaExcedida:
            resultado['estado'] = 'salida-excedida'
        except BaseException as e:   # noqa: BLE001 — se informa al estudiante, no se relanza
            resultado['estado'] = 'error'
            resultado['error'] = _info_error(e, nombres)
        if resultado['estado'] == 'ok':
            for expresion in llamadas:
                try:
                    valor = eval(compile(expresion, '<comprobación>', 'eval'), espacio)
                    resultado['llamadas'].append({'expr': expresion, 'ok': True, 'repr': repr(valor)})
                except SalidaExcedida:
                    resultado['estado'] = 'salida-excedida'
                    break
                except BaseException as e:   # noqa: BLE001
                    resultado['llamadas'].append({'expr': expresion, 'ok': False, 'error': _info_error(e, nombres)})
        for nombre in sorted(os.listdir(carpeta)):
            ruta = os.path.join(carpeta, nombre)
            if os.path.isfile(ruta) and not nombre.endswith('.pyc'):
                try:
                    with open(ruta, encoding='utf-8') as f:
                        resultado['archivos'][nombre] = f.read(LIMITE_ARCHIVO)
                except (UnicodeDecodeError, OSError):
                    resultado['archivos'][nombre] = None
    finally:
        sys.stdout, sys.stderr, builtins.input, builtins.__import__, sys.path[:] = anterior
        os.chdir(anterior_dir)
        for m in modulos:
            sys.modules.pop(m, None)
        shutil.rmtree(carpeta, ignore_errors=True)
    resultado['entradas_usadas'] = usadas[0]
    resultado['salida'] = ''.join(t for c, t in estado['partes'] if c == 'salida')
    resultado['consola'] = [[c, t] for c, t in estado['partes']]
    return resultado


def version():
    return sys.version.split()[0]
