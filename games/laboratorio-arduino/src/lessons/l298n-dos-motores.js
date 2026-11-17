// Lección 11 · Tema 5: dos motores y maniobras con el L298N completo (5.3 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el mismo modelo L298N (motor.js) con dos canales sigue IN1–IN4 (D7, D8, D4, D2) y el
// PWM real de ENA/ENB (D5, D6); la evaluación reconoce las maniobras, sus tiempos y los anuncios por serie (motor-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateDosMotores, DOS, DOS_PINS } from './motor-eval.js';
import { MOTOR, PIN_MAPS } from '../motor.js';
import { createMotorCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-l298n-dos-motores';
const [A, B] = DOS_PINS;

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 11: dos motores con el L298N
// Motor izquierdo (A): IN1 D7, IN2 D8, ENA D5.
// Motor derecho  (B): IN3 D4, IN4 D2, ENB D6.

const int IN1 = 7;
const int IN2 = 8;
const int IN3 = 4;
const int IN4 = 2;
const int ENA = 5;
const int ENB = 6;

void avanzar(int velocidad) {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, velocidad);
  analogWrite(ENB, velocidad);
}

void parar() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // Práctica: prueba cada función por separado.
  avanzar(200);
  delay(1500);
  parar();
}

void loop() {
}
`;

export const EXAMPLES = {
  parametros: {
    title: 'Funciones con parámetros',
    code: `// Ejemplo: un parámetro hace que la misma función sirva para varios casos.
void repetir(char simbolo, int veces) {
  for (int i = 0; i < veces; i++) {
    Serial.print(simbolo);
  }
  Serial.println();
}

void setup() {
  Serial.begin(9600);
  repetir('*', 3);
  repetir('-', 10);
}

void loop() { }
`,
  },
  motor: {
    title: 'Un motor con sentido y velocidad',
    code: `// Ejemplo: una función para el motor izquierdo con dos parámetros.
// sentido: 1 adelante, -1 atrás, 0 parado.
const int IN1 = 7;
const int IN2 = 8;
const int ENA = 5;

void motorIzquierdo(int sentido, int velocidad) {
  digitalWrite(IN1, sentido == 1 ? HIGH : LOW);
  digitalWrite(IN2, sentido == -1 ? HIGH : LOW);
  analogWrite(ENA, velocidad);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  motorIzquierdo(1, 180);
  delay(800);
  motorIzquierdo(-1, 180);
  delay(800);
  motorIzquierdo(0, 0);
}

void loop() { }
`,
  },
};

export const CHALLENGE = {
  title: 'Reto: recorrido con giro',
  summary: 'Una sola vez: avanza 1 s, gira a la derecha 0,6 s con las ruedas en sentidos opuestos, avanza 1 s y para. Anuncia cada maniobra por el monitor serie justo al empezarla.',
  criteria: [
    'IN1–IN4 (D7, D8, D4, D2) como salidas y ENA/ENB (D5, D6) activados por encima de la zona muerta.',
    'Avanzar → girar a la derecha (motor izquierdo adelante, derecho atrás) → avanzar → parar. Se admite una pausa de hasta 0,2 s entre maniobras.',
    'Avanzar 1 s, girar 0,6 s y avanzar 1 s (±10 %); después, parado hasta el final.',
    'Los dos motores modelados giran como pide cada maniobra.',
    'Una línea por maniobra («Avanzar», «Girar a la derecha», «Avanzar», «Parar») a ±100 ms de su inicio, a 9600 baudios.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);
const ROWS = [
  ['Avanzar', 'adelante', 'adelante'],
  ['Girar a la derecha', 'adelante', 'atrás'],
  ['Girar a la izquierda', 'atrás', 'adelante'],
  ['Retroceder', 'atrás', 'atrás'],
  ['Parar', 'parado', 'parado'],
];

export const STEPS = [
  {
    id: 'canales',
    short: 'Dos canales',
    title: 'Los dos canales del L298N',
    html: `
      <p>El L298N tiene <strong>dos puentes H</strong>: el canal A (IN1, IN2, ENA) y el canal B (IN3, IN4, ENB). Cada uno mueve un motor con su sentido y su velocidad. Los dos motores comparten la batería del módulo y el <strong>GND común</strong> con el Nano.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Motor</th><th scope="col">Sentido</th><th scope="col">Velocidad (PWM)</th></tr></thead>
        <tbody>
          <tr><td>Izquierdo (A)</td><td>IN1 → D${A.in1}, IN2 → D${A.in2}</td><td>ENA → D${A.en}</td></tr>
          <tr><td>Derecho (B)</td><td>IN3 → D${B.in1}, IN4 → D${B.in2}</td><td>ENB → D${B.en}</td></tr>
          <tr><td colspan="3">Batería 7–9&nbsp;V a VS y GND del L298N · GND del L298N al GND del Nano · Nano por USB</td></tr>
        </tbody>
      </table>
      <p class="muted small">En el futuro robot evasor el sensor ultrasónico necesitará D7 y D8, así que allí los motores usarán otro reparto (IN1 D${PIN_MAPS.robot[0].in1}, IN2 D${PIN_MAPS.robot[0].in2}, IN3 D${PIN_MAPS.robot[1].in1}, IN4 D${PIN_MAPS.robot[1].in2}). Con constantes con nombre solo cambiarás seis números.</p>
      ${question('¿Por qué ENA y ENB van a D5 y D6 y no, por ejemplo, a D4 y D2?', 'Porque la velocidad se regula con PWM y solo D3, D5, D6, D9, D10 y D11 lo tienen. D4 y D2 sirven para el sentido, que solo necesita HIGH o LOW.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'funciones',
    short: 'Funciones',
    title: 'Funciones con parámetros',
    html: `
      <p>Una <strong>función</strong> agrupa órdenes con un nombre: <code>avanzar(200)</code> se lee mejor que seis líneas de pines. Los <strong>parámetros</strong> (entre paréntesis) hacen que sirva para distintos valores.</p>
      ${example('parametros')}
      ${example('motor')}
      ${question('En el código inicial, parar() pone ENA y ENB en 0. ¿Qué orden recibe cada motor y qué hace el eje?', 'Rueda libre: el puente desconecta los motores, que siguen girando por inercia hasta detenerse (en el modelo, alrededor de 1 s). Para frenar, deja IN1 = IN2 con ENA activo.')}`,
  },
  {
    id: 'diferencial',
    short: 'Tracción diferencial',
    title: 'Girar sin volante',
    html: `
      <p>Un robot con dos ruedas motrices gira haciendo que cada rueda vaya a distinta velocidad o en distinto sentido: es la <strong>tracción diferencial</strong>.</p>
      <table class="conn-table">
        <caption class="sr-only">Maniobras de tracción diferencial</caption>
        <thead><tr><th scope="col">Maniobra</th><th scope="col">Motor izquierdo</th><th scope="col">Motor derecho</th></tr></thead>
        <tbody>${ROWS.map(([m, l, r]) => `<tr><td>${m}</td><td>${l}</td><td>${r}</td></tr>`).join('')}</tbody>
      </table>
      ${question('Si solo gira el motor izquierdo y el derecho está parado, ¿el robot gira?', 'Sí, pero sobre la rueda parada, describiendo un círculo más amplio. El reto pide girar sobre sí mismo: ruedas en sentidos opuestos.')}`,
  },
  {
    id: 'anunciar',
    short: 'Anunciar',
    title: 'Anunciar cada maniobra',
    html: `
      <p>Escribe una línea por el monitor serie <strong>al empezar</strong> cada maniobra, antes de su <code>delay()</code>. Así sabrás qué hace el robot en cada momento. Recuerda <code>Serial.begin(9600)</code> en <code>setup()</code>.</p>
      <p>El recorrido se hace una vez: ponlo en <code>setup()</code> y deja <code>loop()</code> vacío, o usa una variable para no repetirlo.</p>
      <p>Al girar, el motor derecho pasa de adelante a atrás. El simulador avisa si inviertes con el eje girando: el reto lo admite, pero puedes intercalar una parada breve (hasta 0,2&nbsp;s) con freno para cuidar el motor.</p>
      <p>Lo que mide la comprobación son las <strong>órdenes</strong> de cada canal (avanzar, girar, parar). La lectura «Motor» muestra además cómo responde cada eje, con su inercia.</p>
      ${question('Con analogWrite(ENA, 60), ¿avanza el robot?', `No: ${Math.round(60 / 2.55)} % está por debajo de la zona muerta del modelo (${Math.round(MOTOR.deadZone * 100)} %) y el motor no gira, aunque la orden sea «adelante». Usa valores de 150 a 255.`)}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <ol>
        <li>Completa las funciones (añade el giro a la derecha) y los mensajes.</li>
        <li>Encadena las maniobras con sus tiempos.</li>
        <li>Ejecuta, observa los dos motores y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${String(DOS.durationMs / 1000).replace('.', ',')} segundos simulados y mide las órdenes de los dos canales del L298N, la respuesta de los motores modelados y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'controlar dos motores con los dos canales del L298N, organizar el programa en funciones con parámetros y combinar sentidos para avanzar y girar (tracción diferencial).';

export const SCOPE = [
  ...SCOPE_COMMON,
  `El L298N y los dos motores son el mismo modelo de las lecciones 9 y 10, con un canal por motor: órdenes según el nivel real de D7, D8, D4 y D2 y el PWM real de D5 y D6 (zona muerta ${Math.round(MOTOR.deadZone * 100)} %, inercia).`,
  'Los motores no están montados en un robot: no hay ruedas, suelo ni obstáculos. El robot evasor en un mundo simulado llegará en una fase posterior.',
  'La batería y el GND común se representan en el diagrama; no se simulan tensiones ni corrientes.',
  'Todavía no: servos, robot completo ni librerías adicionales.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'los dos canales', hints: [
    'Cada motor tiene su sentido (dos IN) y su velocidad (un EN con PWM).',
    'Motor izquierdo: D7, D8 y D5. Motor derecho: D4, D2 y D6.',
  ] },
  'paso-1': { label: 'las funciones', hints: [
    'Una función con parámetros sirve para varios casos: avanzar(200), avanzar(150)…',
    'Prueba el ejemplo del motor izquierdo y luego escribe una función parecida para el derecho.',
  ] },
  'paso-2': { label: 'la tracción diferencial', hints: [
    'Para girar sobre sí mismo, cada rueda va en un sentido.',
    'Girar a la derecha: motor izquierdo adelante y motor derecho atrás.',
  ] },
  'paso-3': { label: 'los mensajes', hints: [
    'Cada maniobra se anuncia justo al empezar.',
    'Serial.begin(9600) en setup() y un Serial.println(…) al principio de cada maniobra.',
  ] },
  compilar: COMPILE_TOPIC,
  pinmode: { label: 'las salidas', hints: [
    'Los cuatro pines de sentido deben ser salidas.',
    'pinMode(…, OUTPUT) para D7, D8, D4 y D2. ENA y ENB se configuran solos con analogWrite.',
  ] },
  habilitar: { label: 'la habilitación', hints: [
    'Un canal con EN en 0 no mueve su motor.',
    'Usa analogWrite en ENA (D5) y en ENB (D6) con valores por encima de la zona muerta (por ejemplo, 200).',
  ] },
  giro: { label: 'el giro', hints: [
    'Falta la maniobra de girar a la derecha.',
    'Escribe una función como avanzar(), pero con el motor derecho hacia atrás (IN3 LOW, IN4 HIGH).',
  ] },
  maniobras: { label: 'el orden de las maniobras', hints: [
    'Mira el detalle: dice qué maniobra se midió y cuál tocaba.',
    'Si giró a la izquierda, intercambia los sentidos de los dos motores en el giro. Si un motor va al revés al avanzar, revisa sus dos IN.',
  ] },
  tiempos: { label: 'los tiempos', hints: [
    'Cada maniobra dura lo que su delay().',
    'Avanzar 1000 ms, girar 600 ms y avanzar 1000 ms; después, parar sin volver a empezar.',
  ] },
  velocidad: { label: 'la velocidad', hints: [
    'Un motor no llegó a girar.',
    'Con valores bajos de ENA o ENB el motor no vence la zona muerta: usa 150–255.',
  ] },
  mensajes: { label: 'los anuncios', hints: [
    'Cada maniobra necesita su línea en el monitor serie.',
    'Escribe el mensaje dentro de cada función, antes de cambiar los pines, y usa las palabras «Avanzar», «Derecha» y «Parar».',
  ] },
  baud: { label: 'el monitor serie', hints: [
    'El monitor serie necesita Serial.begin(…) en setup().',
    'El reto pide 9600 baudios.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a cambiar el reparto de pines por el del futuro robot evasor: solo cambian las constantes.',
    'Otra idea: haz que parar() frene (IN1 = IN2 con EN activo) y compara cuánto tardan los ejes en detenerse.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if ((src.match(/pinMode\s*\([^)]*OUTPUT/g) || []).length < 4) return { topic: 'pinmode', facts };
  if ((src.match(/analogWrite\s*\(/g) || []).length < 2) return { topic: 'habilitar', facts };
  if (!/derech|giro|girar/i.test(src)) return { topic: 'giro', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  if (!/Serial\s*\.\s*print/.test(src)) return { topic: 'mensajes', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { salidas: 'pinmode', maniobras: 'maniobras', tiempos: 'tiempos', motores: 'velocidad', mensajes: 'mensajes', baud: 'baud' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    if ((failed.id === 'salidas' || failed.id === 'maniobras') && /nunca se activó|deshabilitado/.test(failed.detail || '')) return { topic: 'habilitar', facts: analysis.facts };
    if (CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  salidas: ['El detalle dice qué pin no recibe señal.',
    'pinMode(…, OUTPUT) para los cuatro IN y analogWrite para ENA y ENB.'],
  maniobras: ['El detalle compara la maniobra medida con la que tocaba.',
    'Girar a la derecha: izquierdo adelante, derecho atrás. Al avanzar, los dos adelante.'],
  tiempos: ['El detalle dice cuánto duró la maniobra que no encaja.',
    'Avanzar 1000 ms, girar 600 ms, avanzar 1000 ms y parar sin repetir.'],
  motores: ['Un motor no alcanzó su velocidad: revisa el valor de su EN.',
    'Por debajo del 30 % (≈ 77) el motor modelado no vence la zona muerta.'],
  mensajes: ['Cada maniobra necesita su anuncio al empezar.',
    'Pon el Serial.println(…) al principio de cada función de maniobra.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy moverás dos motores con el L298N completo y harás un recorrido con giro. Pulsa Ejecutar y mira los dos motores bajo el circuito. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el L298N usa D7, D8, D4 y D2 para el sentido y D5 y D6 para la velocidad.`,
  evalPass: '¡Reto superado! Los dos motores avanzaron, giraron a la derecha en sentidos opuestos, volvieron a avanzar y pararon, con cada maniobra anunciada a tiempo. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 11,
  tema: 'Puente H L298N y motores',
  titulo: 'Dos motores y maniobras',
  corto: 'Dos motores',
  kicker: 'Lección 11 · Motores',
  previas: ['arduino-l298n-velocidad'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root) => createMotorCircuit(root, { channels: DOS_PINS }),
  pins: [A.in1, A.in2, B.in1, B.in2, A.en, B.en],
  motors: { channels: DOS_PINS },
  evaluation: {
    durationMs: DOS.durationMs,
    evaluate: evaluateDosMotores,
    stimulus: { motors: { channels: DOS_PINS } },
    note: 'La comprobación ejecuta tu programa 4,2 segundos simulados y mide las órdenes de los dos canales del L298N (D7, D8, D4, D2, D5 y D6), la respuesta de los motores modelados y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
