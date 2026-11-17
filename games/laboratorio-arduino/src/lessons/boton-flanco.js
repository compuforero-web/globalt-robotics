// Lección 5 · Tema 2: flancos y antirrebote (2.3 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el guion de 6 pulsaciones con rebotes se aplica al modelo del pulsador con
// precisión de ciclo y se miden D13 y el monitor serie (boton-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateFlanco, FLANCO, BUTTON_PIN } from './boton-eval.js';
import { createButtonCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-boton-flanco';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 5: contar pulsaciones
// Pulsador entre D2 y GND (INPUT_PULLUP) y LED con 220 Ω en D13.
// Práctica: este contador detecta el flanco, pero aún no filtra el rebote.

const int BOTON = 2;
const int LED = 13;
int anterior = HIGH;
int pulsaciones = 0;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(BOTON);
  if (anterior == HIGH && lectura == LOW) {   // flanco: de suelto a pulsado
    pulsaciones++;
    Serial.print("Contadas: ");
    Serial.println(pulsaciones);
  }
  anterior = lectura;
}
`;

export const EXAMPLES = {
  'millis-sin-bloquear': {
    title: 'Esperar sin bloquear con millis()',
    code: `// Ejemplo: parpadeo con millis(). loop() nunca se detiene,
// así que podría leer un botón a la vez.
const int LED = 13;
unsigned long ultimoCambio = 0;
int estado = LOW;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  if (millis() - ultimoCambio >= 300) {
    ultimoCambio = millis();
    estado = (estado == LOW) ? HIGH : LOW;
    digitalWrite(LED, estado);
  }
}
`,
  },
  duracion: {
    title: 'Medir cuánto dura una pulsación',
    code: `// Ejemplo: guarda el instante del flanco de bajada y, al soltar, escribe la duración.
// Sin antirrebote, cada rebote también cuenta como flanco: observa los valores diminutos.
const int BOTON = 2;
int anterior = HIGH;
unsigned long inicio = 0;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(BOTON);
  if (anterior == HIGH && lectura == LOW) inicio = millis();
  if (anterior == LOW && lectura == HIGH) {
    Serial.print("Pulsado durante ");
    Serial.print(millis() - inicio);
    Serial.println(" ms");
  }
  anterior = lectura;
}
`,
  },
};

const BOUNCES = FLANCO.presses.map((p) => p.bouncesDown);

export const CHALLENGE = {
  title: 'Reto: contar sin rebotes',
  summary: 'Cada pulsación del botón alterna el LED de D13 (encendido ↔ apagado) y escribe «Pulsaciones: N» con la cuenta total. El pulsador rebota como uno real: tu programa debe contar cada pulsación una sola vez.',
  criteria: [
    'D2 se configura como entrada con INPUT_PULLUP.',
    'Con las 6 pulsaciones del guion se escriben exactamente «Pulsaciones: 1» … «Pulsaciones: 6», en orden.',
    'El LED de D13 cambia exactamente 6 veces: una por pulsación (no al soltar).',
    'Cada respuesta (LED y mensaje) llega en 60 ms como máximo desde que el contacto deja de rebotar.',
    'El monitor serie funciona a 9600 baudios.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'flanco',
    short: 'Flancos',
    title: 'Estado y flanco',
    html: `
      <p>El <strong>estado</strong> del botón es cómo está ahora (pulsado o suelto). Un <strong>flanco</strong> es el instante en que cambia. Para contar pulsaciones no sirve el estado: mientras lo mantienes apretado, <code>loop()</code> lo leería pulsado miles de veces.</p>
      <p>Con <code>INPUT_PULLUP</code>, pulsar produce un <strong>flanco de bajada</strong> (de HIGH a LOW) y soltar, uno de subida.</p>
      <p>El código inicial detecta el flanco de bajada comparando la lectura con la anterior.</p>
      ${question('Mantienes el botón pulsado 2 segundos. ¿Cuántas veces cuenta el código inicial, si el botón no rebotara?', 'Una sola: solo cuenta cuando la lectura anterior era HIGH y la nueva LOW, y eso pasa una vez por pulsación.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'rebote',
    short: 'Rebote',
    title: 'El rebote mecánico',
    html: `
      <p>Las láminas metálicas de un pulsador real <strong>rebotan</strong> al chocar: durante unos milisegundos el contacto se abre y se cierra varias veces antes de quedarse quieto. El Arduino lee miles de veces por milisegundo y ve cada rebote como un flanco.</p>
      <p>En esta lección el pulsador del simulador rebota de 3 a 8 veces al pulsar y al soltar, con tramos de 0,2 a 2&nbsp;ms. Ejecuta el código inicial, pulsa el botón unas cuantas veces y compara tu cuenta con la del monitor.</p>
      ${question('¿Por qué el código inicial cuenta de más incluso al soltar?', 'Porque al soltar el contacto también rebota: se cierra un instante y vuelve a abrirse. Cada cierre es un flanco de HIGH a LOW, igual que una pulsación.')}
      ${goTo('#sim-panel', 'Ir a la simulación')}`,
  },
  {
    id: 'millis',
    short: 'millis()',
    title: 'Medir el tiempo sin detenerse',
    html: `
      <p><code>millis()</code> devuelve los milisegundos desde que arrancó la placa. Restando dos instantes sabes cuánto tiempo pasó <strong>sin bloquear</strong> el programa, al contrario que <code>delay()</code>, que lo detiene.</p>
      ${example('millis-sin-bloquear')}
      ${example('duracion')}
      ${question('¿Por qué conviene guardar los instantes en variables unsigned long?', 'Porque millis() devuelve un unsigned long: en un int (16 bits en el Nano) se desbordaría a los 32 segundos.')}`,
  },
  {
    id: 'antirrebote',
    short: 'Antirrebote',
    title: 'Antirrebote por tiempo',
    html: `
      <p>Una forma de filtrar el rebote: cada vez que la lectura cambia, apunta el instante con <code>millis()</code>. Solo das por bueno el nuevo estado cuando lleva <strong>un tiempo estable</strong> sin cambiar (por ejemplo, 20–50&nbsp;ms). Entonces sí miras si fue una pulsación.</p>
      <ol>
        <li>Lectura distinta de la anterior → reinicia el cronómetro.</li>
        <li>Si el cronómetro supera la espera y el estado aceptado es distinto de la lectura → acepta el nuevo estado.</li>
        <li>Si el estado aceptado acaba de pasar a LOW → es una pulsación: cuenta y alterna el LED.</li>
      </ol>
      ${question('¿Qué pasa si la espera de antirrebote es de 300 ms?', 'Filtraría el rebote, pero respondería tarde y podría perder pulsaciones cortas: el reto pide responder en 60 ms desde que el contacto deja de rebotar.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>La comprobación aplica siempre el mismo <strong>guion de 6 pulsaciones con rebotes</strong> (${BOUNCES.join(', ')} rebotes al pulsar, y otros tantos al soltar). Puedes verlo en tiempo real con «Reproducir guion del reto», bajo el circuito.</p>
      <ol>
        <li>Añade el antirrebote por tiempo al detector de flancos.</li>
        <li>En cada pulsación aceptada, alterna el LED y escribe la cuenta.</li>
        <li>Pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta 5,5 segundos simulados con el guion y mide D13 y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'detectar flancos de un pulsador, entender el rebote mecánico y filtrarlo con millis() sin detener el programa.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'El pulsador es un modelo eléctrico que rebota: al pulsar y al soltar, el contacto se abre y se cierra de 3 a 8 veces (0,2–2 ms cada tramo) en el microcontrolador emulado.',
  'La comprobación aplica un guion fijo de 6 pulsaciones con rebotes, con precisión de ciclo de reloj, siempre igual.',
  'Todavía no: interrupciones externas (attachInterrupt) no forman parte de esta lección; analogRead, servos y librerías adicionales tampoco.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'los flancos', hints: [
    'Un flanco es el cambio: la lectura anterior y la nueva son distintas.',
    'Con INPUT_PULLUP, una pulsación empieza con un flanco de HIGH a LOW.',
  ] },
  'paso-1': { label: 'el rebote', hints: [
    'Ejecuta el código inicial y pulsa 5 veces: ¿cuántas cuenta el monitor?',
    'Cada rebote produce flancos extra, también al soltar.',
  ] },
  'paso-2': { label: 'millis()', hints: [
    'millis() - instante_guardado te dice cuántos milisegundos pasaron, sin detener loop().',
    'Prueba el ejemplo «Esperar sin bloquear con millis()».',
  ] },
  'paso-3': { label: 'el antirrebote', hints: [
    'Apunta el instante en que la lectura cambió por última vez.',
    'Solo aceptas un estado nuevo cuando ha estado estable más tiempo que la espera de antirrebote.',
  ] },
  compilar: COMPILE_TOPIC,
  pullup: { label: 'el modo del pin', hints: [
    'D2 necesita INPUT_PULLUP: sin resistencia, con el botón suelto, el pin flota.',
    'Revisa el pinMode del botón en setup().',
  ] },
  baud: { label: 'el monitor serie', hints: [
    'El monitor serie necesita Serial.begin(…) en setup().',
    'El reto pide 9600 baudios.',
  ] },
  texto: { label: 'el mensaje', hints: [
    'Cada pulsación debe escribir una línea «Pulsaciones: N».',
    'Escribe el texto con Serial.print(…) y el número con Serial.println(…).',
  ] },
  antirrebote: { label: 'el antirrebote', hints: [
    'Tu programa cuenta los rebotes como pulsaciones.',
    'Guarda con millis() el instante del último cambio de lectura y acepta el estado solo cuando lleve estable unos 20–50 ms.',
    'Compara el estado aceptado (no la lectura cruda) con el anterior para detectar la pulsación.',
  ] },
  lento: { label: 'la velocidad de respuesta', hints: [
    'El LED o el mensaje llegan demasiado tarde.',
    'Usa una espera de antirrebote corta (20–50 ms) y evita delay() en loop().',
  ] },
  soltar: { label: 'pulsar o soltar', hints: [
    'Tu programa reacciona al soltar el botón.',
    'Con INPUT_PULLUP, pulsar es pasar de HIGH a LOW: cuenta en ese flanco.',
  ] },
  led: { label: 'el LED', hints: [
    'El LED debe cambiar en cada pulsación: si estaba apagado se enciende, y al revés.',
    'Guarda el estado del LED en una variable, inviértelo en cada pulsación y escríbelo con digitalWrite.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a distinguir una pulsación corta de una larga (más de 1 s).',
    'Otra idea: haz que dos pulsaciones rápidas seguidas («doble clic») hagan algo distinto.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const facts = {};
  if (!/INPUT_PULLUP/.test(src)) return { topic: 'pullup', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  const strings = [...String(code).matchAll(/"([^"\\]|\\.)*"/g)].map((m) => m[0].toLowerCase()).join(' ');
  if (!strings.includes('pulsaciones')) return { topic: 'texto', facts };
  if (!/millis\s*\(/.test(src)) return { topic: 'antirrebote', facts };
  if (!/digitalWrite\s*\(/.test(src)) return { topic: 'led', facts };
  return { topic: 'comprobar', facts };
}

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    if (failed.id === 'entrada') return { topic: 'pullup', facts: {} };
    if (failed.id === 'baud') return { topic: 'baud', facts: {} };
    if (failed.id === 'respuesta') return { topic: /al soltar/.test(failed.detail || '') ? 'soltar' : 'lento', facts: {} };
    if (failed.id === 'cuenta' && /pulsación no se detectó/.test(failed.detail || '')) return { topic: 'lento', facts: {} };
    if (failed.id === 'led' && !ctx.lastChecks.some((c) => c.id === 'cuenta' && !c.ok)) return { topic: 'led', facts: {} };
    return { topic: 'antirrebote', facts: {} };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  entrada: ['Mira el detalle: indica en qué modo estaba D2. El reto pide INPUT_PULLUP.',
    'Sin pull-up, con el botón suelto, D2 lee ruido y la cuenta se dispara.'],
  cuenta: ['Compara la cuenta escrita con las 6 pulsaciones: si sobran, los rebotes se cuelan; si faltan, la espera es demasiado larga.',
    'El antirrebote debe aceptar un estado solo cuando lleve unos milisegundos sin cambiar.'],
  led: ['El LED debe alternar una vez por pulsación aceptada, en el mismo sitio donde aumentas la cuenta.',
    'Si alterna más veces, también lo mueven los rebotes.'],
  respuesta: ['El detalle indica en qué pulsación llegó tarde la respuesta o si reaccionas al soltar.',
    'Usa una espera de antirrebote de 20–50 ms y no uses delay() largos en loop().'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy contarás pulsaciones con un botón que rebota como uno real. Ejecuta el código inicial, pulsa unas cuantas veces y compara tu cuenta con la del monitor. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el LED está en D13 y el pulsador en D2.`,
  evalPass: '¡Reto superado! Con 6 pulsaciones llenas de rebotes, contaste exactamente 6, el LED alternó 6 veces y respondiste a tiempo. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 5,
  tema: 'Entradas, salidas y PWM',
  titulo: 'Flancos y antirrebote: contar pulsaciones',
  corto: 'Flancos y antirrebote',
  kicker: 'Lección 5 · Entradas',
  previas: ['arduino-boton-entrada'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root, opts) => createButtonCircuit(root, { ...opts, bounce: true }),
  pins: [13],
  button: { pin: BUTTON_PIN, seed: 23, bounce: true },
  evaluation: {
    durationMs: FLANCO.durationMs,
    evaluate: evaluateFlanco,
    stimulus: { button: { pin: BUTTON_PIN, seed: 23 }, script: FLANCO.events },
    note: 'La comprobación ejecuta tu programa 5,5 segundos simulados con un guion fijo de 6 pulsaciones con rebotes en D2 y mide el LED de D13 y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
