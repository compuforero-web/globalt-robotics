// Lección piloto «Electrónica y C++ con Arduino»: LED intermitente y monitor serie. Contenido original de GLOBALT.
// La lección se recorre en pasos breves. Leer un paso o pulsar «Siguiente» nunca aprueba el reto:
// solo lo aprueba la evaluación medida en la simulación (challenge.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './lessons/view.js';
export const LESSON = {
  id: 'arduino-led-serie',
  course: 'Electrónica y C++ con Arduino',
  title: 'Tu primer LED intermitente y mensajes al monitor serie',
  ledPin: 13,
  baud: 9600,
};

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 1: LED intermitente y monitor serie
// El LED externo está en el pin digital 13 (D13) con una resistencia de 220 Ω.

const int PIN_LED = 13;        // pin donde conectamos el LED

void setup() {
  pinMode(PIN_LED, OUTPUT);    // D13 entregará voltaje: lo configuramos como salida
  Serial.begin(9600);          // abre el monitor serie a 9600 baudios
  Serial.println("Hola, soy tu Arduino Nano");
}

void loop() {
  digitalWrite(PIN_LED, HIGH); // 5 V en D13: el LED se enciende
  Serial.println("LED encendido");
  delay(1000);                 // espera 1000 ms (1 segundo)

  digitalWrite(PIN_LED, LOW);  // 0 V en D13: el LED se apaga
  Serial.println("LED apagado");
  delay(1000);
}
`;

export const CHALLENGE = {
  title: 'Reto: el latido',
  summary: 'Convierte el parpadeo en un «latido»: el LED de D13 debe encenderse 200 ms y apagarse 800 ms, una y otra vez. En cada latido, el monitor serie debe mostrar una línea «Latido 1», «Latido 2», «Latido 3»… contando desde 1.',
  criteria: [
    'El LED de D13 parpadea al menos 4 veces en 5 segundos.',
    'Cada encendido dura 200 ms (±10 %).',
    'Cada apagado dura 800 ms (±10 %).',
    'El monitor serie funciona a 9600 baudios.',
    'Cada latido escribe su línea «Latido N» al encenderse el LED (de 100 ms antes a 250 ms después), numerada 1, 2, 3…',
  ],
};

/**
 * Ejemplos pequeños para practicar. Ninguno es la solución del reto: sirven para observar una idea.
 * Se pueden copiar o probar en el editor; probarlos exige una elección explícita y nunca guarda solo.
 */
export const EXAMPLES = {
  'una-vez': {
    title: 'setup() una vez, loop() siempre',
    code: `// Ejemplo: observa cuántas veces aparece cada mensaje.
void setup() {
  Serial.begin(9600);
  Serial.println("Esto se escribe una sola vez");
}

void loop() {
  Serial.println("Esto se repite");
  delay(500);
}
`,
  },
  'parpadeo-rapido': {
    title: 'Parpadeo rápido y parejo',
    code: `// Ejemplo: el LED pasa el mismo tiempo encendido que apagado.
const int PIN_LED = 13;

void setup() {
  pinMode(PIN_LED, OUTPUT);
}

void loop() {
  digitalWrite(PIN_LED, HIGH);
  delay(100);   // tiempo encendido
  digitalWrite(PIN_LED, LOW);
  delay(100);   // tiempo apagado
}
`,
  },
};

const example = (id) => exampleHtml(EXAMPLES, id);

/** Pasos de la lección. `short` aparece en la barra de pasos. */
export const STEPS = [
  {
    id: 'circuito',
    short: 'Circuito',
    title: 'Entender el circuito',
    html: `
      <p>Un <strong>pin digital</strong> es un interruptor que controla tu programa. Si lo configuras como salida, puede entregar 5&nbsp;V (<code>HIGH</code>) o 0&nbsp;V (<code>LOW</code>).</p>
      <p>El LED solo deja pasar corriente en un sentido: la pata larga (ánodo, +) mira hacia el pin y la corta (cátodo, −) hacia GND. La <strong>resistencia</strong> de 220&nbsp;Ω limita la corriente a unos (5&nbsp;V − 2&nbsp;V) ÷ 220&nbsp;Ω ≈ 14&nbsp;mA: se ve bien y no daña el pin.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Desde</th><th scope="col">Hacia</th><th scope="col">Para qué</th></tr></thead>
        <tbody>
          <tr><td>D13 del Nano</td><td>Resistencia 220&nbsp;Ω</td><td>Limita la corriente</td></tr>
          <tr><td>Resistencia</td><td>Ánodo del LED (pata larga)</td><td>Entrada de corriente al LED</td></tr>
          <tr><td>Cátodo del LED (pata corta)</td><td>GND del Nano</td><td>Cierra el circuito</td></tr>
        </tbody>
      </table>
      <p class="muted small">El Nano también tiene un LED pequeño marcado «L» conectado a D13; en la simulación verás ambos.</p>
      ${question('Si conectas el LED al revés, ¿qué ocurre?', 'No se enciende: el LED bloquea la corriente en ese sentido. Con esta resistencia no se daña; basta con darle la vuelta.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'setup-loop',
    short: 'setup() y loop()',
    title: 'Conocer setup() y loop()',
    html: `
      <p>Todo programa de Arduino tiene dos partes obligatorias:</p>
      <ul>
        <li><code>setup()</code> se ejecuta <strong>una vez</strong> al encender o reiniciar la placa. Ahí se preparan los pines y el monitor serie.</li>
        <li><code>loop()</code> se repite <strong>sin fin</strong>: cuando llega a su última línea, vuelve a empezar.</li>
      </ul>
      <p>Dentro de ellas, cada instrucción termina en <code>;</code> y cada bloque va entre llaves <code>{ }</code>. <code>Serial.begin(9600)</code> abre el monitor serie y <code>Serial.println("…")</code> escribe una línea.</p>
      ${example('una-vez')}
      ${question('Dentro de loop() escribes <code>int n = 0; n++; Serial.println(n);</code>. ¿Qué número aparece en cada vuelta?', 'Siempre 1. La variable se crea de nuevo en cada vuelta de loop() y vuelve a empezar en 0. Una variable declarada fuera de las funciones conserva su valor entre vueltas.')}`,
  },
  {
    id: 'modificar',
    short: 'Modificar',
    title: 'Modificar el código',
    html: `
      <p>El editor empieza con un ejemplo que enciende el LED 1 segundo y lo apaga 1 segundo. El ritmo lo deciden los <code>delay(ms)</code>: el programa se detiene esos milisegundos antes de seguir.</p>
      <ol>
        <li>Busca en el editor los dos <code>delay(1000)</code> dentro de <code>loop()</code>.</li>
        <li>Cambia sus valores y observa qué cambia al ejecutar.</li>
        <li>Pulsa <strong>Guardar</strong> (o Ctrl+S) cuando quieras conservar tu versión.</li>
      </ol>
      ${example('parpadeo-rapido')}
      <p class="muted small">«Probar en el editor» te pregunta antes de cambiar nada y te permite recuperar tu código.</p>
      ${question('Si el LED está encendido 300 ms y apagado 700 ms, ¿cuántas veces se enciende en 5 segundos?', 'Cinco veces: cada ciclo dura 300 + 700 = 1000 ms, así que hay un encendido por segundo.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'compilar',
    short: 'Compilar',
    title: 'Compilar',
    html: `
      <p><strong>Compilar</strong> traduce tu C++ al lenguaje de máquina del ATmega328P. Si el compilador no entiende algo, no se genera el programa y aparece la lista de mensajes bajo el editor.</p>
      <p>Cada mensaje muestra la línea (puedes pulsarla para ir a ella), el <strong>texto original</strong> del compilador y, cuando se reconoce, una explicación sencilla. Corrige primero el primer error: a veces los demás desaparecen solos.</p>
      <ul class="mini-errors">
        <li><code>expected ';' before …</code> → falta un punto y coma, casi siempre al final de la línea anterior.</li>
        <li><code>'serial' was not declared</code> → nombre mal escrito; C++ distingue mayúsculas: <code>Serial</code>.</li>
        <li><code>expected '}' at end of input</code> → una llave <code>{</code> quedó sin cerrar.</li>
      </ul>
      ${question('El compilador señala la línea 8 por un «;» que falta, pero la línea 8 parece correcta. ¿Dónde miras?', 'En la línea anterior, la 7: el compilador nota la falta cuando ya empezó a leer la siguiente instrucción.')}
      ${goTo('#btn-compile', 'Ir a Compilar')}`,
  },
  {
    id: 'simulacion',
    short: 'Simulación',
    title: 'Observar la simulación',
    html: `
      <p><strong>Ejecutar</strong> compila (si hace falta) y corre tu programa en un ATmega328P emulado dentro del navegador. Observa:</p>
      <ul>
        <li>El LED del circuito y el LED «L» de la placa.</li>
        <li>Los indicadores de pines: D13 se ilumina cuando está en <code>HIGH</code>.</li>
        <li>El <strong>monitor serie</strong>, con el texto que envía <code>Serial</code>, y el tiempo simulado <em>t</em>.</li>
      </ul>
      <p><strong>Detener</strong> congela la simulación; <strong>Reiniciar</strong> la arranca desde cero con el mismo programa, como el botón RESET de la placa.</p>
      ${question('Tras pulsar Reiniciar, ¿por qué vuelve a aparecer «Hola, soy tu Arduino Nano»?', 'Porque reiniciar arranca el programa desde el principio y setup() se ejecuta otra vez.')}
      ${goTo('#sim-panel', 'Ir a la simulación')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>Aquí no hay solución escrita: los pasos anteriores te dan las piezas. Un camino posible:</p>
      <ol>
        <li>Ajusta los tiempos de encendido y apagado y comprueba el ritmo.</li>
        <li>Haz que cada latido escriba su línea, con un número que avance.</li>
        <li>Pulsa <strong>Comprobar reto</strong> y revisa los puntos marcados.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta 5 segundos simulados y mide el LED y el monitor serie. Leer los pasos no cuenta como reto superado. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'programar un Arduino Nano para que encienda y apague un LED con un ritmo exacto y te cuente por el monitor serie qué está haciendo.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'Funciona: pines digitales (pinMode, digitalWrite, digitalRead de salidas), temporizadores (delay, millis, micros) y Serial (print, println, write).',
  'Todavía no: entradas externas (botones, sensores), analogRead, servos, librerías adicionales ni lectura desde el monitor serie.',
  'El circuito de esta lección es fijo: LED con resistencia en D13. Los demás pines se muestran como indicadores.',
];

export function lessonHtml() {
  return renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE });
}
