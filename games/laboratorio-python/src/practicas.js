// Prácticas de «Python desde Cero» (GLOBALT ROBOTICS). Contenido original, encadenado alrededor de una idea:
// vigilar la batería del robot del club. Cada práctica reutiliza lo construido en la anterior.
//
// Casos del reto: { nombre, entrada: [líneas], archivos?: {nombre: texto | null (borrar)}, salida?: texto exacto,
//   llamadas?: [{ expr, esperado (repr de Python) }], archivosEsperados?: {nombre: texto}, requiere?: {patron, archivo, mensaje} }.
// La salida se compara sin los textos de input() (indicador y eco), ignorando espacios al final de línea y
// líneas vacías finales. Los identificadores son definitivos: con ellos se guardan los borradores.

const html = (s) => s.trim();

const P1 = {
  id: 'python-variables',
  numero: 1,
  corto: 'Variables y operadores',
  titulo: 'Autonomía de la batería',
  objetivo: 'Guardar datos en variables, convertir el texto que escribe el usuario en números y calcular con operadores.',
  secciones: [
    { titulo: 'Variables', html: html(`
      <p>Una variable es un nombre que guarda un valor: <code>capacidad = 2000</code>. El nombre va a la izquierda del <code>=</code> y el valor a la derecha.</p>
      <p>Python distingue tipos: <code>int</code> (enteros, <code>2000</code>), <code>float</code> (decimales, <code>4.5</code>) y <code>str</code> (texto, <code>"hola"</code>).</p>`) },
    { titulo: 'Leer datos', html: html(`
      <p><code>input("Mensaje: ")</code> muestra el mensaje y devuelve <strong>siempre texto</strong>. Para calcular hay que convertirlo: <code>int(input(...))</code> o <code>float(input(...))</code>.</p>
      <p>En el laboratorio, cada línea del cuadro <strong>Entrada</strong> es la respuesta de un <code>input()</code>, en orden.</p>`) },
    { titulo: 'Operadores', html: html(`
      <ul><li><code>+ - *</code> como en matemáticas; <code>/</code> divide y da decimales (<code>7 / 2</code> → <code>3.5</code>).</li>
      <li><code>//</code> división entera (<code>7 // 2</code> → <code>3</code>) y <code>%</code> el resto (<code>7 % 2</code> → <code>1</code>).</li>
      <li>Con <code>f"{valor:.2f}"</code> se muestra un número con dos decimales.</li></ul>`) },
  ],
  ejemplo: { titulo: 'Repartir minutos', codigo: `minutos = 135
horas = minutos // 60
resto = minutos % 60
print(minutos, "minutos son", horas, "h y", resto, "min")
print(f"En horas con decimales: {minutos / 60:.2f}")
`, entrada: '' },
  archivos: [{ nombre: 'programa.py', inicial: `# Práctica 1 · Autonomía de la batería
# Lee la capacidad de la batería (mAh) y el consumo del robot (mA).
capacidad = int(input("Capacidad en mAh: "))
consumo = int(input("Consumo en mA: "))

horas = capacidad / consumo
print("Autonomía:", horas, "h")

# Reto: muestra la autonomía con 2 decimales, conviértela a horas y minutos
# y calcula la autonomía usable si solo se gasta el 80 % de la batería.
` }],
  principal: 'programa.py',
  entrada: '2000\n450',
  reto: {
    enunciado: html(`<p>Con la capacidad (mAh) y el consumo (mA) leídos con <code>input()</code>, el programa debe imprimir exactamente tres líneas:</p>
      <pre class="muestra">Autonomía: 4.44 h
Equivale a 4 h 26 min
Usable (80 %): 3.56 h</pre>
      <p>(ejemplo con 2000 y 450). Los minutos totales son <code>capacidad × 60 ÷ consumo</code> sin decimales; repártelos en horas y minutos con <code>//</code> y <code>%</code>.</p>`),
  },
  casos: [
    { nombre: '2000 mAh y 450 mA', entrada: ['2000', '450'], salida: 'Autonomía: 4.44 h\nEquivale a 4 h 26 min\nUsable (80 %): 3.56 h\n' },
    { nombre: 'Resultado exacto', entrada: ['1500', '500'], salida: 'Autonomía: 3.00 h\nEquivale a 3 h 0 min\nUsable (80 %): 2.40 h\n' },
    { nombre: 'Menos de una hora', entrada: ['999', '1000'], salida: 'Autonomía: 1.00 h\nEquivale a 0 h 59 min\nUsable (80 %): 0.80 h\n' },
    { nombre: 'Batería grande', entrada: ['5200', '1300'], salida: 'Autonomía: 4.00 h\nEquivale a 4 h 0 min\nUsable (80 %): 3.20 h\n' },
  ],
  pistas: [
    'Para dos decimales usa una cadena f: print(f"Autonomía: {horas:.2f} h").',
    'Calcula primero los minutos totales como entero: total = capacidad * 60 // consumo. No partas de las horas ya redondeadas.',
    'Con total listo: total // 60 son las horas y total % 60 los minutos que sobran. La autonomía usable es horas * 0.8.',
  ],
};

const P2 = {
  id: 'python-condicionales',
  numero: 2,
  corto: 'Condicionales y ciclos',
  titulo: 'Semáforo de la batería',
  objetivo: 'Tomar decisiones con if / elif / else y repetir instrucciones con for y while.',
  secciones: [
    { titulo: 'Decidir', html: html(`
      <p><code>if</code> ejecuta un bloque solo si la condición es verdadera. <code>elif</code> prueba otra condición y <code>else</code> recoge el resto. Las comparaciones son <code>==</code>, <code>!=</code>, <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, <code>&gt;=</code>.</p>
      <p>Los bloques se marcan con <strong>dos puntos</strong> y <strong>sangría</strong> (4 espacios). Si la sangría no cuadra, Python avisa con <code>IndentationError</code>.</p>`) },
    { titulo: 'Repetir', html: html(`
      <p><code>for i in range(1, n + 1):</code> repite el bloque con <code>i</code> = 1, 2, …, n. <code>while condición:</code> repite mientras la condición sea verdadera: asegúrate de que algún día deje de serlo.</p>
      <p>Si un programa no termina, pulsa <strong>Detener</strong>: el laboratorio corta la ejecución sin bloquear la página.</p>`) },
    { titulo: 'Contar', html: html(`<p>Para contar casos, crea una variable antes del ciclo (<code>criticas = 0</code>) y súmale 1 dentro (<code>criticas += 1</code>).</p>`) },
  ],
  ejemplo: { titulo: 'Cuenta atrás', codigo: `segundos = int(input("¿Desde cuántos segundos? "))
while segundos > 0:
    if segundos <= 3:
        print(segundos, "¡atención!")
    else:
        print(segundos)
    segundos -= 1
print("¡Salida!")
`, entrada: '5' },
  archivos: [{ nombre: 'programa.py', inicial: `# Práctica 2 · Semáforo de la batería
# Primera línea: cuántas lecturas hay. Después, una tensión (V) por línea.
n = int(input("¿Cuántas lecturas? "))

for i in range(1, n + 1):
    v = float(input(f"Lectura {i}: "))
    print("Lectura", i, ":", v)

# Reto: clasifica cada lectura (OK, BAJA o CRÍTICA), cuenta las críticas
# y termina con un consejo.
` }],
  principal: 'programa.py',
  entrada: '3\n7.4\n6.5\n6.1',
  reto: {
    enunciado: html(`<p>Clasifica cada lectura: <strong>OK</strong> si es de 7.0 V o más, <strong>BAJA</strong> si es de 6.4 V o más, y si no <strong>CRÍTICA</strong>. Con 3 lecturas (7.4, 6.5 y 6.1):</p>
      <pre class="muestra">Lectura 1: 7.4 V -> OK
Lectura 2: 6.5 V -> BAJA
Lectura 3: 6.1 V -> CRÍTICA
Críticas: 1
Cargar antes de competir</pre>
      <p>Las tensiones se muestran con un decimal. Sin críticas, la última línea es <code>Lista para competir</code>. Si la cantidad de lecturas es 0 o menos, imprime solo <code>Sin lecturas</code>.</p>`),
  },
  casos: [
    { nombre: 'Una de cada', entrada: ['3', '7.4', '6.5', '6.1'], salida: 'Lectura 1: 7.4 V -> OK\nLectura 2: 6.5 V -> BAJA\nLectura 3: 6.1 V -> CRÍTICA\nCríticas: 1\nCargar antes de competir\n' },
    { nombre: 'Valores límite', entrada: ['4', '7.0', '6.9', '6.4', '6.3'], salida: 'Lectura 1: 7.0 V -> OK\nLectura 2: 6.9 V -> BAJA\nLectura 3: 6.4 V -> BAJA\nLectura 4: 6.3 V -> CRÍTICA\nCríticas: 1\nCargar antes de competir\n' },
    { nombre: 'Todo en orden', entrada: ['2', '8', '7.3'], salida: 'Lectura 1: 8.0 V -> OK\nLectura 2: 7.3 V -> OK\nCríticas: 0\nLista para competir\n' },
    { nombre: 'Varias críticas', entrada: ['4', '5.9', '6', '7.1', '6.3'], salida: 'Lectura 1: 5.9 V -> CRÍTICA\nLectura 2: 6.0 V -> CRÍTICA\nLectura 3: 7.1 V -> OK\nLectura 4: 6.3 V -> CRÍTICA\nCríticas: 3\nCargar antes de competir\n' },
    { nombre: 'Sin lecturas', entrada: ['0'], salida: 'Sin lecturas\n' },
  ],
  pistas: [
    'Dentro del for, compara de mayor a menor: if v >= 7.0: … elif v >= 6.4: … else: …',
    'Guarda el estado en una variable y luego imprime: print(f"Lectura {i}: {v:.1f} V -> {estado}").',
    'Crea criticas = 0 antes del for y súmale 1 en la rama de CRÍTICA. Al final, un if decide el consejo. Para «Sin lecturas», comprueba n antes del ciclo.',
  ],
};

const P3 = {
  id: 'python-funciones',
  numero: 3,
  corto: 'Funciones y listas',
  titulo: 'Panel de lecturas',
  objetivo: 'Agrupar código en funciones que reciben datos y devuelven resultados, y trabajar con listas.',
  secciones: [
    { titulo: 'Funciones', html: html(`
      <p><code>def nombre(parametros):</code> define una función. <code>return</code> devuelve el resultado a quien la llamó. Una función que solo imprime no devuelve nada (<code>None</code>).</p>
      <p>Así el criterio de la práctica 2 se escribe una vez y se reutiliza: <code>estado(6.5)</code> → <code>'BAJA'</code>.</p>`) },
    { titulo: 'Listas', html: html(`
      <p>Una lista guarda varios valores en orden: <code>v = [7.4, 6.9]</code>. <code>v.append(x)</code> añade, <code>len(v)</code> cuenta, <code>sum(v)</code>, <code>max(v)</code> y <code>min(v)</code> resumen, <code>sorted(v)</code> devuelve una copia ordenada.</p>
      <p><code>"7.4 6.9".split()</code> separa un texto por espacios: <code>['7.4', '6.9']</code>. Con <code>[float(x) for x in partes]</code> se convierten todos.</p>`) },
    { titulo: 'No modificar lo recibido', html: html(`<p>Si una función debe devolver «los valores que cumplen algo», crea una lista nueva y añade en ella; no borres elementos de la lista que te pasaron.</p>`) },
  ],
  ejemplo: { titulo: 'Función con lista', codigo: `def dobles(numeros):
    resultado = []
    for n in numeros:
        resultado.append(n * 2)
    return resultado

datos = [1, 4, 9]
print(dobles(datos), "a partir de", datos)
print("Suma:", sum(datos), "· Mayor:", max(datos))
`, entrada: '' },
  archivos: [{ nombre: 'programa.py', inicial: `# Práctica 3 · Panel de lecturas
def estado(v):
    """Devuelve 'OK', 'BAJA' o 'CRÍTICA' (criterio de la práctica 2)."""
    return "OK"


def promedio(valores):
    """Media de la lista; 0.0 si está vacía."""
    return 0.0


def bajo_umbral(valores, umbral):
    """Lista NUEVA con los valores menores que umbral, en el mismo orden."""
    return []


linea = input("Tensiones separadas por espacios: ")
valores = [float(x) for x in linea.split()]
print("Lecturas:", valores)
` }],
  principal: 'programa.py',
  entrada: '7.4 6.9 6.1 7.2',
  reto: {
    enunciado: html(`<p>Completa las tres funciones y usa sus resultados. Con la entrada <code>7.4 6.9 6.1 7.2</code>:</p>
      <pre class="muestra">Lecturas: [6.1, 6.9, 7.2, 7.4]
Promedio: 6.90
Máxima: 7.4 | Mínima: 6.1
Por debajo de 7.0: [6.9, 6.1]
Estados: OK, BAJA, CRÍTICA, OK</pre>
      <p>«Lecturas» va ordenada; «Por debajo» y «Estados» siguen el orden de entrada. Con la línea vacía, imprime solo <code>Sin lecturas</code>. Además se llaman tus funciones directamente con otros valores.</p>`),
  },
  casos: [
    { nombre: 'Panel completo', entrada: ['7.4 6.9 6.1 7.2'], salida: 'Lecturas: [6.1, 6.9, 7.2, 7.4]\nPromedio: 6.90\nMáxima: 7.4 | Mínima: 6.1\nPor debajo de 7.0: [6.9, 6.1]\nEstados: OK, BAJA, CRÍTICA, OK\n' },
    { nombre: 'Una sola lectura', entrada: ['7.5'], salida: 'Lecturas: [7.5]\nPromedio: 7.50\nMáxima: 7.5 | Mínima: 7.5\nPor debajo de 7.0: []\nEstados: OK\n' },
    { nombre: 'Línea vacía', entrada: [''], salida: 'Sin lecturas\n' },
    { nombre: 'Funciones con otros valores', entrada: ['7'], llamadas: [
      { expr: 'estado(7.0)', esperado: "'OK'" },
      { expr: 'estado(6.4)', esperado: "'BAJA'" },
      { expr: 'estado(6.39)', esperado: "'CRÍTICA'" },
      { expr: 'promedio([7.0, 8.0])', esperado: '7.5' },
      { expr: 'promedio([])', esperado: '0.0' },
      { expr: 'bajo_umbral([7.4, 6.9, 6.1], 7.0)', esperado: '[6.9, 6.1]' },
      { expr: '(lambda l: (bajo_umbral(l, 7.0), l))([7.5, 6.0, 6.8])', esperado: '([6.0, 6.8], [7.5, 6.0, 6.8])' },
    ] },
  ],
  pistas: [
    'estado(v) es el if / elif / else de la práctica 2, pero con return "OK", return "BAJA" y return "CRÍTICA".',
    'promedio: si not valores, return 0.0; si no, return sum(valores) / len(valores). bajo_umbral: crea resultado = [] y añade con append los v < umbral.',
    'Para los estados en una línea: ", ".join([estado(v) for v in valores]). Para la lista ordenada: sorted(valores).',
  ],
};

const P4 = {
  id: 'python-archivos',
  numero: 4,
  corto: 'Archivos y módulos',
  titulo: 'Informe desde un archivo',
  objetivo: 'Leer y escribir archivos de texto y separar el código en un módulo propio que se importa.',
  secciones: [
    { titulo: 'Archivos virtuales', html: html(`
      <p>En esta práctica, <code>lecturas.txt</code>, <code>bateria.py</code> y lo que tu programa escriba son <strong>archivos virtuales</strong>: viven en la memoria de este navegador mientras se ejecuta el programa. No se lee ni se escribe nada en tu equipo.</p>
      <p><code>with open("lecturas.txt", encoding="utf-8") as f:</code> abre para leer; <code>for linea in f:</code> recorre las líneas. Con <code>open("informe.txt", "w", encoding="utf-8")</code> se crea o reemplaza un archivo y <code>f.write(texto + "\\n")</code> escribe.</p>`) },
    { titulo: 'Módulos', html: html(`
      <p>Un módulo es otro archivo <code>.py</code>. Con <code>import bateria</code> se usan sus funciones como <code>bateria.estado(7.1)</code>. Así el programa principal queda corto y las funciones de la práctica 3 se reutilizan.</p>`) },
    { titulo: 'Errores previstos', html: html(`
      <p><code>try: … except FileNotFoundError:</code> permite responder con un mensaje claro si falta el archivo, y <code>except ValueError:</code> si una línea no contiene un número.</p>`) },
  ],
  ejemplo: { titulo: 'Escribir y leer', codigo: `with open("saludo.txt", "w", encoding="utf-8") as f:
    f.write("hola\\n")
    f.write("robot\\n")

with open("saludo.txt", encoding="utf-8") as f:
    for numero, linea in enumerate(f, start=1):
        print(numero, linea.strip().upper())
`, entrada: '' },
  archivos: [
    { nombre: 'principal.py', inicial: `# Práctica 4 · Informe desde un archivo
import bateria

with open("lecturas.txt", encoding="utf-8") as f:
    for linea in f:
        print(linea.strip())

# Reto: ignora líneas vacías y comentarios, usa bateria.estado y bateria.promedio,
# escribe informe.txt y muestra el resumen.
` },
    { nombre: 'bateria.py', inicial: `"""Funciones de la batería (de la práctica 3)."""


def estado(v):
    return "OK"


def promedio(valores):
    return 0.0
` },
    { nombre: 'lecturas.txt', inicial: `# nombre;voltaje
motor_izq;7.3
motor_der;6.6

servo;6.2
` },
  ],
  principal: 'principal.py',
  entrada: '',
  reto: {
    enunciado: html(`<p><code>lecturas.txt</code> tiene una lectura por línea con el formato <code>nombre;voltaje</code>. Ignora las líneas vacías y las que empiezan por <code>#</code>. Si el voltaje no es un número, imprime <code>Línea ignorada: …</code> con la línea y sigue.</p>
      <p>Escribe <code>informe.txt</code> con una línea <code>nombre;voltaje;estado</code> por lectura válida (voltaje con un decimal) y muestra:</p>
      <pre class="muestra">Lecturas válidas: 3
Promedio: 6.70
Informe guardado en informe.txt</pre>
      <p>Usa <code>estado</code> y <code>promedio</code> desde <code>bateria.py</code>. Si no hay lecturas válidas, imprime <code>Lecturas válidas: 0</code> y <code>Promedio: 0.00</code>. Si falta <code>lecturas.txt</code>, imprime solo <code>No encuentro lecturas.txt</code>.</p>`),
  },
  casos: [
    { nombre: 'Archivo de ejemplo', entrada: [], salida: 'Lecturas válidas: 3\nPromedio: 6.70\nInforme guardado en informe.txt\n',
      archivosEsperados: { 'informe.txt': 'motor_izq;7.3;OK\nmotor_der;6.6;BAJA\nservo;6.2;CRÍTICA\n' } },
    { nombre: 'Otro archivo con una línea no válida', entrada: [], archivos: { 'lecturas.txt': '# prueba\nbrazo;7\n\nsensor;abc\nrueda;6.44\n' },
      salida: 'Línea ignorada: sensor;abc\nLecturas válidas: 2\nPromedio: 6.72\nInforme guardado en informe.txt\n',
      archivosEsperados: { 'informe.txt': 'brazo;7.0;OK\nrueda;6.4;BAJA\n' } },
    { nombre: 'Solo comentarios', entrada: [], archivos: { 'lecturas.txt': '# vacío\n\n' },
      salida: 'Lecturas válidas: 0\nPromedio: 0.00\nInforme guardado en informe.txt\n', archivosEsperados: { 'informe.txt': '' } },
    { nombre: 'Falta lecturas.txt', entrada: [], archivos: { 'lecturas.txt': null }, salida: 'No encuentro lecturas.txt\n' },
    { nombre: 'Funciones del módulo', entrada: [], llamadas: [
      { expr: "__import__('bateria').estado(6.5)", esperado: "'BAJA'" },
      { expr: "__import__('bateria').estado(7.0)", esperado: "'OK'" },
      { expr: "__import__('bateria').estado(6.0)", esperado: "'CRÍTICA'" },
      { expr: "__import__('bateria').promedio([6.0, 7.0])", esperado: '6.5' },
      { expr: "__import__('bateria').promedio([])", esperado: '0.0' },
    ] },
    { nombre: 'principal.py importa bateria', requiere: { archivo: 'principal.py', patron: '^\\s*(import\\s+bateria|from\\s+bateria\\s+import)', mensaje: 'principal.py debe importar el módulo bateria (import bateria).' } },
  ],
  pistas: [
    'Copia en bateria.py tus funciones estado y promedio de la práctica 3.',
    'En el for: linea = linea.strip(); if not linea or linea.startswith("#"): continue. Después nombre, texto = linea.split(";") y v = float(texto) dentro de un try.',
    'Guarda las líneas del informe en una lista y escríbelas al final con un with open("informe.txt", "w", encoding="utf-8"). Envuelve la lectura en try / except FileNotFoundError.',
  ],
};

const P5 = {
  id: 'python-asistente',
  numero: 5,
  corto: 'Asistente de consola',
  titulo: 'Asistente de la batería',
  objetivo: 'Combinar todo en un programa interactivo: un ciclo que lee órdenes, las interpreta y responde.',
  secciones: [
    { titulo: 'Ciclo de órdenes', html: html(`
      <p>Un asistente de consola repite: leer una orden, decidir qué hacer y responder, hasta que el usuario escribe <code>salir</code>. Un <code>while True:</code> con <code>break</code> en <code>salir</code> es la forma habitual.</p>
      <p>En el laboratorio, cada línea de <strong>Entrada</strong> es una orden. Si se acaban las líneas antes de <code>salir</code>, Python lanza <code>EOFError</code>.</p>`) },
    { titulo: 'Interpretar texto', html: html(`
      <p><code>orden.strip().lower()</code> limpia espacios y mayúsculas. <code>partes = orden.split(maxsplit=1)</code> separa la palabra de su dato: <code>"agregar 7.2"</code> → <code>['agregar', '7.2']</code>.</p>`) },
    { titulo: 'Programa robusto', html: html(`<p>Una orden desconocida o un número mal escrito no deben cerrar el programa: responde con un mensaje y sigue. Reutiliza <code>estado</code> y <code>promedio</code>.</p>`) },
  ],
  ejemplo: { titulo: 'Eco con órdenes', codigo: `print("Escribe palabras; 'fin' para terminar.")
while True:
    texto = input("> ").strip()
    if texto == "fin":
        print("Adiós")
        break
    print("Has escrito", len(texto), "letras:", texto.upper())
`, entrada: 'robot\npython\nfin' },
  archivos: [{ nombre: 'asistente.py', inicial: `# Práctica 5 · Asistente de la batería
lecturas = []

print("Asistente de batería. Escribe ayuda.")
while True:
    orden = input("> ").strip().lower()
    if orden == "salir":
        print("Hasta pronto")
        break
    elif orden == "ayuda":
        print("Comandos: agregar <voltaje>, lista, promedio, alerta, guardar, salir")
    else:
        print("No entiendo:", orden, "(escribe ayuda)")
` }],
  principal: 'asistente.py',
  entrada: 'ayuda\nagregar 7.2\nagregar 6.1\nlista\npromedio\nalerta\nguardar\nsalir',
  reto: {
    enunciado: html(`<p>Al empezar imprime <code>Asistente de batería. Escribe ayuda.</code> y después atiende órdenes (sin distinguir mayúsculas) hasta <code>salir</code>:</p>
      <ul>
        <li><code>agregar 7.2</code> → <code>Agregada: 7.2 V (OK)</code>; si no es un número → <code>Valor no válido: …</code> (con el texto recibido).</li>
        <li><code>lista</code> → <code>Lecturas: 7.2, 6.1</code> (un decimal) · <code>promedio</code> → <code>Promedio: 6.65</code> · <code>alerta</code> → <code>Críticas: 1</code>. Sin lecturas, las tres responden <code>Sin lecturas</code>.</li>
        <li><code>guardar</code> → escribe <code>bitacora.txt</code> (una tensión por línea, un decimal) y responde <code>Guardado: 2 lecturas en bitacora.txt</code>.</li>
        <li><code>ayuda</code> → la lista de comandos del código inicial · <code>salir</code> → <code>Hasta pronto</code> · otra cosa → <code>No entiendo: … (escribe ayuda)</code>.</li>
      </ul>`),
  },
  casos: [
    { nombre: 'Sesión completa', entrada: ['ayuda', 'agregar 7.2', 'agregar 6.1', 'lista', 'promedio', 'alerta', 'guardar', 'salir'],
      salida: 'Asistente de batería. Escribe ayuda.\nComandos: agregar <voltaje>, lista, promedio, alerta, guardar, salir\nAgregada: 7.2 V (OK)\nAgregada: 6.1 V (CRÍTICA)\nLecturas: 7.2, 6.1\nPromedio: 6.65\nCríticas: 1\nGuardado: 2 lecturas en bitacora.txt\nHasta pronto\n',
      archivosEsperados: { 'bitacora.txt': '7.2\n6.1\n' } },
    { nombre: 'Sin lecturas', entrada: ['lista', 'promedio', 'alerta', 'salir'], salida: 'Asistente de batería. Escribe ayuda.\nSin lecturas\nSin lecturas\nSin lecturas\nHasta pronto\n' },
    { nombre: 'Órdenes mal escritas', entrada: ['  AGREGAR 6.5 ', 'agregar abc', 'agregar', 'bailar', 'Lista', 'SALIR'],
      salida: 'Asistente de batería. Escribe ayuda.\nAgregada: 6.5 V (BAJA)\nValor no válido: abc\nValor no válido: \nNo entiendo: bailar (escribe ayuda)\nLecturas: 6.5\nHasta pronto\n' },
    { nombre: 'Guardar sin datos y seguir', entrada: ['guardar', 'agregar 8', 'alerta', 'guardar', 'salir'],
      salida: 'Asistente de batería. Escribe ayuda.\nGuardado: 0 lecturas en bitacora.txt\nAgregada: 8.0 V (OK)\nCríticas: 0\nGuardado: 1 lecturas en bitacora.txt\nHasta pronto\n',
      archivosEsperados: { 'bitacora.txt': '8.0\n' } },
  ],
  pistas: [
    'Separa la orden: partes = orden.split(maxsplit=1); comando = partes[0] if partes else "". El dato, si existe, es partes[1].',
    'Para agregar: dentro de try convierte con float(dato); en except ValueError responde print(f"Valor no válido: {dato}") y el ciclo sigue.',
    'Define arriba estado(v) y promedio(valores) (prácticas 3 y 4). Para guardar: with open("bitacora.txt", "w", encoding="utf-8") as f y un for que escriba f"{v:.1f}\\n".',
  ],
};

export const PRACTICAS = [P1, P2, P3, P4, P5];
export const ID_PRACTICA = /^python-[a-z]{3,30}$/;
export const buscarPractica = (id) => PRACTICAS.find((p) => p.id === id) || null;

/** Práctica pedida en la URL (?practica=<id>). Sin parámetro, la primera; un id desconocido devuelve null. */
export function resolverPractica(search) {
  const pedida = new URLSearchParams(search).get('practica');
  if (pedida === null || pedida === '') return { practica: PRACTICAS[0], pedida: null };
  return { practica: buscarPractica(pedida), pedida };
}

/** Normaliza una salida para compararla: sin espacios al final de línea ni líneas vacías al final, saltos \n. */
export function normalizar(texto) {
  return String(texto ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
}

/** Primera diferencia entre salida esperada y obtenida (para explicar el fallo). */
export function diferencia(esperada, obtenida) {
  const a = normalizar(esperada).split('\n');
  const b = normalizar(obtenida).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { linea: i + 1, esperada: a[i] ?? null, obtenida: b[i] ?? null };
  }
  return null;
}

/**
 * Evalúa un caso con el resultado del arnés. Devuelve { ok, detalle }.
 * archivosPractica: archivos actuales del estudiante (para «requiere»).
 */
export function evaluarCaso(caso, resultado, archivosPractica) {
  if (caso.requiere) {
    const ok = new RegExp(caso.requiere.patron, 'm').test(archivosPractica[caso.requiere.archivo] || '');
    return { ok, detalle: ok ? 'Correcto.' : caso.requiere.mensaje };
  }
  if (resultado.estado === 'tiempo') return { ok: false, detalle: 'El programa no terminó a tiempo: revisa que tus ciclos acaben (¿un while que nunca deja de cumplirse?).' };
  if (resultado.estado === 'salida-excedida') return { ok: false, detalle: 'El programa imprimió demasiado texto (¿un print dentro de un ciclo que no termina?).' };
  if (resultado.estado === 'error') {
    const e = resultado.error;
    const donde = e.linea ? ` en ${e.archivo || 'tu programa'}, línea ${e.linea}` : '';
    if (e.tipo === 'EOFError') return { ok: false, detalle: `El programa pidió más datos con input() de los que tiene este caso${donde}.` };
    return { ok: false, detalle: `Se detuvo con ${e.tipo}${donde}: ${e.mensaje}` };
  }
  if (caso.salida !== undefined) {
    const d = diferencia(caso.salida, resultado.salida);
    if (d) {
      const mostrar = (t) => (t === null ? '(nada)' : `«${t}»`);
      return { ok: false, detalle: `Línea ${d.linea} de la salida: se esperaba ${mostrar(d.esperada)} y se obtuvo ${mostrar(d.obtenida)}.` };
    }
  }
  for (const [nombre, esperado] of Object.entries(caso.archivosEsperados || {})) {
    const obtenido = resultado.archivos?.[nombre];
    if (obtenido === undefined) return { ok: false, detalle: `No se creó el archivo ${nombre}.` };
    const d = diferencia(esperado, obtenido ?? '');
    if (d) return { ok: false, detalle: `${nombre}, línea ${d.linea}: se esperaba «${d.esperada ?? '(nada)'}» y hay «${d.obtenida ?? '(nada)'}».` };
  }
  for (const [i, llamada] of (caso.llamadas || []).entries()) {
    const r = resultado.llamadas?.[i];
    if (!r) return { ok: false, detalle: `No se pudo comprobar ${llamada.expr}.` };
    if (!r.ok) return { ok: false, detalle: `${llamada.expr} produjo ${r.error.tipo}: ${r.error.mensaje}` };
    if (r.repr !== llamada.esperado) return { ok: false, detalle: `${llamada.expr} devolvió ${r.repr} y se esperaba ${llamada.esperado}.` };
  }
  return { ok: true, detalle: 'Correcto.' };
}
