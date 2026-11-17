// Lección 9 · Tema 5: sentido de giro con el puente H L298N (5.1 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el modelo L298N + motor (motor.js) sigue el nivel real de D7 (IN1) y D8 (IN2) del
// programa compilado; la evaluación mide sus órdenes, el motor modelado y la parada antes de invertir (motor-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateDireccion, DIRECCION, DIRECCION_PINS } from './motor-eval.js';
import { MOTOR } from '../motor.js';
import { createMotorCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip, body } from '../guide.js';

export const ID = 'arduino-l298n-direccion';
const [CH] = DIRECCION_PINS;

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 9: un motor con el puente H L298N
// IN1 en D7, IN2 en D8. ENA lleva el puente puesto (siempre habilitado).
// El motor se alimenta con su batería a través del L298N; el Nano solo da las órdenes.

const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  // Adelante durante 1,5 segundos
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  delay(1500);

  // Parar: IN1 e IN2 iguales (freno)
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  // Práctica: añade aquí un giro hacia atrás de 1 segundo y vuelve a parar.
}

void loop() {
}
`;

export const EXAMPLES = {
  tabla: {
    title: 'Las cuatro combinaciones de IN1 e IN2',
    code: `// Ejemplo: recorre la tabla del puente H, 1 segundo por combinación.
// Fíjate en el aviso del simulador al pasar de adelante a atrás sin parar.
void setup() {
  Serial.begin(9600);
  pinMode(7, OUTPUT);
  pinMode(8, OUTPUT);
}

void probar(int a, int b) {
  digitalWrite(7, a);
  digitalWrite(8, b);
  Serial.print("IN1=");
  Serial.print(a);
  Serial.print(" IN2=");
  Serial.println(b);
  delay(1000);
}

void loop() {
  probar(HIGH, LOW);
  probar(LOW, HIGH);
  probar(LOW, LOW);
  probar(HIGH, HIGH);
}
`,
  },
  funcion: {
    title: 'Una función para cada orden',
    code: `// Ejemplo: funciones con nombre hacen el programa más fácil de leer.
const int IN1 = 7;
const int IN2 = 8;

void adelante() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void frenar() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  adelante();
  delay(800);
  frenar();
}

void loop() { }
`,
  },
};

const ms = (x) => `${String(x / 1000).replace('.', ',')} s`;

export const CHALLENGE = {
  title: 'Reto: ida y vuelta',
  summary: 'Haz que el motor gire 1 s hacia adelante, se pare 0,5 s, gire 1 s hacia atrás y se pare 0,5 s, una y otra vez.',
  criteria: [
    'D7 (IN1) y D8 (IN2) configurados como salidas.',
    'El primer movimiento es hacia adelante (IN1 HIGH, IN2 LOW); hacia atrás es IN1 LOW, IN2 HIGH.',
    'Adelante 1 s → parado 0,5 s → atrás 1 s → parado 0,5 s, con cada fase a ±10 %, al menos dos ciclos completos.',
    'Antes de cambiar de sentido, el motor recibe la orden de parar durante al menos 100 ms.',
    'El motor modelado gira en el sentido de cada orden.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'potencia',
    short: 'Potencia',
    title: 'Por qué el Nano no mueve el motor',
    html: `
      <p>Un pin del Nano entrega como mucho unos 20&nbsp;mA (40&nbsp;mA es el límite absoluto). Un motor DC pequeño necesita de 200 a 1000&nbsp;mA a 6–9&nbsp;V y, al cortarle la corriente, genera picos de tensión. Conectarlo directamente a un pin dañaría el microcontrolador.</p>
      <p>Por eso se usa un <strong>controlador de motores</strong> como el <strong>L298N</strong>: el Nano solo envía <strong>órdenes</strong> (HIGH o LOW) y la <strong>batería del motor</strong> aporta la energía a través del módulo.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Conexión</th><th scope="col">Para qué sirve</th></tr></thead>
        <tbody>
          <tr><td>D7 → IN1, D8 → IN2</td><td>Órdenes de sentido (señales, casi sin corriente)</td></tr>
          <tr><td>ENA con el puente puesto</td><td>Canal A siempre habilitado</td></tr>
          <tr><td>OUT1 y OUT2 → motor</td><td>Corriente del motor, la gestiona el L298N</td></tr>
          <tr><td>Batería 7–9&nbsp;V: + a VS, − a GND del L298N</td><td>Alimentación de los motores</td></tr>
          <tr><td>GND del L298N → GND del Nano</td><td><strong>GND común</strong>: la referencia de los niveles HIGH y LOW</td></tr>
          <tr><td>Nano por USB</td><td>Alimenta solo el Nano; el borne de 5&nbsp;V del módulo queda sin usar</td></tr>
        </tbody>
      </table>
      ${question('Si unes la batería al L298N pero olvidas el cable entre su GND y el GND del Nano, ¿qué pasa?', 'El L298N no sabe respecto a qué medir los 5 V de IN1 e IN2: las órdenes no tienen referencia y el motor puede no moverse o hacerlo de forma errática. Sin GND común no hay señal fiable.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'puente-h',
    short: 'Puente H',
    title: 'La tabla del puente H',
    html: `
      <p>Un <strong>puente H</strong> tiene cuatro interruptores que conectan cada borne del motor a + o a −. Según IN1 e IN2, la corriente cruza el motor en un sentido o en el otro:</p>
      <table class="conn-table">
        <caption class="sr-only">Tabla de verdad del canal A</caption>
        <thead><tr><th scope="col">IN1</th><th scope="col">IN2</th><th scope="col">Orden</th></tr></thead>
        <tbody>
          <tr><td>HIGH</td><td>LOW</td><td>Adelante</td></tr>
          <tr><td>LOW</td><td>HIGH</td><td>Atrás</td></tr>
          <tr><td>LOW</td><td>LOW</td><td>Freno (los dos bornes al mismo nivel)</td></tr>
          <tr><td>HIGH</td><td>HIGH</td><td>Freno</td></tr>
        </tbody>
      </table>
      <p>Ejecuta el código inicial y mira bajo el circuito las dos lecturas: <strong>Orden del puente H</strong> y <strong>Motor</strong>.</p>
      ${example('tabla')}
      ${question('¿Qué hace el motor si D8 no está configurado como salida y escribes digitalWrite(8, HIGH)?', 'Nada útil: sin pinMode(8, OUTPUT), digitalWrite solo activa la resistencia interna del pin, que no da una orden firme al L298N. El simulador lo marca como «sin configurar».')}`,
  },
  {
    id: 'parar',
    short: 'Parar',
    title: 'Orden de parada e inercia',
    html: `
      <p>La <strong>orden</strong> de parar es instantánea: en cuanto IN1 e IN2 quedan iguales, el puente frena. Pero el <strong>eje</strong> tiene inercia y tarda un poco en detenerse. En el modelo, con freno, unos ${Math.round(MOTOR.tauBrakeMs * 4)}&nbsp;ms; sin freno (rueda libre, lección 10), bastante más.</p>
      <p>Si inviertes el sentido con el motor aún girando, en un motor real se produce un <strong>pico de corriente</strong> y un golpe en los engranajes. Por eso el reto exige al menos <strong>${DIRECCION.minStopMs}&nbsp;ms parado</strong> antes de cambiar de sentido. El simulador te avisa si inviertes con el motor girando.</p>
      ${example('funcion')}
      ${question('Tras la orden de frenar, la lectura «Motor» aún muestra rpm durante un instante. ¿Está mal el programa?', 'No: es la inercia del eje. La orden ya es «freno»; la velocidad baja en una fracción de segundo. El reto mide las órdenes (los pines) y comprueba además que el motor modelado las sigue.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'tiempos',
    short: 'Tiempos',
    title: 'Encadenar las fases',
    html: `
      <p>Dentro de <code>loop()</code>, cada fase es: fijar IN1 e IN2 y esperar con <code>delay()</code>. Como <code>loop()</code> se repite, la secuencia vuelve a empezar sola.</p>
      <ol>
        <li>Adelante, ${ms(1000)}.</li>
        <li>Parado, ${ms(500)}.</li>
        <li>Atrás, ${ms(1000)}.</li>
        <li>Parado, ${ms(500)}.</li>
      </ol>
      ${question('¿Cuánto dura una vuelta completa de loop() con estas fases?', '1 + 0,5 + 1 + 0,5 = 3 segundos. En los 6,6 s de la comprobación caben dos ciclos completos.')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <ol>
        <li>Configura D7 y D8 como salidas.</li>
        <li>Escribe las cuatro fases en <code>loop()</code> con sus tiempos.</li>
        <li>Ejecuta, observa la orden y el motor, y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${String(DIRECCION.durationMs / 1000).replace('.', ',')} segundos simulados y mide las órdenes que reciben IN1 e IN2 y cómo responde el motor modelado. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'entender por qué un motor necesita un puente H y su propia batería con GND común, y controlar el sentido de giro con IN1 e IN2, parando antes de invertir.';

export const SCOPE = [
  ...SCOPE_COMMON,
  `El L298N y el motor son un modelo: la orden sale del nivel real de D7 y D8 (solo si son salidas) y el motor responde con inercia (constante de tiempo ${MOTOR.tauDriveMs} ms al acelerar, ${MOTOR.tauBrakeMs} ms con freno, ${MOTOR.tauCoastMs} ms en rueda libre).`,
  'La batería, los cables de potencia y el GND común se representan en el diagrama; no se simulan tensiones, corrientes ni la caída de tensión del L298N.',
  'El circuito es fijo: no se evalúa un montaje físico.',
  'Todavía no: servos, robot completo ni librerías adicionales.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'la alimentación', hints: [
    'El Nano da órdenes; la energía del motor sale de su batería a través del L298N.',
    'Repasa la tabla de conexiones: batería a VS y GND del módulo, y GND del módulo al GND del Nano.',
  ] },
  'paso-1': { label: 'la tabla del puente H', hints: [
    'IN1 HIGH e IN2 LOW es adelante; al revés, atrás; iguales, freno.',
    'Ejecuta el ejemplo de la tabla y mira cómo cambia la lectura «Orden del puente H».',
  ] },
  'paso-2': { label: 'parar e invertir', hints: [
    'La orden de parar es inmediata, pero el eje tarda en detenerse.',
    'Antes de cambiar de sentido, deja IN1 e IN2 iguales al menos 100 ms.',
  ] },
  'paso-3': { label: 'las fases', hints: [
    'Cada fase: fijar IN1 e IN2 y luego esperar.',
    'Los tiempos son 1000, 500, 1000 y 500 ms dentro de loop().',
  ] },
  compilar: COMPILE_TOPIC,
  pinmode: { label: 'las salidas', hints: [
    'El L298N solo recibe la orden si el pin es una salida del Nano.',
    'En setup(), configura con pinMode(…, OUTPUT) los dos pines del L298N: D7 y D8.',
  ] },
  bucle: { label: 'la repetición', hints: [
    'El reto se repite una y otra vez.',
    'Mueve la secuencia de setup() a loop(): loop() se repite sola.',
  ] },
  atras: { label: 'el giro hacia atrás', hints: [
    'Falta una fase en la que el motor gire hacia atrás.',
    'Hacia atrás es la combinación contraria a adelante en IN1 e IN2.',
  ] },
  sentido: { label: 'el sentido', hints: [
    'El reto empieza hacia adelante.',
    'Adelante es IN1 = HIGH e IN2 = LOW. Revisa qué escribes primero en cada pin.',
  ] },
  secuencia: { label: 'las fases y sus tiempos', hints: [
    'Mira el detalle: dice qué fase llegó fuera de orden o con qué duración.',
    'Adelante 1000 ms, parado 500 ms, atrás 1000 ms, parado 500 ms.',
  ] },
  inversion: { label: 'la parada antes de invertir', hints: [
    'El motor cambió de sentido sin pararse antes.',
    'Entre adelante y atrás, deja IN1 e IN2 iguales y espera: el reto pide 500 ms parado, y al menos 100 ms.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a escribir por el monitor serie cada cambio de fase.',
    'Otra idea: frena con IN1 e IN2 en HIGH en lugar de LOW. ¿Cambia algo en el motor modelado?',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  const outputs = [...src.matchAll(/pinMode\s*\(\s*(\w+)\s*,\s*OUTPUT\s*\)/g)].length;
  if (outputs < 2) return { topic: 'pinmode', facts };
  const loop = body(src, 'loop');
  if (!/\w+\s*\(/.test(loop)) return { topic: 'bucle', facts };
  if ((loop.match(/\bHIGH\b/g) || []).length < 2) return { topic: 'atras', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { salidas: 'pinmode', sentido: 'sentido', secuencia: 'secuencia', inversion: 'inversion', motor: 'secuencia' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar' && CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  salidas: ['El detalle dice qué pin no es salida. En setup(), pinMode(7, OUTPUT) y pinMode(8, OUTPUT).',
    'Sin pinMode(OUTPUT), digitalWrite solo enciende la resistencia interna: el L298N no recibe la orden.'],
  sentido: ['Adelante es IN1 = HIGH e IN2 = LOW. La primera fase del reto es hacia adelante.',
    'Si el motor empieza hacia atrás, intercambia los valores de la primera fase.'],
  secuencia: ['El detalle indica qué fase no encaja: su orden o su duración medida.',
    'Cada fase es una pareja de digitalWrite seguida de un delay: 1000, 500, 1000 y 500 ms.'],
  inversion: ['Entre adelante y atrás hace falta una fase con IN1 e IN2 iguales.',
    'Deja el motor parado 500 ms antes de cambiar de sentido (el mínimo es 100 ms).'],
  motor: ['Las órdenes deben durar lo suficiente para que el motor modelado alcance su velocidad.',
    'Revisa el detalle: dice hasta qué velocidad llegó el motor en cada fase.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy moverás un motor con un puente H L298N. Recuerda: el Nano da las órdenes y la batería del motor pone la energía. Pulsa Ejecutar y mira las lecturas «Orden» y «Motor» bajo el circuito. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el L298N usa D7 (IN1) y D8 (IN2).`,
  evalPass: '¡Reto superado! El motor fue hacia adelante y hacia atrás con los tiempos pedidos y siempre paró antes de invertir. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 9,
  tema: 'Puente H L298N y motores',
  titulo: 'Sentido de giro con el puente H',
  corto: 'Sentido de giro',
  kicker: 'Lección 9 · Motores',
  previas: ['arduino-protoboard-semaforo'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root) => createMotorCircuit(root, { channels: DIRECCION_PINS }),
  pins: [CH.in1, CH.in2],
  motors: { channels: DIRECCION_PINS },
  evaluation: {
    durationMs: DIRECCION.durationMs,
    evaluate: evaluateDireccion,
    stimulus: { motors: { channels: DIRECCION_PINS } },
    note: 'La comprobación ejecuta tu programa 6,6 segundos simulados y mide las órdenes que recibe el L298N por D7 y D8 y cómo responde el motor modelado.',
  },
  guide: { chooseTopic, hintText, help },
};
