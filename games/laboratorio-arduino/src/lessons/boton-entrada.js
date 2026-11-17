// Lección 4 · Tema 2: leer un pulsador (2.2 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: compila, ejecuta el programa con el guion reproducible de pulsaciones aplicado
// al modelo eléctrico del pulsador y mide D13 y el monitor serie (boton-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateEntrada, ENTRADA, BUTTON_PIN } from './boton-eval.js';
import { createButtonCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-boton-entrada';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 4: leer un pulsador
// Pulsador entre D2 y GND (sin resistencia externa) y LED con 220 Ω en D13.

const int BOTON = 2;
const int LED = 13;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);   // resistencia interna: suelto = HIGH
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // Práctica: escribe el estado del botón cada 200 ms.
  int lectura = digitalRead(BOTON);
  Serial.print("D2 = ");
  Serial.println(lectura);
  delay(200);
}
`;

export const EXAMPLES = {
  flotante: {
    title: 'Un pin sin pull-up (flotante)',
    code: `// Ejemplo: D2 como INPUT, sin resistencia. Con el botón suelto, mira qué lee.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println(digitalRead(2));
  delay(100);
}
`,
  },
  'recordar-anterior': {
    title: 'Avisar solo cuando algo cambia',
    code: `// Ejemplo: guarda el valor anterior y escribe solo cuando cambia.
// Aquí lo que cambia es el segundo actual (millis() / 1000), no un botón.
unsigned long anterior = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  unsigned long ahora = millis() / 1000;
  if (ahora != anterior) {
    Serial.print("Nuevo segundo: ");
    Serial.println(ahora);
    anterior = ahora;
  }
}
`,
  },
};

const PRESSES = ENTRADA.presses.map((p) => `${(p.down / 1000).toFixed(2).replace('.', ',')} s (${Math.round(p.up - p.down)} ms)`).join(' · ');

export const CHALLENGE = {
  title: 'Reto: el LED sigue al botón',
  summary: 'Mientras el botón esté pulsado, el LED de D13 se enciende; al soltarlo, se apaga. Además, el monitor serie escribe «Pulsado» o «Suelto» solo en el momento en que el botón cambia.',
  criteria: [
    'D2 se configura como entrada con resistencia de pull-up interna (INPUT_PULLUP).',
    'Con el botón pulsado, D13 está encendido; suelto, apagado. El LED responde en 30 ms como máximo.',
    'El monitor serie funciona a 9600 baudios.',
    'En cada cambio se escribe una sola línea «Pulsado» o «Suelto» (en 50 ms como máximo). Con el botón quieto no se escribe nada (se permite un saludo al arrancar).',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'pulsador',
    short: 'El pulsador',
    title: 'Un pulsador une dos puntos',
    html: `
      <p>Un <strong>pulsador</strong> es un interruptor que solo conduce mientras lo mantienes apretado. En este circuito une <strong>D2 con GND</strong>: pulsado, D2 queda a 0&nbsp;V.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Pin del Nano</th><th scope="col">Recorrido</th></tr></thead>
        <tbody>
          <tr><td>D2</td><td>pulsador → GND (sin resistencia externa)</td></tr>
          <tr><td>D13</td><td>220&nbsp;Ω → ánodo del LED → cátodo a GND</td></tr>
        </tbody>
      </table>
      <p>Pulsa el botón del circuito (con el ratón, el dedo o Espacio) mientras se ejecuta la simulación: el modelo eléctrico del pulsador cambia el nivel de D2 en el microcontrolador emulado.</p>
      ${question('Con el botón suelto, ¿qué une D2 con algún voltaje?', 'Nada: el pulsador está abierto y no hay resistencia externa. Por eso hace falta algo más que fije el nivel de D2 cuando nadie pulsa. Lo verás en el paso siguiente.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'pullup',
    short: 'INPUT_PULLUP',
    title: 'INPUT o INPUT_PULLUP',
    html: `
      <p>Con <code>pinMode(pin, INPUT)</code> el pin solo escucha. Si nada lo conecta a 5&nbsp;V ni a GND, queda <strong>flotante</strong>: capta ruido y <code>digitalRead</code> devuelve 0 o 1 al azar.</p>
      <p>Con <code>pinMode(pin, INPUT_PULLUP)</code> el microcontrolador conecta por dentro una resistencia de unos 30–50&nbsp;kΩ a 5&nbsp;V. Así, con el botón suelto, D2 lee <strong>HIGH</strong>; al pulsar, el botón lo une a GND y lee <strong>LOW</strong>.</p>
      ${example('flotante')}
      ${question('Ejecuta el ejemplo sin pulsar nada. ¿Por qué cambian los números?', 'Porque D2 está flotante: sin pull-up ni conexión, su nivel depende del ruido. En el simulador ese ruido se modela con cambios al azar cada pocos milisegundos (siempre los mismos para que sea reproducible).')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'logica',
    short: 'Lógica invertida',
    title: 'Pulsado es LOW',
    html: `
      <p>Con pull-up la lógica queda <strong>invertida</strong>: el botón pulsado se lee como <code>LOW</code> y suelto como <code>HIGH</code>.</p>
      <table class="conn-table">
        <caption class="sr-only">Lectura con INPUT_PULLUP</caption>
        <thead><tr><th scope="col">Botón</th><th scope="col">digitalRead(2)</th><th scope="col">LED deseado</th></tr></thead>
        <tbody>
          <tr><td>Suelto</td><td>HIGH (1)</td><td>Apagado</td></tr>
          <tr><td>Pulsado</td><td>LOW (0)</td><td>Encendido</td></tr>
        </tbody>
      </table>
      <p>Prueba el código inicial: escribe el valor de D2 cada 200&nbsp;ms. Pulsa y suelta y observa cómo cambia.</p>
      ${question('Si escribes digitalWrite(LED, digitalRead(BOTON)), ¿cuándo se enciende el LED?', 'Cuando el botón está suelto, porque entonces la lectura es HIGH. Es justo al revés de lo que pide el reto.')}`,
  },
  {
    id: 'cambios',
    short: 'Solo al cambiar',
    title: 'Avisar solo cuando cambia',
    html: `
      <p>Escribir el estado en cada vuelta de <code>loop()</code> llena el monitor de líneas repetidas. Lo útil es avisar <strong>solo cuando cambia</strong>: guarda la lectura anterior en una variable y compárala con la nueva.</p>
      ${example('recordar-anterior')}
      ${question('¿Dónde debe declararse la variable que guarda la lectura anterior?', 'Fuera de loop() (o como static): si se declara dentro, se vuelve a crear en cada vuelta y olvida el valor anterior.')}
      ${goTo('#sim-panel', 'Ir a la simulación')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>La comprobación aplica siempre el mismo <strong>guion de 5 pulsaciones</strong> al pulsador: ${PRESSES}. Puedes verlo en tiempo real con «Reproducir guion del reto», bajo el circuito.</p>
      <ol>
        <li>Haz que el LED siga al botón (recuerda la lógica invertida).</li>
        <li>Guarda el estado anterior y escribe «Pulsado» o «Suelto» solo al cambiar.</li>
        <li>Pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta 5 segundos simulados con el guion y mide D13 y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'leer un pulsador con digitalRead usando la resistencia de pull-up interna, entender la lógica invertida y reaccionar solo cuando el botón cambia.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'El pulsador es un modelo eléctrico: cuando lo pulsas, une D2 con GND en el microcontrolador emulado; suelto, el nivel depende de cómo configuró el pin tu programa (pull-up, flotante o salida).',
  'La comprobación aplica un guion de pulsaciones fijo con precisión de ciclo de reloj, siempre igual.',
  'El pulsador de esta lección no rebota (es ideal); el rebote llega en la lección siguiente.',
  'Todavía no: analogRead, servos ni librerías adicionales. El circuito es fijo: no se evalúa un montaje físico.',
];

// ---------- Guía Chispa: pistas progresivas; nunca entregan el código del reto ----------
const TOPICS = {
  'paso-0': { label: 'el pulsador', hints: [
    'El pulsador une D2 con GND solo mientras está apretado.',
    'Ejecuta el código inicial y mantén pulsado el botón del circuito: mira qué número aparece en el monitor.',
  ] },
  'paso-1': { label: 'el pull-up', hints: [
    'Un pin de entrada sin nada conectado «flota»: lee ruido.',
    'Prueba el ejemplo «Un pin sin pull-up» y compáralo con el código inicial, que usa INPUT_PULLUP.',
  ] },
  'paso-2': { label: 'la lógica invertida', hints: [
    'Con INPUT_PULLUP, suelto se lee HIGH y pulsado se lee LOW.',
    'Piensa qué valor debe recibir el LED cuando la lectura es LOW.',
  ] },
  'paso-3': { label: 'avisar al cambiar', hints: [
    'Para saber si algo cambió, necesitas recordar cómo estaba antes.',
    'Mira el ejemplo «Avisar solo cuando algo cambia»: compara el valor nuevo con el anterior y actualiza el anterior.',
  ] },
  compilar: COMPILE_TOPIC,
  pullup: { label: 'el modo del pin', hints: [
    'D2 necesita la resistencia de pull-up interna; sin ella, con el botón suelto, el pin flota.',
    'En setup(), el pinMode del botón debe usar el modo INPUT_PULLUP.',
  ] },
  salida: { label: 'el pin del LED', hints: [
    'El LED está en D13, que debe ser una salida.',
    'Revisa que haya un pinMode(…, OUTPUT) para el LED y un digitalWrite para encenderlo y apagarlo.',
  ] },
  baud: { label: 'el monitor serie', hints: [
    'El monitor serie necesita que el programa lo abra en setup().',
    'Usa Serial.begin(…) con la velocidad que pide el reto: 9600.',
  ] },
  invertida: { label: 'la lógica invertida', hints: [
    'Revisa qué hace el LED con el botón suelto: debería estar apagado.',
    'Con INPUT_PULLUP, pulsado es LOW. Compara la lectura con LOW (o inviértela) antes de decidir el LED.',
  ] },
  retardo: { label: 'el tiempo de respuesta', hints: [
    'El LED debe reaccionar en menos de 30 ms: una espera larga en loop() lo impide.',
    'Mientras loop() está en un delay(), no lee el botón. Quita o acorta esas esperas.',
  ] },
  mensajes: { label: 'los mensajes', hints: [
    'Solo debe aparecer una línea cuando el botón cambia, nunca con el botón quieto.',
    'Guarda la lectura anterior en una variable que viva fuera de loop() y escribe solo cuando la lectura nueva sea distinta.',
    'No olvides actualizar la lectura anterior después de escribir.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a contar cuántas veces se ha pulsado el botón (pista: el rebote te dará sorpresas; es la lección siguiente).',
    'Otra idea: mide con millis() cuánto tiempo estuvo pulsado el botón y escríbelo al soltar.',
  ] },
};

const CHECK_TOPIC = { entrada: 'pullup', led: 'invertida', baud: 'baud', mensajes: 'mensajes' };

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/INPUT_PULLUP/.test(src)) return { topic: 'pullup', facts };
  if (!/pinMode\s*\([^,]+,\s*OUTPUT\s*\)/.test(src)) return { topic: 'salida', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  if (delays.some((d) => d > 30)) return { topic: 'retardo', facts };
  const strings = [...String(code).matchAll(/"([^"\\]|\\.)*"/g)].map((m) => m[0].toLowerCase()).join(' ');
  if (!strings.includes('pulsado') || !strings.includes('suelto') || !/\bif\b/.test(src)) return { topic: 'mensajes', facts };
  return { topic: 'comprobar', facts };
}

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && CHECK_TOPIC[failed.id] && analysis.topic === 'comprobar') {
    const topic = failed.id === 'led' && /tardó/.test(failed.detail || '') ? 'retardo' : CHECK_TOPIC[failed.id];
    return { topic, facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  entrada: ['Mira el detalle: indica en qué modo estaba D2 en el microcontrolador. El reto pide INPUT_PULLUP.',
    'Sin pull-up, con el botón suelto, D2 lee ruido y el LED parpadea solo.'],
  led: ['El detalle indica en qué pulsación falló el LED. Recuerda: pulsado se lee LOW y debe encender el LED.',
    'Si el LED tarda, busca esperas largas en loop(): mientras espera, el programa no lee el botón.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
  mensajes: ['Debe salir una línea por cada cambio del botón y ninguna más. Compara cada lectura con la anterior.',
    'Si salen líneas repetidas, revisa que la lectura anterior se actualice y que viva fuera de loop().'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy leerás un pulsador: pulsa Ejecutar y mantén apretado el botón del circuito para ver cómo cambia D2. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el LED está en D13 y el pulsador en D2.`,
  evalPass: '¡Reto superado! Con las 5 pulsaciones del guion, el LED siguió al botón al instante y el monitor avisó solo en cada cambio. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 4,
  tema: 'Entradas, salidas y PWM',
  titulo: 'Leer un pulsador con INPUT_PULLUP',
  corto: 'Leer un pulsador',
  kicker: 'Lección 4 · Entradas',
  previas: ['arduino-protoboard-semaforo'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root, opts) => createButtonCircuit(root, { ...opts, bounce: false }),
  pins: [13],
  button: { pin: BUTTON_PIN, seed: 7, bounce: false },
  evaluation: {
    durationMs: ENTRADA.durationMs,
    evaluate: evaluateEntrada,
    stimulus: { button: { pin: BUTTON_PIN, seed: 7 }, script: ENTRADA.events },
    note: 'La comprobación ejecuta tu programa 5 segundos simulados con un guion fijo de 5 pulsaciones en D2 y mide el LED de D13 y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
