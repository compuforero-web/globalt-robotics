// Lección 2 · Tema 1: protoboard y varias salidas digitales (semáforo). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba, con la medición de D2/D3/D4 y del monitor serie (semaforo-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateSemaforo, EVAL_DURATION_MS } from './semaforo-eval.js';
import { createSemaforoCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-protoboard-semaforo';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 2: semáforo en la protoboard
// LED verde en D2, amarillo en D3 y rojo en D4, cada uno con su resistencia de 220 Ω.

const int LED_VERDE = 2;
const int LED_AMARILLO = 3;
const int LED_ROJO = 4;

void setup() {
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);
  Serial.begin(9600);
  Serial.println("Semaforo listo");
}

void loop() {
  // Por ahora solo se enciende el verde. Completa el ciclo del semáforo.
  digitalWrite(LED_VERDE, HIGH);
  Serial.println("Verde");
  delay(3000);
  digitalWrite(LED_VERDE, LOW);
  delay(1000);
}
`;

export const EXAMPLES = {
  'prueba-leds': {
    title: 'Probar cada LED por separado',
    code: `// Ejemplo: enciende cada LED un momento, de uno en uno, y lo anuncia.
const int PINES[] = {4, 3, 2};               // rojo, amarillo, verde
const char *NOMBRES[] = {"rojo", "amarillo", "verde"};

void setup() {
  for (int i = 0; i < 3; i++) pinMode(PINES[i], OUTPUT);
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 3; i++) {
    Serial.print("Probando ");
    Serial.println(NOMBRES[i]);
    digitalWrite(PINES[i], HIGH);
    delay(300);
    digitalWrite(PINES[i], LOW);
  }
  delay(700);
}
`,
  },
  'mensaje-al-cambiar': {
    title: 'El mensaje sale al cambiar',
    code: `// Ejemplo: la línea se escribe en el mismo instante en que cambia el LED.
const int LED = 2;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED, HIGH);
  Serial.println("encendido");   // justo después del cambio, antes de esperar
  delay(500);
  digitalWrite(LED, LOW);
  Serial.println("apagado");
  delay(500);
}
`,
  },
};

export const CHALLENGE = {
  title: 'Reto: el semáforo',
  summary: 'Programa un semáforo que se repita sin fin: verde 3 s, amarillo 1 s y rojo 3 s. Cada vez que cambie de luz, el monitor serie debe decir qué color se encendió.',
  criteria: [
    'Los LED siguen el orden verde (D2) → amarillo (D3) → rojo (D4) y lo repiten: al menos dos ciclos completos en 17 segundos.',
    'Verde y rojo duran 3 s; amarillo, 1 s (±10 %).',
    'Nunca hay dos LED encendidos a la vez (se toleran 20 ms en el cambio).',
    'El monitor serie funciona a 9600 baudios.',
    'En cada cambio se escribe una línea con el color que se enciende («verde», «amarillo» o «rojo»), a menos de 100 ms del cambio y una sola por fase.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'protoboard',
    short: 'Protoboard',
    title: 'Conocer la protoboard',
    html: `
      <p>La <strong>protoboard</strong> permite montar circuitos sin soldar. Por dentro, los agujeros de cada fila corta (normalmente 5) están unidos; el canal del centro separa las dos mitades. Los <strong>rieles</strong> largos de los bordes se usan para repartir GND (−) y alimentación (+).</p>
      <p>Cada LED lleva <strong>su propia resistencia</strong> de 220&nbsp;Ω: así cada color recibe una corriente segura (unos 14&nbsp;mA) aunque se encienda solo.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del semáforo</caption>
        <thead><tr><th scope="col">Pin del Nano</th><th scope="col">Recorrido</th><th scope="col">Color</th></tr></thead>
        <tbody>
          <tr><td>D2</td><td>220&nbsp;Ω → ánodo del LED → cátodo al riel GND</td><td>Verde</td></tr>
          <tr><td>D3</td><td>220&nbsp;Ω → ánodo del LED → cátodo al riel GND</td><td>Amarillo</td></tr>
          <tr><td>D4</td><td>220&nbsp;Ω → ánodo del LED → cátodo al riel GND</td><td>Rojo</td></tr>
          <tr><td>GND</td><td>Al riel GND de la protoboard</td><td>Retorno común</td></tr>
        </tbody>
      </table>
      <p class="muted small">El simulador usa este cableado fijo: no comprueba un montaje físico. Si lo montas de verdad, revisa cada fila antes de conectar el USB.</p>
      ${question('Pones las dos patas de un LED en la misma fila de 5 agujeros. ¿Qué pasa?', 'Las dos patas quedan unidas por la protoboard: el LED queda en cortocircuito y no se enciende. Cada pata debe ir a una fila distinta.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'salidas',
    short: 'Varias salidas',
    title: 'Controlar varias salidas',
    html: `
      <p>Cada LED está en un pin distinto, así que cada uno necesita su <code>pinMode(pin, OUTPUT)</code> en <code>setup()</code> y su propio <code>digitalWrite</code>.</p>
      <p>Dar <strong>nombre</strong> a los pines con constantes (<code>const int LED_VERDE = 2;</code>) hace el programa más fácil de leer y evita confundir el 2, el 3 y el 4.</p>
      ${example('prueba-leds')}
      ${question('En el ejemplo, ¿en qué orden se encienden los LED y cuánto tarda en repetirse la vuelta?', 'Rojo, amarillo y verde, 300 ms cada uno; con la pausa de 700 ms, la vuelta completa dura 3 × 300 + 700 = 1600 ms.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'tiempos',
    short: 'Planificar',
    title: 'Planificar el ciclo',
    html: `
      <p>Un semáforo es una secuencia de <strong>fases</strong>: en cada fase hay una sola luz encendida durante un tiempo fijo, y después llega la siguiente.</p>
      <table class="conn-table">
        <caption class="sr-only">Fases del semáforo</caption>
        <thead><tr><th scope="col">Fase</th><th scope="col">Luz</th><th scope="col">Duración</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Verde (D2)</td><td>3 s</td></tr>
          <tr><td>2</td><td>Amarillo (D3)</td><td>1 s</td></tr>
          <tr><td>3</td><td>Rojo (D4)</td><td>3 s</td></tr>
        </tbody>
      </table>
      <p>Al cambiar de fase, <strong>apaga primero</strong> la luz anterior y <strong>después</strong> enciende la nueva: en un semáforo real nunca se ven dos luces a la vez.</p>
      ${question('¿Cuánto dura un ciclo completo y cuántas veces empieza el verde en 17 segundos?', 'Un ciclo dura 3 + 1 + 3 = 7 s. Si empieza en verde, el verde arranca a los 0, 7 y 14 s: tres veces (la última fase queda a medias).')}`,
  },
  {
    id: 'mensajes',
    short: 'Mensajes',
    title: 'Avisar cada cambio',
    html: `
      <p>El monitor serie sirve para saber qué hace el programa. En este reto, cada fase escribe <strong>una línea con su color</strong> en el mismo momento en que cambia la luz.</p>
      <p>Si escribes el mensaje después del <code>delay()</code>, saldrá al <em>final</em> de la fase y no al principio.</p>
      ${example('mensaje-al-cambiar')}
      <p class="muted small">Escribe los mensajes sin tildes ni eñes: el monitor muestra cada byte por separado y esas letras ocupan dos.</p>
      ${question('Enviar «amarillo» a 9600 baudios tarda unos 10 ms. ¿Alarga eso la fase amarilla?', 'Casi nada: Serial guarda el texto en un búfer y lo envía mientras tu programa sigue con la espera. Aunque esperara esos 10 ms, sería un 1 % de 1000 ms, dentro de la tolerancia del ±10 %.')}
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
        <li>Haz que las tres luces se turnen en el orden correcto.</li>
        <li>Ajusta los tiempos de cada fase.</li>
        <li>Añade el mensaje de cada cambio y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta 17 segundos simulados y mide los LED de D2, D3 y D4 y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'montar un semáforo en la protoboard con tres LED que se turnan con tiempos exactos y avisan de cada cambio por el monitor serie.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'Funciona: varios pines digitales a la vez, temporizadores (delay, millis, micros) y Serial (print, println, write).',
  'El circuito es fijo (LED verde en D2, amarillo en D3 y rojo en D4): no hay editor de cableado y no se evalúa un montaje físico.',
  'Todavía no: entradas externas (botones, sensores), analogRead, servos ni librerías adicionales.',
];

// ---------- Guía Chispa: pistas progresivas; nunca entregan el código del reto ----------
const TOPICS = {
  'paso-0': { label: 'la protoboard', hints: [
    'En la protoboard, los agujeros de cada fila corta están unidos por dentro; las dos mitades del canal central no se tocan.',
    'Sigue el recorrido de cada color en el circuito: pin → resistencia → LED → riel de GND.',
  ] },
  'paso-1': { label: 'varias salidas', hints: [
    'Tres LED, tres pines: cada uno necesita su pinMode(…, OUTPUT) en setup().',
    'Prueba el ejemplo «Probar cada LED por separado» y comprueba que se enciende cada color.',
  ] },
  'paso-2': { label: 'el plan del ciclo', hints: [
    'Escribe el ciclo en un papel: qué luz se enciende, cuánto dura y cuál va después.',
    'Al cambiar de fase, apaga primero la luz anterior y después enciende la nueva.',
  ] },
  'paso-3': { label: 'los mensajes', hints: [
    'El mensaje debe salir en el momento en que cambia la luz, no al final de la fase.',
    'Ejecuta el ejemplo «El mensaje sale al cambiar» y mira cuándo aparece cada línea.',
  ] },
  compilar: COMPILE_TOPIC,
  pines: { label: 'los pines de salida', hints: [
    'Los LED están en D2, D3 y D4, y cada uno necesita su pinMode(…, OUTPUT) en setup().',
    'Si usas constantes para los pines, comprueba sus valores: verde 2, amarillo 3, rojo 4.',
  ] },
  baud: { label: 'el monitor serie', hints: [
    'El monitor serie necesita que el programa lo abra en setup().',
    'Usa Serial.begin(…) con la velocidad que pide el reto: 9600.',
  ] },
  mensajes: { label: 'los mensajes de color', hints: [
    'Cada fase debe escribir una línea con su color: «verde», «amarillo» o «rojo».',
    'Escribe el nombre del color con Serial.println(…) justo cuando se enciende su LED.',
  ] },
  orden: { label: 'el orden de las luces', hints: [
    'El orden es verde, después amarillo, después rojo, y vuelta a empezar por el verde.',
    'Mira el detalle de la comprobación: indica en qué cambio se rompió el orden.',
  ] },
  tiempos: { label: 'los tiempos', hints: [
    (c) => `Veo estos tiempos en tus delay(): ${c.delays?.join(', ') || 'ninguno'} ms. ¿Cuánto dura cada color?`,
    'Verde y rojo duran lo mismo; amarillo dura un tercio de eso.',
    'Mira el detalle de la comprobación: muestra cuánto duró cada fase medida en la simulación.',
  ] },
  solape: { label: 'las luces a la vez', hints: [
    'En algún momento hay dos LED encendidos a la vez.',
    'Apaga la luz de la fase anterior (LOW) antes de encender la siguiente (HIGH).',
  ] },
  momento: { label: 'el momento del mensaje', hints: [
    'Cada línea debe salir al empezar su fase, no al terminarla.',
    'Coloca el Serial.println(…) justo después del digitalWrite(…, HIGH) y antes de la espera.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a añadir una fase de «verde parpadeante» antes del amarillo.',
    'Otra idea: reescribe el semáforo con millis() en lugar de delay() para que el programa pueda hacer otras cosas a la vez.',
  ] },
};

const COLORS = ['verde', 'amarillo', 'rojo'];
const CHECK_TOPIC = { orden: 'orden', tiempos: 'tiempos', solape: 'solape', baud: 'baud', serial: 'momento' };

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const strings = [...String(code).matchAll(/"([^"\\]|\\.)*"/g)].map((m) => m[0].toLowerCase()).join(' ');
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  const outputs = (src.match(/pinMode\s*\([^,]+,\s*OUTPUT\s*\)/g) || []).length;
  if (outputs < 3 && !/for\s*\([^)]*\)[^;]*pinMode/.test(src)) return { topic: 'pines', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  if (!COLORS.every((c) => strings.includes(c))) return { topic: 'mensajes', facts };
  const flexible = /millis\s*\(/.test(src) || /delay\s*\(\s*[A-Za-z_]/.test(src);
  if (!flexible && !(delays.includes(3000) && delays.includes(1000))) return { topic: 'tiempos', facts };
  return { topic: 'comprobar', facts };
}

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  // Lo medido manda sobre la estimación de tiempos a partir de los delay() del texto.
  if (failed && CHECK_TOPIC[failed.id] && ['comprobar', 'tiempos'].includes(analysis.topic)) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  orden: ['El orden debe ser verde → amarillo → rojo y repetirse. Comprueba también que cada LED esté en su pin: verde D2, amarillo D3, rojo D4.',
    'Mira el detalle: indica el primer cambio que no sigue el orden.'],
  tiempos: ['Compara las duraciones medidas con las del reto: verde y rojo 3 s, amarillo 1 s.',
    'Si dos esperas seguidas afectan a la misma luz, súmalas.'],
  solape: ['Hay dos luces encendidas a la vez durante demasiado tiempo. Apaga la anterior antes de encender la siguiente.',
    'Revisa el orden de los digitalWrite(…) en cada cambio de fase: primero LOW, después HIGH.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
  serial: ['Cada fase necesita una línea con su color, escrita justo al cambiar de luz y una sola vez.',
    'Mira el monitor serie al ejecutar: ¿aparece el color al encenderse su LED o al apagarse?'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy montarás un semáforo en la protoboard: tres LED que se turnan con tiempos exactos y avisan de cada cambio por el monitor serie. Recorre los pasos y pulsa Ejecutar para ver el ejemplo. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero los LED del semáforo están en D2, D3 y D4.`,
  evalPass: '¡Reto superado! Medí dos ciclos completos verde → amarillo → rojo con sus tiempos, sin luces a la vez y con un aviso en cada cambio. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 2,
  tema: 'Arduino Nano y protoboard',
  titulo: 'Protoboard y varias salidas: un semáforo',
  corto: 'Semáforo en la protoboard',
  kicker: 'Lección 2 · Protoboard',
  previas: ['arduino-led-serie'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: createSemaforoCircuit,
  pins: [2, 3, 4],
  evaluation: {
    durationMs: EVAL_DURATION_MS,
    evaluate: evaluateSemaforo,
    note: 'La comprobación ejecuta tu programa 17 segundos simulados y mide los LED de D2, D3 y D4 y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
