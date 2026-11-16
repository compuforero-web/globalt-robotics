// Lección 3 · Tema 2: brillo con PWM (LED que «respira»). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba, con las ventanas medidas en D9 (pwm-eval.js). El monitor serie es opcional.
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluatePwm, EVAL_DURATION_MS } from './pwm-eval.js';
import { createCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-pwm-brillo';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 3: brillo con PWM
// LED con resistencia de 220 Ω en D9, un pin con PWM (marcado con ~ en la placa).

const int LED = 9;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  analogWrite(LED, 255);   // 100 %: encendido todo el tiempo
  delay(1000);
  analogWrite(LED, 64);    // 25 % del tiempo encendido
  delay(1000);
  analogWrite(LED, 0);     // 0 %: apagado
  delay(1000);
}
`;

export const EXAMPLES = {
  'pin-sin-pwm': {
    title: 'analogWrite en un pin sin PWM',
    code: `// Ejemplo: D8 no tiene PWM. Observa su indicador: solo se enciende o se apaga.
void setup() {
  pinMode(8, OUTPUT);
}

void loop() {
  analogWrite(8, 100);   // menos de 128 → apagado
  delay(1000);
  analogWrite(8, 200);   // 128 o más → encendido
  delay(1000);
}
`,
  },
  niveles: {
    title: 'Niveles fijos de brillo',
    code: `// Ejemplo: cuatro niveles fijos. Compara el valor con el % que mide el simulador.
const int LED = 9;
const int NIVELES[] = {0, 64, 128, 255};

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 4; i++) {
    analogWrite(LED, NIVELES[i]);
    Serial.print("Valor ");
    Serial.println(NIVELES[i]);
    delay(1500);
  }
}
`,
  },
  subida: {
    title: 'Una rampa de subida',
    code: `// Ejemplo: el brillo sube poco a poco y vuelve a 0 de golpe.
const int LED = 9;

void setup() { }

void loop() {
  for (int v = 0; v <= 255; v += 5) {
    analogWrite(LED, v);
    delay(20);
  }
  delay(500);
}
`,
  },
};

export const CHALLENGE = {
  title: 'Reto: el LED que respira',
  summary: 'Haz que el LED de D9 «respire»: que suba suavemente desde apagado hasta el brillo máximo y vuelva a bajar, una y otra vez, con respiraciones de unos 2 segundos.',
  criteria: [
    'D9 genera PWM con valores intermedios a la frecuencia de analogWrite (entre 450 y 1000 Hz). En 0 % y 100 % la salida es continua y no se mide frecuencia.',
    'El brillo baja hasta el 5 % o menos y sube hasta el 95 % o más.',
    'Al menos dos respiraciones completas en 6 segundos, cada una de 1,6 a 2,4 s y llegando a los dos extremos.',
    'Cambios suaves: entre dos medidas seguidas (cada 20 ms) el brillo cambia como mucho 8 puntos.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'pwm',
    short: 'Qué es PWM',
    title: 'Entender el PWM',
    html: `
      <p>Un pin digital solo da 0&nbsp;V o 5&nbsp;V. Para un brillo intermedio, el Nano lo <strong>enciende y apaga muy rápido</strong> (unas 490 veces por segundo en D9): tu ojo ve el promedio. Eso es <strong>PWM</strong>, modulación por ancho de pulso.</p>
      <p>El <strong>ciclo de trabajo</strong> es el porcentaje del tiempo en HIGH. Con <code>analogWrite(pin, valor)</code> eliges un valor de 0 a 255: el porcentaje es valor ÷ 255.</p>
      <table class="conn-table">
        <caption class="sr-only">Valores de analogWrite y ciclo de trabajo</caption>
        <thead><tr><th scope="col">analogWrite</th><th scope="col">Tiempo en HIGH</th><th scope="col">Señal</th></tr></thead>
        <tbody>
          <tr><td>0</td><td>0 %</td><td>Apagado continuo (sin pulsos)</td></tr>
          <tr><td>64</td><td>25 %</td><td>Pulsos cortos</td></tr>
          <tr><td>128</td><td>50 %</td><td>Mitad y mitad</td></tr>
          <tr><td>255</td><td>100 %</td><td>Encendido continuo (sin pulsos)</td></tr>
        </tbody>
      </table>
      ${question('¿Qué porcentaje produce <code>analogWrite(9, 191)</code>?', '191 ÷ 255 ≈ 0,75: el pin pasa el 75 % del tiempo en HIGH.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'pines',
    short: 'Pines PWM',
    title: 'Qué pines tienen PWM',
    html: `
      <p>En el Nano, solo <strong>D3, D5, D6, D9, D10 y D11</strong> tienen PWM: están conectados a los temporizadores del ATmega328P. En la placa suelen llevar el símbolo <code>~</code>, igual que en la tira de pines de la simulación.</p>
      <p>En los demás pines, <code>analogWrite</code> no puede dar valores intermedios: con 128 o más pone el pin en HIGH y con menos, en LOW.</p>
      ${example('pin-sin-pwm')}
      ${question('Conectas el LED a D8 y escribes <code>analogWrite(8, 64)</code>. ¿Qué ves?', 'El LED apagado: D8 no tiene PWM y 64 es menor que 128, así que el pin queda en LOW.')}`,
  },
  {
    id: 'medir',
    short: 'Medir',
    title: 'Medir el brillo',
    html: `
      <p>La simulación <strong>mide</strong> D9 cada 20&nbsp;ms en el microcontrolador emulado: el porcentaje de tiempo en HIGH y la frecuencia de los pulsos. Lo verás en el medidor bajo el circuito y en la tira de pines.</p>
      <p>Con 0 % o 100 % no hay pulsos, solo una salida continua: por eso el medidor dice «salida continua» y no muestra frecuencia.</p>
      ${example('niveles')}
      ${question('El medidor marca 50 % y 490 Hz. ¿Cuánto dura cada pulso en HIGH?', 'Un periodo dura 1 ÷ 490 ≈ 2,04 ms; la mitad, unos 1,02 ms, está en HIGH.')}
      ${goTo('#sim-panel', 'Ir a la simulación')}`,
  },
  {
    id: 'rampas',
    short: 'Rampas',
    title: 'Cambiar el brillo poco a poco',
    html: `
      <p>Para que el cambio sea suave, el valor tiene que avanzar en <strong>pasos pequeños</strong> con una espera corta entre ellos. Un bucle <code>for</code> lo hace: repite un bloque cambiando una variable en cada vuelta.</p>
      <p>La duración de una rampa es <strong>número de pasos × espera de cada paso</strong>.</p>
      ${example('subida')}
      ${question('¿Cuánto dura la subida del ejemplo y por qué el final no es suave?', 'Son 52 pasos (0, 5, 10… 255) de 20 ms: unos 1,04 s. Al terminar, el valor vuelve de 255 a 0 de golpe en la siguiente vuelta de loop().')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>Aquí no hay solución escrita: los pasos anteriores te dan las piezas. Un camino posible:</p>
      <ol>
        <li>Haz que el brillo suba de forma suave.</li>
        <li>Añade la bajada, también suave, y ajusta la duración de cada respiración.</li>
        <li>Pulsa <strong>Comprobar reto</strong> y revisa los puntos marcados.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta 6 segundos simulados y mide D9 cada 20 ms. El monitor serie es opcional en este reto: úsalo si te ayuda a depurar.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'controlar el brillo de un LED con PWM y hacer que «respire» de forma suave y regular.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'Funciona: PWM por hardware con analogWrite en D3, D5, D6, D9, D10 y D11 (medido cada 20 ms: % en HIGH y frecuencia), pines digitales, temporizadores y Serial.',
  'El brillo del LED de la ilustración sale del % medido en D9; no es una animación aparte.',
  'El circuito es fijo: LED con resistencia en D9. Todavía no: entradas externas, analogRead, servos ni librerías adicionales.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'el PWM', hints: [
    'PWM enciende y apaga el pin muy rápido; tu ojo ve el promedio.',
    'analogWrite(pin, valor) usa valores de 0 (0 %) a 255 (100 %).',
  ] },
  'paso-1': { label: 'los pines con PWM', hints: [
    'Solo D3, D5, D6, D9, D10 y D11 tienen PWM en el Nano (marcados con ~).',
    'Prueba el ejemplo del pin sin PWM y mira su indicador: solo se enciende o se apaga.',
  ] },
  'paso-2': { label: 'la medición', hints: [
    'Prueba el ejemplo de niveles fijos y compara el valor con el % del medidor de D9.',
    'Con 0 % y 100 % el medidor dice «salida continua»: sin pulsos no hay frecuencia que medir.',
  ] },
  'paso-3': { label: 'las rampas', hints: [
    'Un bucle for que cambia el valor poco a poco produce una rampa de brillo.',
    'La duración de una rampa es el número de pasos por la espera de cada paso.',
  ] },
  compilar: COMPILE_TOPIC,
  analogwrite: { label: 'analogWrite', hints: [
    'Para brillos intermedios necesitas analogWrite(…), no digitalWrite(…).',
    'analogWrite(pin, valor) recibe un valor entre 0 y 255.',
  ] },
  pin: { label: 'el pin del LED', hints: [
    'El LED está en D9: escribe el PWM en ese pin.',
    'Si usas una constante para el pin, comprueba que vale 9.',
  ] },
  bucle: { label: 'subir y bajar', hints: [
    'Para respirar, el brillo tiene que subir y después bajar: dos rampas, una detrás de otra.',
    'Una rampa hace crecer el valor y la otra lo hace decrecer; juntas forman una respiración.',
  ] },
  ritmo: { label: 'la duración de cada respiración', hints: [
    (c) => `Veo estas esperas en tu código: ${c.delays?.join(', ') || 'ninguna'} ms. ¿Cuántos pasos da cada rampa?`,
    'Cada respiración (subir y bajar) debe durar unos 2 s: la subida, cerca de 1 s, y la bajada, otro tanto.',
    'Duración de una rampa = número de pasos × espera de cada paso.',
  ] },
  extremos: { label: 'los extremos', hints: [
    'El brillo debe llegar abajo del todo (5 % o menos) y arriba del todo (95 % o más).',
    'Revisa dónde empiezan y dónde terminan tus rampas: los extremos de analogWrite son 0 y 255.',
  ] },
  suave: { label: 'la suavidad', hints: [
    'En algún momento el brillo cambia de golpe.',
    'Usa pasos pequeños con esperas cortas. Volver de 255 a 0 sin bajada también es un salto brusco.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a que la bajada sea más lenta que la subida, como una respiración tranquila.',
    'Otra idea: haz respirar un segundo LED en D10 a otro ritmo usando millis().',
  ] },
};

const CHECK_TOPIC = { rango: 'extremos', ciclos: 'ritmo', suave: 'suave' };

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/analogWrite\s*\(/.test(src)) return { topic: 'analogwrite', facts };
  const literal = [...src.matchAll(/analogWrite\s*\(\s*(\d+)\s*,/g)].map((m) => Number(m[1]));
  if (literal.length && !literal.includes(9)) return { topic: 'pin', facts };
  if (!/\b(for|while)\b/.test(src) && !/millis\s*\(/.test(src)) return { topic: 'bucle', facts };
  return { topic: 'comprobar', facts };
}

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed?.id === 'pwm' && analysis.topic === 'comprobar') return { topic: 'pin', facts: analysis.facts };
  if (failed && CHECK_TOPIC[failed.id] && analysis.topic === 'comprobar') return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  pwm: ['Mira el detalle: indica si D9 no recibió PWM, si el PWM salió por otro pin o si la frecuencia no es la de analogWrite.',
    'El LED está en D9 y necesita analogWrite(…) con valores intermedios (entre 1 y 254) en algún momento.'],
  rango: ['El brillo tiene que recorrer todo el rango: desde casi apagado hasta casi el máximo.',
    'Revisa el valor inicial y el final de tus rampas.'],
  ciclos: ['Compara la duración de tus respiraciones con la del reto: entre 1,6 y 2,4 s cada una.',
    'Calcula: pasos de la subida × espera + pasos de la bajada × espera.'],
  suave: ['El detalle indica en qué momento el brillo saltó de golpe. Usa pasos más pequeños o más seguidos.',
    'Comprueba también el paso de una respiración a la siguiente: no debe haber un salto de 255 a 0.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy controlarás el brillo de un LED con PWM hasta hacerlo «respirar». Mira el medidor de D9: muestra el % y la frecuencia medidos en el microcontrolador emulado. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el LED está conectado a D9.`,
  evalPass: '¡Reto superado! Medí en D9 respiraciones completas y suaves, de apagado a brillo máximo, con PWM real. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 3,
  tema: 'Entradas, salidas y PWM',
  titulo: 'Brillo con PWM: un LED que respira',
  corto: 'Brillo con PWM',
  kicker: 'Lección 3 · PWM',
  previas: ['arduino-protoboard-semaforo'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root) => createCircuit(root, { pin: 9, meter: true }),
  pins: [9],
  evaluation: {
    durationMs: EVAL_DURATION_MS,
    evaluate: evaluatePwm,
    note: 'La comprobación ejecuta tu programa 6 segundos simulados y mide el brillo de D9 cada 20 ms. El monitor serie no se evalúa en este reto.',
  },
  guide: { chooseTopic, hintText, help },
};
