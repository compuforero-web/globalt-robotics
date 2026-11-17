// Lección 6 · Tema 2: entrada analógica a PWM (2.4 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el guion de tensiones se aplica a A0 en el ADC emulado, el programa compilado
// las lee con analogRead y se miden el PWM de D9 y el monitor serie (pot-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluatePot, POT, CHANNEL } from './pot-eval.js';
import { createPotCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-potenciometro-pwm';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 6: leer un potenciómetro
// Potenciómetro de 10 kΩ: extremos a 5 V y GND, cursor en A0. LED con 220 Ω en D9.

const int POT = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  // Práctica: mueve el potenciómetro y mira cómo cambia la lectura.
  int lectura = analogRead(POT);   // 0 … 1023
  Serial.print("A0 = ");
  Serial.println(lectura);
  delay(500);
}
`;

export const EXAMPLES = {
  voltios: {
    title: 'Pasar la lectura a voltios',
    code: `// Ejemplo: cada cuenta del ADC vale unos 5 V / 1024 ≈ 4,9 mV.
void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(A0);
  float voltios = lectura * 5.0 / 1024.0;
  Serial.print(lectura);
  Serial.print(" cuentas = ");
  Serial.print(voltios);
  Serial.println(" V");
  delay(400);
}
`,
  },
  map: {
    title: 'Cambiar de escala con map()',
    code: `// Ejemplo: map() pasa un número de una escala a otra.
// Aquí convierte de 0–1023 a 0–100 (un porcentaje), sin usar el LED.
void setup() {
  Serial.begin(9600);
  for (int x = 0; x <= 1023; x += 341) {
    Serial.print(x);
    Serial.print(" -> ");
    Serial.print(map(x, 0, 1023, 0, 100));
    Serial.println(" %");
  }
}

void loop() { }
`,
  },
};

const fmtV = (v) => `${String(v).replace('.', ',')} V`;

export const CHALLENGE = {
  title: 'Reto: el brillo sigue al potenciómetro',
  summary: 'Lee el potenciómetro de A0 y úsalo para fijar el brillo del LED de D9 con PWM: girado del todo a un lado, apagado; al otro, brillo máximo. Además, escribe la lectura (0–1023) en el monitor serie cada 250 ms.',
  criteria: [
    'D9 genera PWM con analogWrite (valores intermedios a unos 490 Hz).',
    'El brillo de D9 es proporcional a la lectura: 0 V → 0 %, 1,25 V → 25 %, 2,5 V → 50 %, 5 V → 100 % (±4 puntos), como mucho 100 ms después de mover el potenciómetro.',
    'Cada línea del monitor incluye la lectura de A0 (0, 256, 512 y 1023 para esas tensiones, ±8).',
    'Se escribe una línea cada 250 ms (±10 %).',
    'El monitor serie funciona a 9600 baudios.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'divisor',
    short: 'Potenciómetro',
    title: 'Un divisor de tensión que gira',
    html: `
      <p>Un <strong>potenciómetro</strong> es una resistencia con un tercer terminal, el <strong>cursor</strong>, que se desliza sobre ella. Con un extremo a 5&nbsp;V y el otro a GND, el cursor entrega una tensión entre 0 y 5&nbsp;V según cuánto lo gires.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Terminal</th><th scope="col">Conexión</th></tr></thead>
        <tbody>
          <tr><td>Extremo 1</td><td>5&nbsp;V del Nano</td></tr>
          <tr><td>Cursor (centro)</td><td>A0</td></tr>
          <tr><td>Extremo 2</td><td>GND</td></tr>
          <tr><td>D9</td><td>220&nbsp;Ω → ánodo del LED → cátodo a GND</td></tr>
        </tbody>
      </table>
      <p>Mueve el control «Potenciómetro (A0)» bajo el circuito: con el teclado (flechas, Re&nbsp;Pág/Av&nbsp;Pág, Inicio, Fin), el ratón o el dedo.</p>
      ${question('Con el cursor justo en la mitad, ¿qué tensión llega a A0?', 'La mitad de 5 V: 2,5 V. Las dos mitades de la resistencia (5 kΩ y 5 kΩ) reparten la tensión por igual.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'adc',
    short: 'analogRead',
    title: 'El convertidor analógico-digital',
    html: `
      <p>Los pines A0–A7 llegan al <strong>ADC</strong> del ATmega328P: un convertidor de <strong>10 bits</strong> que transforma una tensión entre 0 y 5&nbsp;V en un número entre <strong>0 y 1023</strong>. <code>analogRead(A0)</code> le pide una conversión y espera el resultado (unos 0,1&nbsp;ms).</p>
      <table class="conn-table">
        <caption class="sr-only">Tensión y lectura</caption>
        <thead><tr><th scope="col">Tensión en A0</th><th scope="col">analogRead(A0)</th></tr></thead>
        <tbody>
          <tr><td>0 V</td><td>0</td></tr>
          <tr><td>1,25 V</td><td>256</td></tr>
          <tr><td>2,5 V</td><td>512</td></tr>
          <tr><td>5 V</td><td>1023</td></tr>
        </tbody>
      </table>
      <p>Ejecuta el código inicial y mueve el potenciómetro. Bajo el control verás también la última lectura que obtuvo tu programa.</p>
      ${example('voltios')}
      ${question('¿Por qué a 5 V se lee 1023 y no 1024?', 'Con 10 bits hay 1024 valores posibles, del 0 al 1023. El mayor número que cabe es 1023.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'escala',
    short: 'Escalas',
    title: 'De 0–1023 a 0–255',
    html: `
      <p><code>analogWrite</code> acepta valores de <strong>0 a 255</strong> (8 bits), pero la lectura llega de <strong>0 a 1023</strong> (10 bits). Hay que cambiar de escala: con <code>map(valor, 0, 1023, 0, 255)</code> o dividiendo entre 4.</p>
      ${example('map')}
      ${question('¿Qué pasaría si escribes analogWrite(9, 600) sin convertir?', 'analogWrite solo entiende 0–255: con valores mayores el LED del simulador (y el de una placa real) se queda encendido del todo, así que la mitad del recorrido del potenciómetro no cambiaría nada.')}`,
  },
  {
    id: 'ritmo',
    short: 'Cada 250 ms',
    title: 'Responder rápido e informar despacio',
    html: `
      <p>El reto pide dos ritmos: el brillo debe cambiar <strong>en menos de 100&nbsp;ms</strong>, pero el monitor serie solo debe recibir <strong>una línea cada 250&nbsp;ms</strong>.</p>
      <p>Con un <code>delay(250)</code> el brillo puede tardar hasta 250&nbsp;ms en reaccionar. Puedes actualizar el brillo en cada vuelta de <code>loop()</code> y usar <code>millis()</code> para escribir solo cuando hayan pasado 250&nbsp;ms (lo viste en la lección de antirrebote).</p>
      ${question('Si loop() lee A0, actualiza el LED y espera 250 ms, ¿cuánto puede tardar el LED en reaccionar al mover el potenciómetro?', 'Hasta 250 ms: si mueves el potenciómetro justo después de una lectura, el programa no lo verá hasta la siguiente vuelta. El reto pide 100 ms como máximo.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>La comprobación mueve siempre el potenciómetro igual: ${POT.steps.map((s) => `${fmtV(s.volts)} desde ${(s.t / 1000).toFixed(0)} s`).join(' → ')}, durante ${POT.durationMs / 1000} s. Puedes verlo en tiempo real con «Reproducir guion del reto».</p>
      <ol>
        <li>Lee A0 y convierte la lectura a la escala de analogWrite.</li>
        <li>Actualiza el brillo de D9 en cada vuelta.</li>
        <li>Escribe la lectura cada 250 ms y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${POT.durationMs / 1000} segundos simulados con el guion de tensiones en A0 y mide el PWM de D9 y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'leer una tensión con el ADC de 10 bits (analogRead), cambiarla de escala con map y usarla para controlar el brillo de un LED con PWM.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'El potenciómetro es un modelo de divisor de tensión: su posición fija la tensión de A0 (0–5 V) y el ADC emulado del ATmega328P la convierte cuando tu programa llama a analogRead (referencia AVcc de 5 V; 1,25 V → 256).',
  'La comprobación aplica un guion fijo de tensiones con precisión de ciclo de reloj, siempre igual.',
  'Simplificaciones: tensión sin ruido ni carga del ADC; referencias INTERNAL y EXTERNAL no se modelan (la lección usa la de 5 V). El circuito es fijo: no se evalúa un montaje físico.',
  'Todavía no: servos, sensores ultrasónicos ni librerías adicionales.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'el potenciómetro', hints: [
    'El potenciómetro reparte los 5 V: el cursor entrega más tensión cuanto más cerca está del extremo de 5 V.',
    'Mueve el control «Potenciómetro (A0)» y mira cómo gira la marca del mando en el circuito.',
  ] },
  'paso-1': { label: 'analogRead', hints: [
    'analogRead devuelve un número entre 0 y 1023 proporcional a la tensión.',
    'Ejecuta el código inicial y lleva el potenciómetro a 0 V, a la mitad y al máximo: anota las lecturas.',
  ] },
  'paso-2': { label: 'las escalas', hints: [
    'La lectura va de 0 a 1023 y analogWrite de 0 a 255.',
    'Prueba el ejemplo de map(): fíjate en el orden de sus cinco argumentos.',
  ] },
  'paso-3': { label: 'los ritmos', hints: [
    'El brillo debe responder rápido y los mensajes, cada 250 ms.',
    'Un delay(250) retrasa todo; con millis() puedes separar las dos tareas.',
  ] },
  compilar: COMPILE_TOPIC,
  lectura: { label: 'leer A0', hints: [
    'El programa tiene que leer la tensión con analogRead.',
    'El potenciómetro está en A0: usa analogRead(A0) y guarda el resultado en una variable int.',
  ] },
  analogwrite: { label: 'el brillo', hints: [
    'Para un brillo intermedio necesitas PWM: analogWrite en el pin del LED.',
    'El LED está en D9, un pin con PWM (~).',
  ] },
  escala: { label: 'la escala', hints: [
    'analogWrite acepta 0–255; la lectura llega en 0–1023.',
    'Convierte la lectura antes de usarla: map(lectura, 0, 1023, 0, 255) o lectura / 4.',
  ] },
  invertido: { label: 'el sentido', hints: [
    'Más tensión debe dar más brillo.',
    'Revisa el orden de los extremos en map(): de 0–1023 a 0–255, no al revés.',
  ] },
  baud: { label: 'el monitor serie', hints: [
    'El monitor serie necesita Serial.begin(…) en setup().',
    'El reto pide 9600 baudios.',
  ] },
  ritmo: { label: 'el ritmo de los mensajes', hints: [
    'Debe salir una línea cada 250 ms, ni más ni menos (±10 %).',
    'Guarda en una variable unsigned long el instante del último mensaje y escribe cuando millis() haya avanzado 250 ms.',
  ] },
  lento: { label: 'la velocidad de respuesta', hints: [
    'El brillo tarda más de 100 ms en seguir al potenciómetro.',
    'Actualiza el brillo en cada vuelta de loop(), sin esperas largas; deja el ritmo de 250 ms solo para los mensajes.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a que el LED se apague del todo por debajo de una zona muerta (por ejemplo, lecturas menores de 50).',
    'Otra idea: escribe también la tensión en voltios con dos decimales.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/analogRead\s*\(/.test(src)) return { topic: 'lectura', facts };
  if (!/analogWrite\s*\(/.test(src)) return { topic: 'analogwrite', facts };
  if (!/map\s*\(/.test(src) && !/\/\s*4\b|>>\s*2\b/.test(src)) return { topic: 'escala', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  if (delays.some((d) => d > 100)) return { topic: 'lento', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { pwm: 'analogwrite', lecturas: 'lectura', ritmo: 'ritmo', baud: 'baud' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    if (failed.id === 'brillo') {
      const d = failed.detail || '';
      return { topic: /invertido/.test(d) ? 'invertido' : /0–255|map/.test(d) ? 'escala' : 'lento', facts: analysis.facts };
    }
    if (CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  pwm: ['El detalle indica si falta analogRead, si el PWM sale por otro pin o si D9 solo se enciende y apaga.',
    'El LED está en D9 y necesita analogWrite con valores entre 0 y 255.'],
  brillo: ['Compara el % medido con el esperado en el detalle: 0 V → 0 %, 2,5 V → 50 %, 5 V → 100 %.',
    'Si llega tarde, actualiza el brillo en cada vuelta de loop() y deja la espera de 250 ms solo para los mensajes.'],
  lecturas: ['Cada línea debe incluir la lectura de analogRead(A0), sin convertir.',
    'Si todas las lecturas son 0, revisa que leas el canal A0.'],
  ritmo: ['El detalle indica cuánto tiempo pasó entre dos líneas: deben ser 250 ms.',
    'Usa millis() para escribir exactamente cada 250 ms aunque loop() dé muchas vueltas.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy leerás un potenciómetro con analogRead y controlarás el brillo de un LED. Pulsa Ejecutar y mueve el control «Potenciómetro (A0)»: verás la lectura que obtiene tu programa. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el LED está en D9.`,
  evalPass: '¡Reto superado! Con 0 V, 1,25 V, 2,5 V y 5 V en A0, tu programa leyó el valor correcto, ajustó el brillo de D9 a tiempo y lo informó cada 250 ms. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 6,
  tema: 'Entradas, salidas y PWM',
  titulo: 'Entrada analógica: el potenciómetro controla el brillo',
  corto: 'Potenciómetro y PWM',
  kicker: 'Lección 6 · Entrada analógica',
  previas: ['arduino-pwm-brillo', 'arduino-boton-entrada'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root, opts) => createPotCircuit(root, opts),
  pins: [9],
  pot: { channel: CHANNEL },
  evaluation: {
    durationMs: POT.durationMs,
    evaluate: evaluatePot,
    stimulus: { pot: { channel: CHANNEL, volts: 0 }, potScript: POT.script },
    note: 'La comprobación ejecuta tu programa 5 segundos simulados moviendo el potenciómetro de A0 (0 V, 1,25 V, 2,5 V, 5 V y 1,25 V) y mide el PWM de D9 y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
