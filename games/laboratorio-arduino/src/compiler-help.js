// Explicaciones en español para mensajes frecuentes de avr-gcc. El mensaje original siempre se muestra.
const RULES = [
  [/expected ['‘’]?;['‘’]? before/, 'Falta un punto y coma (;). El compilador lo nota en la línea indicada, pero casi siempre falta al final de la instrucción anterior.'],
  [/['‘’]([\w:]+)['‘’] was not declared in this scope/, (m) => `«${m[1]}» no existe para el compilador. Revisa la ortografía y las mayúsculas (C++ distingue «Serial» de «serial»), o declara la variable antes de usarla.`],
  [/suggested alternative: ['‘’]([\w:]+)['‘’]/, (m) => `El compilador sugiere que quizá quisiste escribir «${m[1]}».`],
  [/expected ['‘’]\}['‘’] at end of input/, 'Hay una llave «{» que nunca se cierra. Cuenta las llaves: cada «{» necesita su «}».'],
  [/expected declaration before ['‘’]\}['‘’]/, 'Sobra una llave «}». Revisa que cada bloque se cierre una sola vez.'],
  [/expected ['‘’]\)['‘’]/, 'Falta cerrar un paréntesis «)». Comprueba que cada «(» tenga su pareja.'],
  [/expected primary-expression before/, 'Hay algo incompleto en la expresión: puede faltar un valor, sobrar una coma o un signo.'],
  [/missing terminating " character|missing terminating ' character/, 'Un texto entre comillas no se cerró. Los textos van entre comillas dobles: "Hola".'],
  [/stray ['‘’]\\\d+['‘’] in program|stray ['‘’].['‘’] in program/, 'Hay un carácter extraño, a menudo comillas tipográficas “ ” copiadas de un documento. Escríbelas de nuevo desde el teclado.'],
  [/['‘’](?:class )?(\w+)['‘’] has no member named ['‘’](\w+)['‘’]/, (m) => `«${m[2]}» no existe dentro de «${m[1] === 'HardwareSerial' ? 'Serial' : m[1]}». Revisa la ortografía y las mayúsculas: por ejemplo Serial.println (con «ln» al final) o Serial.begin.`],
  [/a function-definition is not allowed here/, 'Una función empieza dentro de otra. Casi siempre falta cerrar con «}» la función anterior (por ejemplo setup()).'],
  [/expected initializer before/, 'Algo está incompleto justo antes de este punto: revisa que la línea anterior termine en «;» y que el tipo esté bien escrito.'],
  [/expected unqualified-id before/, 'Hay un símbolo o una palabra donde el compilador esperaba un nombre. Revisa llaves sobrantes o instrucciones escritas fuera de setup() y loop().'],
  [/conflicting declaration/, 'Se declaró dos veces el mismo nombre. Deja una sola declaración.'],
  [/does not name a type/, 'Hay una instrucción fuera de una función o un tipo mal escrito. Las órdenes como digitalWrite van dentro de setup() o loop().'],
  [/too few arguments to function/, 'Faltan datos al llamar a la función. Por ejemplo, digitalWrite necesita el pin y el estado: digitalWrite(13, HIGH).'],
  [/too many arguments to function/, 'Sobran datos al llamar a la función. Revisa cuántos valores recibe.'],
  [/['‘’]else['‘’] without a previous ['‘’]if['‘’]/, 'Hay un «else» sin su «if». Revisa llaves y que no haya un «;» justo después de la condición del if.'],
  [/redefinition of/, 'Algo se definió dos veces con el mismo nombre (por ejemplo dos funciones loop). Deja solo una.'],
  [/undefined reference to [`'‘]setup/, 'Falta la función setup(). Todo programa Arduino necesita void setup() { ... }.'],
  [/undefined reference to [`'‘]loop/, 'Falta la función loop(). Todo programa Arduino necesita void loop() { ... }.'],
  [/undefined reference to/, 'Se usa una función que se declaró pero nunca se escribió su contenido.'],
  [/invalid conversion from/, 'Se mezcla un tipo de dato con otro incompatible (por ejemplo un texto donde se espera un número).'],
  [/lvalue required|assignment of read-only/, 'Se intenta cambiar algo que no puede cambiarse, como una constante o el resultado de una operación.'],
  [/suggest parentheses around assignment/, 'Advertencia: en una condición usaste «=» (asignar). Para comparar se usa «==».'],
  [/unused variable/, 'Advertencia: declaraste una variable que no se usa. No impide compilar.'],
  [/no cabe en la memoria/, 'El programa ocupa más memoria de la que tiene el ATmega328P.'],
  [/superó \d+ segundos/, 'La compilación tardó demasiado. Simplifica el programa e inténtalo de nuevo.'],
];

/** Explicación sencilla del diagnóstico, o null si no se reconoce. */
export function explainDiagnostic(message) {
  for (const [pattern, text] of RULES) {
    const m = String(message).match(pattern);
    if (m) return typeof text === 'function' ? text(m) : text;
  }
  return null;
}

export const GENERIC_HELP = 'No tengo una explicación preparada para este mensaje. Lee el texto original: indica la línea, la columna y qué esperaba encontrar el compilador. Revisa también la línea anterior.';
