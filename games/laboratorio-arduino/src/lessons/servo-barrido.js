// Lección 13 · Tema 3: barrido sin bloquear (3.2 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el modelo del SG90 (servo.js) mide cada pulso real de D9 que genera la librería Servo y
// el evaluador (servo-eval.js) mide la velocidad y los cambios de sentido del barrido y, a la vez, los flancos de D13.
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateBarrido, BARRIDO, SERVO_PIN, LED_PIN } from './servo-eval.js';
import { SERVO } from '../servo.js';
import { createServoCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip, body } from '../guide.js';

export const ID = 'arduino-servo-barrido';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 13: barrido sin bloquear
// Servo en D9 (fuente externa de 5 V y GND común) y LED en D13.
// Práctica: este barrido usa delay(). Ejecuta y mira el LED:
// ¿parpadea cada 500 ms mientras el servo se mueve?
#include <Servo.h>

Servo servo;
const int LED = 13;

void setup() {
  pinMode(LED, OUTPUT);
  servo.attach(9);
}

void loop() {
  for (int angulo = 0; angulo <= 180; angulo++) {
    servo.write(angulo);
    delay(15);
  }
  digitalWrite(LED, HIGH);
  delay(500);
  for (int angulo = 180; angulo >= 0; angulo--) {
    servo.write(angulo);
    delay(15);
  }
  digitalWrite(LED, LOW);
  delay(500);
}
`;

export const EXAMPLES = {
  reloj: {
    title: 'Un reloj con millis()',
    code: `// Ejemplo: millis() cuenta los milisegundos desde el arranque.
// La tarea se ejecuta cuando ha pasado su intervalo, sin esperar.
unsigned long antes = 0;
int cuenta = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  if (millis() - antes >= 300) {
    antes = antes + 300;
    cuenta++;
    Serial.println(cuenta);
  }
  // Aquí el loop sigue libre para otras tareas.
}
`,
  },
  rebote: {
    title: 'Un valor que va y vuelve',
    code: `// Ejemplo: una variable sube hasta 5 y baja hasta 0, sin parar.
// «paso» guarda el sentido y cambia de signo en los extremos.
int valor = 0;
int paso = 1;

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 12; i++) {
    Serial.println(valor);
    valor = valor + paso;
    if (valor == 5 || valor == 0) paso = -paso;
  }
}

void loop() { }
`,
  },
};

export const CHALLENGE = {
  title: 'Reto: barrido y parpadeo a la vez',
  summary: 'El servo de D9 barre de 0° a 180° y de vuelta, avanzando 1° cada 15 ms, mientras el LED de D13 parpadea 500 ms encendido y 500 ms apagado. Ninguna tarea espera a la otra.',
  criteria: [
    'D9 recibe pulsos de servo a unos 50 Hz con la librería Servo.',
    'El barrido llega a 0° y a 180° (±5°) y cambia de sentido solo en los extremos, al menos dos veces.',
    'Movimiento gradual: la orden no cambia más de 3° entre dos pulsos (20 ms).',
    'Velocidad de cada tramo entre 55 y 80 °/s (1° cada 15 ms ≈ 67 °/s).',
    'Durante el barrido, D13 parpadea 500/500 ms: periodo de 1000 ms ±5 %, al menos 5 parpadeos.',
    'El servo modelado sigue el barrido.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);
const sweepS = (180 * 15) / 1000;

export const STEPS = [
  {
    id: 'bloqueo',
    short: 'delay() bloquea',
    title: 'Cuando delay() bloquea',
    html: `
      <p>Ejecuta el código inicial. El barrido funciona, pero el LED de D${LED_PIN} solo cambia al terminar cada recorrido, unos ${String(sweepS + 0.5).replace('.', ',')}&nbsp;s después. Mientras <code>delay(15)</code> espera, el microcontrolador no hace <strong>nada más</strong>: el loop no llega a la parte del LED.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Componente</th><th scope="col">Conexión</th></tr></thead>
        <tbody>
          <tr><td>Servo: naranja</td><td>D${SERVO_PIN}</td></tr>
          <tr><td>Servo: rojo y marrón</td><td>Fuente externa de 5&nbsp;V; su negativo unido al GND del Nano</td></tr>
          <tr><td>LED</td><td>D${LED_PIN} → 220&nbsp;Ω → LED → GND</td></tr>
        </tbody>
      </table>
      ${question('El barrido de 0° a 180° hace 181 esperas de 15 ms. ¿Cuánto tiempo pasa sin que el LED pueda cambiar?', `Unos ${String(sweepS).replace('.', ',')} s (181 × 15 ms ≈ 2,7 s): mucho más que los 500 ms que debería durar cada estado del LED.`)}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'millis',
    short: 'millis()',
    title: 'Mirar el reloj en vez de esperar',
    html: `
      <p><code>millis()</code> devuelve los milisegundos desde que arrancó el programa. En lugar de esperar, cada tarea <strong>mira el reloj</strong>: si ya pasó su intervalo, hace un paso y apunta la hora; si no, sigue. El loop da miles de vueltas por segundo y cada tarea avanza cuando le toca.</p>
      <pre class="lesson-code"><code>if (millis() - antes &gt;= intervalo) {
  antes = antes + intervalo;
  // un paso de la tarea
}</code></pre>
      <p>Usa <code>unsigned long</code> para guardar tiempos: <code>millis()</code> crece mucho más de lo que cabe en un <code>int</code>.</p>
      ${example('reloj')}
      ${question('¿Por qué «antes = antes + intervalo» y no «antes = millis()»?', 'Si el loop llega un poco tarde, «antes = millis()» arrastra ese retraso a cada paso y el ritmo se va alargando. Sumar el intervalo mantiene el ritmo exacto.')}`,
  },
  {
    id: 'estado',
    short: 'Estado',
    title: 'Recordar por dónde va el barrido',
    html: `
      <p>Sin un <code>for</code> que espere, el barrido necesita <strong>recordar</strong> entre vueltas del loop dos cosas: el ángulo actual y el sentido. En cada paso suma el sentido (+1 o −1) al ángulo y, al llegar a un extremo, cambia el sentido.</p>
      ${example('rebote')}
      ${question('Si el ángulo empieza en 0 con sentido +1 y cambias el sentido al llegar a 180, ¿qué ángulo se escribe justo después de 180?', '179: el sentido pasa a −1 y el siguiente paso resta 1. El barrido vuelve sin saltos.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'dos-tareas',
    short: 'Dos tareas',
    title: 'Dos tareas, dos relojes',
    html: `
      <p>Cada tarea lleva su propia variable de tiempo:</p>
      <table class="conn-table">
        <caption class="sr-only">Tareas del reto</caption>
        <thead><tr><th scope="col">Tarea</th><th scope="col">Intervalo</th><th scope="col">Paso</th></tr></thead>
        <tbody>
          <tr><td>Servo</td><td>15&nbsp;ms</td><td>±1°; cambiar el sentido en 0° y 180°</td></tr>
          <tr><td>LED</td><td>500&nbsp;ms</td><td>Cambiar de encendido a apagado o al revés</td></tr>
        </tbody>
      </table>
      <p>1° cada 15&nbsp;ms son unos 67&nbsp;°/s: un recorrido completo tarda unos ${String(sweepS).replace('.', ',')}&nbsp;s. El servo modelado puede girar hasta ${SERVO.speedDegS}&nbsp;°/s, así que sigue el barrido sin retraso visible.</p>
      ${question('¿Qué le pasaría al parpadeo si la tarea del servo usara delay(15) dentro de su if?', 'Cada paso del servo frenaría el loop 15 ms; el LED cambiaría tarde y su periodo dejaría de ser 1 s exacto. Ninguna tarea debe esperar.')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <ol>
        <li>Declara las variables de cada tarea fuera de <code>loop()</code>.</li>
        <li>En <code>loop()</code>, una tarea para el servo y otra para el LED, cada una con su <code>if (millis() - … &gt;= …)</code>, sin <code>delay</code>.</li>
        <li>Ejecuta, mira el brazo y el LED a la vez, y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${BARRIDO.durationMs / 1000} segundos simulados y mide cada pulso de D${SERVO_PIN}, el servo modelado y cada cambio de D${LED_PIN}. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'hacer dos tareas a la vez con millis(): barrer un servo sin bloquear el programa mientras un LED parpadea a su propio ritmo.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'La librería oficial <code>Servo</code> 1.3.0 de Arduino genera los pulsos con el Timer1; <code>millis()</code> usa el Timer0. Los dos funcionan a la vez en el microcontrolador emulado.',
  `El SG90 es un modelo: mide cada pulso real de D${SERVO_PIN} (544 µs = 0°, 2400 µs = 180°) y mueve el brazo hacia ese ángulo a ${SERVO.speedDegS} °/s como máximo. El LED de D${LED_PIN} se dibuja con el nivel medido del pin.`,
  'Simplificaciones: sin carga, sin inercia del brazo ni vibración. La fuente de 5 V y el GND común solo se representan en el diagrama.',
  'Todavía no: el radar con servo ni el robot completo.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'el bloqueo', hints: [
    'Ejecuta el código inicial y mira cuándo cambia el LED.',
    'Mientras delay espera, el loop no puede atender al LED.',
  ] },
  'paso-1': { label: 'millis()', hints: [
    'millis() dice cuántos milisegundos lleva el programa en marcha.',
    'Compara millis() - antes con el intervalo y, si ya pasó, haz un paso y suma el intervalo a antes.',
  ] },
  'paso-2': { label: 'el estado del barrido', hints: [
    'Guarda el ángulo y el sentido en variables fuera de loop().',
    'En cada paso suma el sentido al ángulo; en 0 y en 180 cambia el signo del sentido.',
  ] },
  'paso-3': { label: 'dos tareas', hints: [
    'Cada tarea tiene su propia variable de tiempo.',
    'El servo da un paso cada 15 ms; el LED cambia cada 500 ms.',
  ] },
  compilar: COMPILE_TOPIC,
  include: { label: 'la librería', hints: [
    'Para mover el servo hace falta la librería Servo.',
    'Escribe #include <Servo.h>, un objeto Servo y attach(9) en setup().',
  ] },
  attach: { label: 'conectar el servo', hints: [
    'Sin attach no hay pulsos: el servo no se mueve.',
    'En setup(): servo.attach(9);',
  ] },
  pin: { label: 'los pines', hints: [
    'La señal del servo está en D9 y el LED en D13.',
    'Revisa los números de attach, pinMode y digitalWrite.',
  ] },
  millis: { label: 'quitar los delay', hints: [
    'Con delay en el loop, una tarea detiene a la otra.',
    'Cambia cada delay por una comprobación con millis(): if (millis() - antes >= intervalo).',
  ] },
  led: { label: 'el LED', hints: [
    'El LED debe cambiar cada 500 ms mientras el servo se mueve.',
    'Dale al LED su propia tarea con millis() y digitalWrite en D13; configura D13 con pinMode.',
  ] },
  barrido: { label: 'el recorrido', hints: [
    'El barrido va de 0° a 180° y vuelve, sin parar.',
    'Cambia el sentido justo en 0 y en 180, no antes.',
  ] },
  velocidad: { label: 'la velocidad', hints: [
    'Compara la velocidad medida con unos 67 °/s.',
    'Un paso de 1° cada 15 ms: revisa el intervalo de la tarea del servo y el tamaño del paso.',
  ] },
  suave: { label: 'el paso', hints: [
    'El servo debe avanzar poco a poco, no saltar.',
    'Cambia el ángulo de 1 en 1 en cada paso de la tarea.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba una tercera tarea: imprimir el ángulo cada 250 ms sin frenar las otras dos.',
    'Otra idea: que el barrido se detenga un momento en los extremos usando también millis().',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/#\s*include\s*<\s*Servo\.h\s*>/.test(src)) return { topic: 'include', facts };
  const attach = src.match(/\.attach\s*\(\s*(\w+)/);
  if (!attach) return { topic: 'attach', facts };
  if (/^\d+$/.test(attach[1]) && attach[1] !== String(SERVO_PIN)) return { topic: 'pin', facts };
  if (/\bdelay\s*\(/.test(body(src, 'loop')) || !/millis\s*\(/.test(src)) return { topic: 'millis', facts };
  if (!/digitalWrite\s*\(/.test(src)) return { topic: 'led', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { senal: 'attach', barrido: 'barrido', suave: 'suave', velocidad: 'velocidad', led: 'led', servo: 'barrido' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    if (failed.id === 'senal' && /Hay pulsos cada 20 ms en/.test(failed.detail || '')) return { topic: 'pin', facts: analysis.facts };
    if (failed.id === 'led' && /Hay cambios en D/.test(failed.detail || '')) return { topic: 'pin', facts: analysis.facts };
    if (failed.id === 'led' && /delay\(\)/.test(failed.detail || '')) return { topic: 'millis', facts: analysis.facts };
    if (CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  senal: ['La señal del servo es D9: attach(9).', 'Sin attach no hay pulsos.'],
  barrido: ['Compara los extremos y los cambios de sentido medidos con 0° y 180°.',
    'El sentido cambia exactamente en 0 y en 180.'],
  suave: ['El detalle dice cuándo saltó la orden.', 'Avanza de 1° en 1°, un paso cada 15 ms.'],
  velocidad: ['Compara la velocidad medida con unos 67 °/s.', 'Revisa el intervalo de la tarea del servo: 15 ms.'],
  led: ['El LED de D13 debe cambiar cada 500 ms durante el barrido.',
    'Si el detalle dice que el LED espera, quita los delay y usa millis() en las dos tareas.'],
  servo: ['El brazo debe poder seguir la orden.', 'Revisa la velocidad del barrido.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy harás dos cosas a la vez: barrer el servo y hacer parpadear un LED. Pulsa Ejecutar con el código inicial: ¿el LED cambia cada medio segundo? Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el servo está en D9 y el LED en D13.`,
  evalPass: '¡Reto superado! El servo barrió de 0° a 180° y de vuelta a unos 67 °/s mientras el LED parpadeaba cada 500 ms: dos tareas a la vez sin bloquearse. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 13,
  tema: 'Servo',
  titulo: 'Barrido sin bloquear',
  corto: 'Barrido sin bloquear',
  kicker: 'Lección 13 · Servo',
  previas: ['arduino-servo-posiciones', 'arduino-boton-flanco'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root) => createServoCircuit(root, { pin: SERVO_PIN, led: LED_PIN }),
  pins: [SERVO_PIN, LED_PIN],
  servo: { pin: SERVO_PIN },
  evaluation: {
    durationMs: BARRIDO.durationMs,
    evaluate: evaluateBarrido,
    stimulus: { servo: { pin: SERVO_PIN } },
    note: 'La comprobación ejecuta tu programa 7 segundos simulados y mide cada pulso de D9, la respuesta del servo modelado y cada cambio de D13.',
  },
  guide: { chooseTopic, hintText, help },
};
