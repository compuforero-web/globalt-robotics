// Lección 7 · Tema 4: sensor ultrasónico HC-SR04, medir distancia (4.1 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el guion mueve el obstáculo del modelo (sonar.js), que responde a los pulsos TRIG
// reales del programa compilado; se miden los disparos, los ecos y las líneas del monitor serie (ultra-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateDistancia, DIST, TRIG, ECHO } from './ultra-eval.js';
import { createSonarCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-ultrasonico-distancia';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 7: el eco del HC-SR04
// HC-SR04: VCC a 5 V, TRIG en D7, ECHO en D8, GND a GND.

const int TRIG = 7;
const int ECO = 8;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
  digitalWrite(TRIG, LOW);
}

void loop() {
  // 1. Pulso de disparo: 10 microsegundos en HIGH.
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  // 2. Práctica: cuánto tiempo pasa ECHO en HIGH (en microsegundos).
  unsigned long duracion = pulseIn(ECO, HIGH);
  Serial.print("Eco: ");
  Serial.print(duracion);
  Serial.println(" us");
  delay(500);
}
`;

export const EXAMPLES = {
  sonido: {
    title: '¿Cuánto tarda el sonido?',
    code: `// Ejemplo: tiempo de ida y vuelta del sonido (343 m/s = 0,0343 cm por microsegundo).
// No usa el sensor: solo hace las cuentas.
void setup() {
  Serial.begin(9600);
  int distancias[] = {10, 50, 100};
  for (int i = 0; i < 3; i++) {
    float ida = distancias[i] / 0.0343;     // microsegundos hasta el obstáculo
    Serial.print(distancias[i]);
    Serial.print(" cm -> ");
    Serial.print(2 * ida);                   // ida y vuelta
    Serial.println(" us");
  }
}

void loop() { }
`,
  },
  disparo: {
    title: 'Un disparo demasiado corto',
    code: `// Ejemplo: el HC-SR04 ignora un pulso TRIG de menos de 10 microsegundos.
// Mira en el circuito «Último pulso TRIG» y lo que devuelve pulseIn.
void setup() {
  Serial.begin(9600);
  pinMode(7, OUTPUT);
  pinMode(8, INPUT);
}

void loop() {
  digitalWrite(7, HIGH);
  delayMicroseconds(2);          // demasiado corto
  digitalWrite(7, LOW);
  Serial.println(pulseIn(8, HIGH));
  delay(200);
}
`,
  },
};

const fmtCm = (cm) => `${cm} cm`;

export const CHALLENGE = {
  title: 'Reto: el medidor de distancia',
  summary: 'Mide la distancia al obstáculo con el HC-SR04 y escríbela en el monitor serie como «Distancia: N cm», una vez cada 100–200 ms.',
  criteria: [
    'Pulsos TRIG en D7 de al menos 10 µs, separados al menos 60 ms.',
    'Cada línea tiene el formato «Distancia: N cm» (N entero o con decimales).',
    'Con el obstáculo a 10, 35, 80 y 150 cm, cada valor está dentro de ±(1 cm + 3 %) pasados 250 ms del cambio, y sale de un eco medido.',
    'Una línea cada 100–200 ms (±10 %).',
    'El monitor serie funciona a 9600 baudios.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'sensor',
    short: 'HC-SR04',
    title: 'Un sensor que mide con ecos',
    html: `
      <p>El <strong>HC-SR04</strong> tiene dos cilindros: uno emite un chasquido de ultrasonido (40&nbsp;kHz, que no oímos) y el otro escucha el eco que rebota en el obstáculo. Cuanto más lejos está, más tarda el eco en volver.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Pin del sensor</th><th scope="col">Conexión</th></tr></thead>
        <tbody>
          <tr><td>VCC</td><td>5&nbsp;V del Nano</td></tr>
          <tr><td>TRIG (disparo)</td><td>D7 (salida del Nano)</td></tr>
          <tr><td>ECHO (eco)</td><td>D8 (entrada del Nano)</td></tr>
          <tr><td>GND</td><td>GND</td></tr>
        </tbody>
      </table>
      <p>Bajo el circuito puedes mover el obstáculo (2 a 400&nbsp;cm) o quitarlo. El dibujo muestra también el último pulso TRIG de tu programa y el último ECHO que devolvió el sensor.</p>
      ${question('¿Por qué TRIG es una salida del Nano y ECHO una entrada?', 'Con TRIG el Nano le ordena al sensor que mida; con ECHO el sensor le contesta al Nano cuánto tardó el eco. Las órdenes salen del Nano y las respuestas entran.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'trig',
    short: 'Pulso TRIG',
    title: 'El pulso de disparo',
    html: `
      <p>Para pedir una medida, el programa pone TRIG en <strong>HIGH durante al menos 10&nbsp;µs</strong> (microsegundos: millonésimas de segundo) y lo vuelve a LOW. <code>delay()</code> cuenta milisegundos; para esperas tan cortas existe <code>delayMicroseconds()</code>.</p>
      <p>Al bajar TRIG, el sensor emite el ultrasonido. Mientras espera el eco no acepta otro disparo: deja <strong>al menos 60&nbsp;ms</strong> entre medidas para que se apague el eco anterior.</p>
      ${example('disparo')}
      ${question('¿Qué pasa si el pulso TRIG dura solo 2 µs?', 'El sensor lo ignora: no emite nada y ECHO no sube. Prueba el ejemplo y mira «Último pulso TRIG» en el circuito.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'eco',
    short: 'pulseIn',
    title: 'Medir el eco con pulseIn',
    html: `
      <p>El sensor mantiene ECHO en <strong>HIGH</strong> exactamente el tiempo que tardó el sonido en ir y volver. <code>pulseIn(8, HIGH)</code> espera a que ECHO suba, cuenta cuánto tiempo sigue en HIGH y devuelve esa duración en <strong>microsegundos</strong> (un <code>unsigned long</code>).</p>
      <p>Ejecuta el código inicial y mueve el obstáculo: verás crecer la duración del eco en el monitor serie.</p>
      ${question('Si el obstáculo se acerca, ¿la duración del eco sube o baja?', 'Baja: el sonido recorre menos camino, así que vuelve antes y ECHO está menos tiempo en HIGH.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'cm',
    short: 'A centímetros',
    title: 'Del tiempo a los centímetros',
    html: `
      <p>El sonido viaja a unos <strong>343&nbsp;m/s</strong>, es decir, 0,0343&nbsp;cm cada microsegundo. Pero el eco recorre el camino <strong>dos veces</strong> (ida y vuelta), así que la distancia es la mitad:</p>
      <p><code>cm = µs × 0,0343 / 2</code> &nbsp;≈&nbsp; <code>cm = µs / 58</code></p>
      ${example('sonido')}
      ${question('Si divides entre 29 en lugar de 58, ¿qué distancia sale?', 'El doble de la real: 29 µs es lo que tarda el sonido en recorrer 1 cm solo de ida. El eco va y vuelve.')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>La comprobación mueve siempre el obstáculo igual: ${DIST.steps.map((s) => `${fmtCm(s.cm)} desde ${(s.t / 1000).toFixed(1).replace('.', ',')} s`).join(' → ')}, durante ${String(DIST.durationMs / 1000).replace('.', ',')} s. Puedes verlo en tiempo real con «Reproducir guion del reto».</p>
      <ol>
        <li>Dispara el sensor con un pulso TRIG de 10 µs.</li>
        <li>Mide el eco con pulseIn y conviértelo a centímetros.</li>
        <li>Escribe «Distancia: N cm», espera lo justo para repetir cada 100–200 ms y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${String(DIST.durationMs / 1000).replace('.', ',')} segundos simulados con el guion del obstáculo y mide los pulsos de D7, los ecos de D8 y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'disparar un sensor ultrasónico HC-SR04 con un pulso de 10 µs, medir la duración de su eco con pulseIn y convertirla en centímetros.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'El HC-SR04 es un modelo eléctrico: detecta los pulsos reales que tu programa genera en D7 (≥ 10 µs en HIGH; si no, los ignora) y, 0,45 ms después de cada disparo, mantiene D8 en HIGH el tiempo de ida y vuelta del sonido (343 m/s, ≈ 58,3 µs por cm), con precisión de ciclo de reloj.',
  'Sin obstáculo (o a más de 400 cm) no hay eco: ECHO baja a los 38 ms, como en el módulo real. No acepta otro disparo hasta terminar la medida.',
  'pulseIn y micros funcionan como en una placa: la interrupción del temporizador 0 hace que pulseIn mida alrededor de un 0,6 % menos.',
  'Simplificaciones: obstáculo plano y quieto durante cada medida, sin ruido, sin ecos múltiples ni ángulo del haz; temperatura fija (20 °C). El circuito es fijo: no se evalúa un montaje físico.',
  'Todavía no: servos, motores ni librerías adicionales (NewPing no se usa: el curso enseña la señal).',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'el sensor', hints: [
    'El HC-SR04 tiene cuatro pines: VCC y GND lo alimentan, TRIG recibe la orden y ECHO devuelve la respuesta.',
    'En este circuito TRIG va a D7 y ECHO a D8.',
  ] },
  'paso-1': { label: 'el pulso TRIG', hints: [
    'Un pulso es pasar a HIGH y volver a LOW. El sensor necesita al menos 10 µs en HIGH.',
    'delayMicroseconds(10) espera 10 microsegundos.',
  ] },
  'paso-2': { label: 'pulseIn', hints: [
    'pulseIn(pin, HIGH) devuelve cuántos microsegundos estuvo el pin en HIGH.',
    'Ejecuta el código inicial y mueve el obstáculo: anota la duración a 10 cm y a 20 cm.',
  ] },
  'paso-3': { label: 'la conversión', hints: [
    'El eco recorre la distancia dos veces.',
    'Cada centímetro de distancia añade unos 58 µs al eco.',
  ] },
  compilar: COMPILE_TOPIC,
  disparo: { label: 'el pulso TRIG', hints: [
    'Sin pulso TRIG el sensor no mide: ECHO nunca sube.',
    'D7 debe ser OUTPUT; genera LOW → HIGH → LOW con delayMicroseconds entre medias.',
    'Si los pulsos son demasiado seguidos, el sensor ignora los que llegan mientras aún mide: deja al menos 60 ms entre disparos.',
  ] },
  corto: { label: 'la duración del TRIG', hints: [
    'El sensor ignora los pulsos de menos de 10 µs.',
    'Mira «Último pulso TRIG» en el circuito: debe marcar ✓. Usa delayMicroseconds(10).',
  ] },
  eco: { label: 'medir el eco', hints: [
    'La duración del eco se mide en D8 con pulseIn.',
    'pulseIn espera el flanco de subida de ECHO y devuelve los microsegundos en HIGH. Guárdalo en una variable unsigned long.',
  ] },
  conversion: { label: 'los centímetros', hints: [
    'Compara el valor que imprimes con el obstáculo del circuito: ¿es el doble, la mitad o mucho mayor?',
    'cm = microsegundos / 58 (el sonido va y vuelve).',
  ] },
  formato: { label: 'el formato', hints: [
    'Cada línea debe decir «Distancia: », el número y « cm».',
    'Puedes usar Serial.print para el texto y el número, y Serial.println para terminar la línea con « cm».',
  ] },
  ritmo: { label: 'el ritmo', hints: [
    'Debe salir una línea cada 100–200 ms: ni demasiado rápido ni demasiado lento.',
    'Una medida tarda como mucho unos 10 ms a 150 cm; un delay de 100–150 ms al final de loop() deja el ritmo dentro del rango.',
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
    'Ya superaste el reto. Prueba a escribir la distancia con un decimal usando float.',
    'Otra idea: haz la media de tres medidas seguidas (respetando los 60 ms entre disparos) para que el valor sea más estable.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const micros = [...src.matchAll(/delayMicroseconds\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/delayMicroseconds\s*\(/.test(src)) return { topic: 'disparo', facts };
  if (micros.length && Math.max(...micros) < 10) return { topic: 'corto', facts };
  if (!/pulseIn\s*\(|micros\s*\(/.test(src)) return { topic: 'eco', facts };
  if (!/\b58\b|0?\.0343?\b|\b29\b|0?\.017/.test(src)) return { topic: 'conversion', facts };
  if (!/Distancia/.test(src)) return { topic: 'formato', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  if (delays.some((d) => d > 200)) return { topic: 'ritmo', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { trig: 'disparo', formato: 'formato', distancia: 'conversion', ritmo: 'ritmo', baud: 'baud' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    const d = failed.detail || '';
    if (failed.id === 'trig' && /necesita al menos/.test(d)) return { topic: 'corto', facts: analysis.facts };
    if (failed.id === 'distancia' && /Un 0/.test(d)) return { topic: 'eco', facts: analysis.facts };
    if (CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  trig: ['El detalle dice si D7 no dio pulsos, si fueron demasiado cortos o demasiado seguidos.',
    'Configura D7 como OUTPUT, usa delayMicroseconds(10) y deja al menos 60 ms entre medidas.'],
  formato: ['Cada línea debe decir «Distancia: N cm».',
    'Revisa mayúsculas, los dos puntos y la unidad «cm» al final.'],
  distancia: ['Compara el valor impreso con el obstáculo del detalle: el error suele ser un factor 2 o imprimir microsegundos.',
    'cm = microsegundos / 58. Si imprimes 0, el sensor no recibió un disparo válido.'],
  ritmo: ['El detalle indica cuánto pasó entre dos líneas: deben ser 100–200 ms.',
    'Ajusta el delay al final de loop(); una medida suma unos pocos milisegundos.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy medirás distancias con ecos de ultrasonido. Pulsa Ejecutar y mueve el obstáculo: verás en el monitor cuánto dura el eco. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el sensor tiene TRIG en D7 y ECHO en D8.`,
  evalPass: '¡Reto superado! Tu programa disparó el sensor, midió cada eco y escribió la distancia correcta a 10, 35, 80 y 150 cm a buen ritmo. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 7,
  tema: 'Sensor ultrasónico HC-SR04',
  titulo: 'Sensor ultrasónico: medir distancias con ecos',
  corto: 'Medir distancia',
  kicker: 'Lección 7 · Sensor ultrasónico',
  previas: ['arduino-led-serie', 'arduino-boton-entrada'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root, opts) => createSonarCircuit(root, { ...opts, cm: 100 }),
  pins: [TRIG],
  sonar: { trig: TRIG, echo: ECHO },
  evaluation: {
    durationMs: DIST.durationMs,
    evaluate: evaluateDistancia,
    stimulus: { sonar: { trig: TRIG, echo: ECHO, cm: DIST.steps[0].cm }, sonarScript: DIST.script },
    note: 'La comprobación ejecuta tu programa 6,1 segundos simulados moviendo el obstáculo (10, 35, 80 y 150 cm) y mide los pulsos de D7, los ecos de D8 y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
