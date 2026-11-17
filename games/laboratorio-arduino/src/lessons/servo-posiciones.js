// Lección 12 · Tema 3: posiciones del servo (3.1 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el modelo del SG90 (servo.js) mide cada pulso real de D9 (ancho y periodo) generado por
// la librería Servo compilada; el evaluador (servo-eval.js) compara ángulos, tiempos, la llegada del eje y el monitor serie.
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluatePosiciones, POSICIONES, SERVO_PIN } from './servo-eval.js';
import { SERVO } from '../servo.js';
import { createServoCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-servo-posiciones';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 12: posiciones del servo
// Servo SG90: naranja (señal) en D9, rojo a la fuente externa de 5 V,
// marrón al negativo de la fuente, unido al GND del Nano (GND común).
// Práctica: mira el ancho del pulso y el brazo con 0°, 90° y 180°.
#include <Servo.h>

Servo servo;   // un objeto Servo por cada servo

void setup() {
  servo.attach(9);   // D9 empieza a recibir un pulso cada 20 ms
}

void loop() {
  servo.write(0);
  delay(2000);
  servo.write(90);
  delay(2000);
  servo.write(180);
  delay(2000);
}
`;

export const EXAMPLES = {
  micros: {
    title: 'El pulso en microsegundos',
    code: `// Ejemplo: writeMicroseconds fija el ancho del pulso directamente.
// read() devuelve el ángulo que corresponde a ese pulso.
#include <Servo.h>

Servo servo;

void setup() {
  Serial.begin(9600);
  servo.attach(9);
  servo.writeMicroseconds(1000);
  Serial.print("Pulso de 1000 us = ");
  Serial.print(servo.read());
  Serial.println(" grados");
}

void loop() { }
`,
  },
  imprimir: {
    title: 'Texto y número en una línea',
    code: `// Ejemplo: print escribe sin saltar de línea; println termina la línea.
void setup() {
  Serial.begin(9600);
  int grados = 45;
  Serial.print("Angulo: ");
  Serial.println(grados);
}

void loop() { }
`,
  },
};

const us = (a) => Math.round(SERVO.minUs + (a / 180) * (SERVO.maxUs - SERVO.minUs));

export const CHALLENGE = {
  title: 'Reto: cuatro posiciones',
  summary: 'Mueve el servo de D9 a 0°, 90°, 180° y 90°, un segundo en cada posición, e informa cada ángulo por el monitor serie al moverlo. Repite la secuencia.',
  criteria: [
    'D9 recibe pulsos de servo a unos 50 Hz (45–55 Hz) con la librería Servo.',
    'Secuencia 0° → 90° → 180° → 90° desde el arranque, y vuelta a 0°: el ancho de cada pulso, convertido a ángulo, a ±5°.',
    'Cada posición se mantiene 1 s (0,9–1,1 s).',
    'El servo modelado llega a cada posición.',
    'Una línea serie con el número del ángulo al empezar cada posición (±150 ms), a 9600 baudios.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'senal',
    short: 'La señal',
    title: 'Cómo se le habla a un servo',
    html: `
      <p>Un servo no gira sin parar como un motor: va a un <strong>ángulo</strong> y se queda ahí. Recibe la orden por un solo cable de señal: <strong>un pulso cada 20&nbsp;ms</strong> (50 por segundo). El <strong>ancho</strong> del pulso indica el ángulo.</p>
      <table class="conn-table">
        <caption class="sr-only">Ancho del pulso y ángulo (escala de la librería Servo)</caption>
        <thead><tr><th scope="col">Pulso</th><th scope="col">Ángulo</th></tr></thead>
        <tbody>
          ${[0, 90, 180].map((a) => `<tr><td>${us(a)} µs (${(us(a) / 1000).toFixed(2).replace('.', ',')} ms)</td><td>${a}°</td></tr>`).join('')}
        </tbody>
      </table>
      <p>Es distinto del PWM de <code>analogWrite</code> (unos 490 pulsos por segundo cuyo % de tiempo en HIGH regula la energía): un servo necesita pulsos cortos y espaciados, y solo le importa su duración.</p>
      ${question('Si el pulso dura 0,5 ms, ¿el servo está a 0° o a 180°?', 'Cerca de 0°: los pulsos cortos llevan el brazo a un extremo y los largos (unos 2,4 ms) al otro. A mitad, unos 1,5 ms, queda hacia 90°.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'alimentacion',
    short: 'Alimentación',
    title: 'Fuente separada y GND común',
    html: `
      <p>El servo tiene tres cables:</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del servo SG90</caption>
        <thead><tr><th scope="col">Cable</th><th scope="col">Conexión</th></tr></thead>
        <tbody>
          <tr><td>Naranja (señal)</td><td>D${SERVO_PIN} del Nano</td></tr>
          <tr><td>Rojo (+)</td><td>Fuente externa de 5&nbsp;V (por ejemplo, 4 pilas recargables o un adaptador de 5&nbsp;V de 1&nbsp;A o más)</td></tr>
          <tr><td>Marrón (−)</td><td>Negativo de la fuente, unido también al GND del Nano</td></tr>
        </tbody>
      </table>
      <p>Al arrancar o al hacer fuerza, un servo puede pedir cientos de miliamperios. Si lo alimentas desde el pin 5&nbsp;V del Nano, la tensión cae y la placa se reinicia o el USB se desconecta. Por eso el servo toma la energía de su propia fuente, y el <strong>GND común</strong> da a la señal de D${SERVO_PIN} la misma referencia de 0&nbsp;V.</p>
      ${question('¿Qué pasa si conectas la fuente externa al servo pero olvidas unir su negativo con el GND del Nano?', 'La señal no tiene una referencia común: el servo no sabe dónde está el 0 V del Nano, así que tiembla, se mueve al azar o no responde.')}`,
  },
  {
    id: 'libreria',
    short: 'Librería Servo',
    title: 'La librería Servo',
    html: `
      <p>Generar a mano pulsos exactos cada 20&nbsp;ms sería pesado. La librería <code>Servo</code> lo hace sola con el <strong>Timer1</strong> y sus interrupciones, mientras tu programa sigue:</p>
      <ol>
        <li><code>#include &lt;Servo.h&gt;</code> y un objeto: <code>Servo servo;</code></li>
        <li><code>servo.attach(9);</code> empieza a enviar pulsos por D9.</li>
        <li><code>servo.write(angulo);</code> cambia el ancho de los pulsos siguientes (0–180).</li>
      </ol>
      <p>Tras <code>attach</code> y antes del primer <code>write</code>, la librería envía pulsos de 1500&nbsp;µs (unos 93°). Como usa el Timer1, <code>analogWrite</code> deja de funcionar en D9 y D10 mientras haya un servo conectado; D3, D5, D6 y D11 siguen con PWM.</p>
      ${example('micros')}
      ${question('Con attach(9) y sin ningún write, ¿el servo está quieto en 0°?', 'No: la librería lo manda a su posición por defecto, 1500 µs (unos 93°). Para ir a 0° hay que escribir write(0).')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'mecanica',
    short: 'Orden y giro',
    title: 'La orden es instantánea; el giro no',
    html: `
      <p>Ejecuta el código inicial y observa: la lectura «Señal en D${SERVO_PIN}» cambia en cuanto <code>write</code> cambia el pulso (la marca naranja del dial salta), pero el brazo tarda en llegar. El modelo del SG90 gira como máximo a ${SERVO.speedDegS}&nbsp;°/s: de 0° a 180° tarda unos ${Math.round((180 / SERVO.speedDegS) * 1000)}&nbsp;ms.</p>
      <p>Para informar el ángulo, escribe la línea en el mismo momento en que mandas la orden, antes de esperar.</p>
      ${example('imprimir')}
      ${question('¿Por qué un servo real puede no llegar a 180° aunque el pulso sea de 2,4 ms?', 'Cada modelo tiene su propio rango: en algunos, 2,4 ms ya está más allá de su tope mecánico y el servo zumba empujando contra él. Por eso conviene probar los extremos con cuidado.')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <ol>
        <li>Inicia el monitor serie y conecta el servo en <code>setup()</code>.</li>
        <li>En <code>loop()</code>: para cada posición, mueve el servo, imprime el ángulo y espera 1 s.</li>
        <li>Ejecuta, observa el dial y el monitor, y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${String(POSICIONES.durationMs / 1000).replace('.', ',')} segundos simulados y mide cada pulso de D${SERVO_PIN}, la respuesta del servo modelado y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'entender la señal de un servo (un pulso cada 20 ms cuyo ancho fija el ángulo), alimentarlo aparte con GND común y llevarlo a posiciones con la librería Servo.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'La librería oficial <code>Servo</code> 1.3.0 de Arduino se compila y enlaza con tu programa: genera los pulsos con el Timer1 del microcontrolador emulado.',
  `El SG90 es un modelo: mide el ancho y el periodo de cada pulso real de D${SERVO_PIN}, lo convierte en ángulo con la escala de la librería (544 µs = 0°, 2400 µs = 180°) y mueve el brazo hacia él a ${SERVO.speedDegS} °/s como máximo. Pulsos fuera de 0,4–2,6 ms o a menos de 5 ms entre sí no son órdenes.`,
  'Simplificaciones: sin carga, sin inercia del brazo, sin vibración en los topes ni zona muerta, y la misma escala para cualquier servo. La fuente de 5 V y el GND común solo se representan en el diagrama.',
  'Todavía no: varios servos, el robot completo ni otras librerías.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'la señal', hints: [
    'El servo recibe un pulso cada 20 ms; su ancho indica el ángulo.',
    'Unos 0,5 ms llevan el brazo a un extremo y unos 2,4 ms al otro.',
  ] },
  'paso-1': { label: 'la alimentación', hints: [
    'El servo toma la energía de una fuente externa de 5 V, no del Nano.',
    'Une el negativo de la fuente con el GND del Nano: sin GND común, la señal no tiene referencia.',
  ] },
  'paso-2': { label: 'la librería', hints: [
    'Necesitas #include <Servo.h>, un objeto Servo y attach con el pin de la señal.',
    'Después de attach, write(angulo) cambia la posición.',
  ] },
  'paso-3': { label: 'orden y giro', hints: [
    'Ejecuta el código inicial: la marca naranja del dial es la orden; el brazo llega después.',
    'Imprime el ángulo justo después de write, antes de la espera.',
  ] },
  compilar: COMPILE_TOPIC,
  include: { label: 'la librería', hints: [
    'Para usar Servo hay que incluir su librería al principio del programa.',
    'Escribe #include <Servo.h> y declara un objeto: Servo servo;',
  ] },
  attach: { label: 'conectar el servo', hints: [
    'Sin attach, la librería no genera pulsos y el servo no se mueve.',
    'En setup(): servo.attach(9); porque la señal está en D9.',
  ] },
  pin: { label: 'el pin de la señal', hints: [
    'La señal del servo está conectada a D9.',
    'Revisa el número de attach: si generas los pulsos en otro pin, el servo no los recibe.',
  ] },
  analogwrite: { label: 'la señal correcta', hints: [
    'analogWrite produce PWM a unos 490 Hz: no es la señal que entiende un servo.',
    'Usa la librería Servo: attach(9) y write(angulo).',
  ] },
  write: { label: 'los ángulos', hints: [
    'El servo solo recibe la posición por defecto si no hay ningún write.',
    'Usa write con cada ángulo del reto, en orden: 0, 90, 180 y 90.',
  ] },
  serie: { label: 'el monitor serie', hints: [
    'El reto pide informar cada ángulo por el monitor serie.',
    'Inicia el monitor con Serial.begin(9600) e imprime el número del ángulo cuando mueves el servo.',
  ] },
  tiempos: { label: 'los tiempos', hints: [
    'Cada posición se mantiene un segundo.',
    'Después de cada write y de imprimir, espera 1000 ms.',
  ] },
  mensajes: { label: 'cuándo imprimir', hints: [
    'La línea debe aparecer al empezar cada posición, no al terminar.',
    'Primero write e impresión, después la espera.',
  ] },
  posiciones: { label: 'la secuencia', hints: [
    'Compara las posiciones medidas con 0 → 90 → 180 → 90 en el detalle de la comprobación.',
    'El loop repite la secuencia: después del último 90 vuelve a 0.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba writeMicroseconds con 1000 y 2000 µs y compara los ángulos con la tabla.',
    'Otra idea: guarda los ángulos en un arreglo y recórrelo con un for.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/#\s*include\s*<\s*Servo\.h\s*>/.test(src)) return { topic: /analogWrite\s*\(\s*(9|SERVO)/.test(src) ? 'analogwrite' : 'include', facts };
  const attach = src.match(/\.attach\s*\(\s*(\w+)/);
  if (!attach) return { topic: 'attach', facts };
  if (/^\d+$/.test(attach[1]) && attach[1] !== String(SERVO_PIN)) return { topic: 'pin', facts };
  if (!/\.write(Microseconds)?\s*\(/.test(src)) return { topic: 'write', facts };
  if (!/Serial\.begin\s*\(/.test(src) || !/Serial\.print/.test(src)) return { topic: 'serie', facts };
  if (delays.length && !delays.includes(1000)) return { topic: 'tiempos', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { senal: 'attach', posiciones: 'posiciones', tiempos: 'tiempos', mensajes: 'mensajes', baud: 'serie', servo: 'posiciones' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    if (failed.id === 'senal' && /analogWrite/.test(failed.detail || '')) return { topic: 'analogwrite', facts: analysis.facts };
    if (failed.id === 'senal' && /Hay pulsos cada 20 ms en/.test(failed.detail || '')) return { topic: 'pin', facts: analysis.facts };
    if (failed.id === 'posiciones' && /por defecto/.test(failed.detail || '')) return { topic: 'write', facts: analysis.facts };
    if (CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  senal: ['La señal del servo es D9 y la genera la librería Servo con attach(9).',
    'Si el detalle habla de PWM, cambia analogWrite por servo.write.'],
  posiciones: ['Compara las posiciones medidas con las que pide el reto.',
    'Orden: 0, 90, 180, 90, y el loop vuelve a empezar.'],
  tiempos: ['El detalle dice cuánto duró cada posición.',
    'Cada posición dura 1000 ms.'],
  servo: ['El brazo necesita tiempo para llegar: no cambies de posición antes de que llegue.',
    'Revisa el detalle de la secuencia y de los tiempos.'],
  mensajes: ['Imprime el número del ángulo en la misma línea, al mover el servo.',
    'Primero write y la impresión; después la espera.'],
  baud: ['El monitor serie del laboratorio está a 9600 baudios.',
    'Serial.begin(9600) en setup().'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy moverás un servo a posiciones exactas. Pulsa Ejecutar y mira el ancho del pulso en D9 y el brazo: ¿cuánto tarda en ir de 0° a 180°? Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero la señal del servo está en D9.`,
  evalPass: '¡Reto superado! El servo recibió pulsos de servo a 50 Hz, recorrió 0°, 90°, 180° y 90° un segundo cada vez, y anunciaste cada ángulo. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 12,
  tema: 'Servo',
  titulo: 'Posiciones del servo',
  corto: 'Posiciones del servo',
  kicker: 'Lección 12 · Servo',
  previas: ['arduino-pwm-brillo'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root) => createServoCircuit(root, { pin: SERVO_PIN }),
  pins: [SERVO_PIN],
  servo: { pin: SERVO_PIN },
  evaluation: {
    durationMs: POSICIONES.durationMs,
    evaluate: evaluatePosiciones,
    stimulus: { servo: { pin: SERVO_PIN } },
    note: 'La comprobación ejecuta tu programa 5,6 segundos simulados y mide cada pulso de D9 (ancho y periodo), la respuesta del servo modelado y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
