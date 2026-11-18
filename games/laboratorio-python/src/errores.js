// Pistas en español para los errores de Python. El mensaje original de Python se muestra siempre;
// la pista orienta sin dar la solución.
const REGLAS = [
  ['SyntaxError', /expected ':'/, 'Falta el signo «:» al final de la línea (después de if, elif, else, for, while o def).'],
  ['SyntaxError', /unterminated string|EOL while scanning/, 'Hay un texto sin cerrar: revisa que cada comilla de apertura tenga su comilla de cierre.'],
  ['SyntaxError', /was never closed|unexpected EOF|'\(' was never closed/, 'Hay un paréntesis, corchete o llave sin cerrar en esa línea o antes.'],
  ['SyntaxError', /unmatched/, 'Sobra un paréntesis, corchete o llave de cierre.'],
  ['SyntaxError', /invalid syntax\. Maybe you meant '==' or ':=' instead of '='\?|cannot assign to/, 'Para comparar se usan dos signos: «==». Un solo «=» guarda un valor en una variable.'],
  ['SyntaxError', /invalid character/, 'Hay un carácter que Python no acepta (comillas tipográficas “ ” o un símbolo pegado). Escríbelo con el teclado.'],
  ['SyntaxError', /Missing parentheses in call to 'print'/, 'En Python 3, print es una función: print("texto").'],
  ['SyntaxError', null, 'Python no entiende cómo está escrita esa línea. Compárala con los ejemplos: dos puntos, comillas, paréntesis y operadores.'],
  ['IndentationError', /expected an indented block/, 'Después de una línea que termina en «:» el bloque debe ir con sangría (4 espacios).'],
  ['IndentationError', /unexpected indent/, 'Esa línea tiene sangría sin motivo: debe empezar en la misma columna que la anterior.'],
  ['IndentationError', null, 'La sangría no cuadra: las líneas de un mismo bloque deben empezar en la misma columna.'],
  ['TabError', null, 'Mezclas tabulaciones y espacios en la sangría: usa solo espacios.'],
  ['NameError', /Did you mean/, 'Ese nombre no existe; Python sugiere uno parecido. Revisa mayúsculas, tildes y letras.'],
  ['NameError', null, 'Usas un nombre que no existe todavía: ¿está mal escrito, o se define más abajo o dentro de otra función?'],
  ['UnboundLocalError', null, 'Dentro de la función usas una variable antes de darle valor. Pásala como parámetro o asígnala antes.'],
  ['TypeError', /can only concatenate str|unsupported operand type\(s\) for [+-] ?: '(int|float)' and 'str'|'str' and '(int|float)'/, 'Mezclas texto y números. input() devuelve texto: conviértelo con int() o float(), o convierte el número con str().'],
  ['TypeError', /not supported between instances of 'str' and/, 'Comparas texto con un número: convierte con int() o float() lo que viene de input().'],
  ['TypeError', /missing \d+ required positional argument/, 'Llamas a la función con menos datos de los que pide su definición.'],
  ['TypeError', /takes \d+ positional arguments? but \d+ (were|was) given/, 'Llamas a la función con más datos de los que pide su definición.'],
  ['TypeError', /object is not callable/, 'Pones paréntesis después de algo que no es una función (¿una variable con el mismo nombre que una función?).'],
  ['TypeError', /NoneType/, 'Algo vale None: suele pasar cuando una función imprime en lugar de devolver con return.'],
  ['TypeError', null, 'Una operación recibió un tipo de dato que no esperaba. Revisa los tipos con type(valor).'],
  ['ValueError', /invalid literal for int\(\)|could not convert string to float/, 'El texto no es un número válido para convertir. Revisa la Entrada (¿una línea vacía, una coma en lugar de punto?).'],
  ['ValueError', /not enough values to unpack|too many values to unpack/, 'El número de variables a la izquierda no coincide con los valores (revisa el separador de split).'],
  ['ValueError', null, 'El valor tiene el tipo correcto pero no es aceptable para esa operación.'],
  ['ZeroDivisionError', null, 'Divides entre cero. Comprueba el divisor antes de dividir (por ejemplo, una lista vacía en un promedio).'],
  ['IndexError', null, 'Pides una posición que no existe en la lista o el texto. Las posiciones van de 0 a len(...) - 1.'],
  ['KeyError', null, 'Esa clave no está en el diccionario. Comprueba con «in» antes de leerla o usa .get().'],
  ['AttributeError', null, 'Ese tipo de dato no tiene ese método o atributo. ¿Está bien escrito? ¿Es del tipo que crees?'],
  ['FileNotFoundError', null, 'El archivo no existe en la carpeta virtual de la práctica. Revisa el nombre (y la extensión) o contrólalo con try / except FileNotFoundError.'],
  ['ModuleNotFoundError', null, 'No existe ese módulo. Para tus módulos, el archivo debe llamarse igual que en el import y terminar en .py.'],
  ['ImportError', /no está disponible en el laboratorio/, 'Ese módulo no se puede usar en el laboratorio.'],
  ['ImportError', null, 'El módulo existe pero no tiene ese nombre: revisa lo que importas con from … import ….'],
  ['EOFError', null, 'El programa pidió más datos con input() que líneas hay en «Entrada». Añade una línea por cada input().'],
  ['RecursionError', null, 'Una función se llama a sí misma sin parar. Revisa la condición que debería terminar la recursión.'],
  ['OverflowError', null, 'El número es demasiado grande para esa operación.'],
  ['MemoryError', null, 'El programa usa demasiada memoria (¿una lista que crece sin fin?).'],
];

/** Pista para un error {tipo, mensaje}. */
export function pistaError(error) {
  if (!error) return '';
  for (const [tipo, patron, texto] of REGLAS) {
    if (error.tipo === tipo && (!patron || patron.test(error.mensaje || ''))) return texto;
  }
  return 'Lee el tipo de error y la línea indicada; compara esa línea con los ejemplos de la práctica.';
}
