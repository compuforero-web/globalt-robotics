// Lección 8 · Tema 4: alerta por cercanía y fuera de rango con el HC-SR04 (4.2 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: el guion mueve el obstáculo del modelo (sonar.js), incluido un tramo sin eco; se miden
// los disparos reales de D7, el PWM de D9 por ventanas y el monitor serie (ultra-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateAlerta, ALERTA, alertDuty, TRIG, ECHO, LED } from './ultra-eval.js';
import { createSonarCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-ultrasonico-alerta';

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 8: ¿qué devuelve pulseIn sin eco?
// HC-SR04: TRIG en D7, ECHO en D8. LED con 220 Ω en D9.

const int TRIG = 7;
const int ECO = 8;
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  // Práctica: marca «Sin obstáculo» y compara el resultado con y sin el tercer argumento.
  unsigned long duracion = pulseIn(ECO, HIGH, 30000);
  Serial.print("pulseIn = ");
  Serial.println(duracion);
  delay(300);
}
`;

export const EXAMPLES = {
  umbral: {
    title: 'Condiciones encadenadas',
    code: `// Ejemplo: if / else if / else elige una sola rama, la primera que se cumple.
// No usa el sensor: clasifica tres distancias de prueba.
void setup() {
  Serial.begin(9600);
  int pruebas[] = {5, 25, 60};
  for (int i = 0; i < 3; i++) {
    int d = pruebas[i];
    Serial.print(d);
    if (d < 15) {
      Serial.println(" cm: muy cerca");
    } else if (d <= 40) {
      Serial.println(" cm: a media distancia");
    } else {
      Serial.println(" cm: lejos");
    }
  }
}

void loop() { }
`,
  },
  escala: {
    title: 'map() al revés y constrain()',
    code: `// Ejemplo: map() también convierte al revés (más grande → más pequeño),
// y constrain() recorta un valor para que no se salga de un rango.
void setup() {
  Serial.begin(9600);
  for (int x = -20; x <= 120; x += 35) {
    int recortado = constrain(x, 0, 100);
    Serial.print(x);
    Serial.print(" -> ");
    Serial.print(recortado);
    Serial.print(" -> ");
    Serial.println(map(recortado, 0, 100, 100, 0));
  }
}

void loop() { }
`,
  },
};

const fmtCm = (cm) => (cm === null ? 'sin obstáculo' : `${cm} cm`);
const pct = (d) => `${Math.round(d * 100)} %`;

export const CHALLENGE = {
  title: 'Reto: alerta de cercanía',
  summary: 'Usa el LED de D9 como alerta: apagado si el obstáculo está a más de 50 cm, cada vez más brillante entre 50 y 10 cm y encendido del todo a menos de 10 cm. Si no hay eco, apaga el LED y escribe «Fuera de rango» sin quedarte esperando.',
  criteria: [
    'Pulsos TRIG en D7 de al menos 10 µs, separados al menos 60 ms, y un disparo nuevo como mucho cada 300 ms.',
    'D9 genera PWM con analogWrite: 0 % a más de 50 cm, proporcional entre 50 y 10 cm (40 cm → 25 %, 30 cm → 50 %, 20 cm → 75 %) y 100 % a menos de 10 cm (±6 puntos), como mucho 250 ms después del cambio.',
    'Sin eco, el LED se apaga y el monitor escribe «Fuera de rango» como mucho 40 ms después del disparo. Con eco no se escribe.',
    'El monitor serie funciona a 9600 baudios.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'sin-eco',
    short: 'Sin eco',
    title: 'Cuando no vuelve ningún eco',
    html: `
      <p>Si no hay nada delante (o está a más de unos 4&nbsp;m), el sonido no vuelve. El HC-SR04 no espera para siempre: mantiene ECHO en HIGH unos <strong>38&nbsp;ms</strong> y lo baja.</p>
      <p><code>pulseIn(ECO, HIGH)</code> admite un tercer argumento: el <strong>tiempo máximo</strong> que espera, en microsegundos. Si el pulso no termina a tiempo, devuelve <strong>0</strong>. Sin ese argumento espera hasta 1&nbsp;segundo y, sin eco, devolvería unos 38&nbsp;000&nbsp;µs (¡como si hubiera algo a 6,5&nbsp;m!).</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">Componente</th><th scope="col">Conexión</th></tr></thead>
        <tbody>
          <tr><td>HC-SR04</td><td>VCC a 5&nbsp;V, TRIG a D7, ECHO a D8, GND a GND</td></tr>
          <tr><td>LED</td><td>D9 → 220&nbsp;Ω → ánodo; cátodo a GND</td></tr>
        </tbody>
      </table>
      <p>Ejecuta el código inicial, marca «Sin obstáculo» bajo el circuito y mira qué devuelve pulseIn. Después borra el 30000 y compara.</p>
      ${question('Con pulseIn(ECO, HIGH, 30000) y sin obstáculo, ¿qué valor devuelve y cuánto tarda?', 'Devuelve 0 al cabo de unos 30 ms: el pulso de 38 ms no termina antes del tiempo máximo. Por eso un 0 significa «no hubo eco», no «obstáculo a 0 cm».')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'umbrales',
    short: 'Umbrales',
    title: 'Decidir con umbrales',
    html: `
      <p>Una <strong>alerta</strong> decide según la distancia. Con <code>if … else if … else</code> el programa elige <strong>una sola</strong> rama: la primera condición que se cumple, en orden.</p>
      ${example('umbral')}
      ${question('Si la primera condición es d <= 50 y la segunda d < 10, ¿cuándo se ejecuta la segunda?', 'Nunca: cualquier d menor que 10 también es menor o igual que 50, así que entra siempre en la primera rama. Ordena las condiciones de la más estricta a la más amplia, o usa rangos que no se solapen.')}`,
  },
  {
    id: 'brillo',
    short: 'Brillo',
    title: 'Más cerca, más brillo',
    html: `
      <p>Entre 50 y 10&nbsp;cm el brillo debe crecer de forma proporcional: a 50&nbsp;cm, 0 (apagado); a 10&nbsp;cm, 255 (máximo). <code>map()</code> sirve también <strong>al revés</strong> y <code>constrain()</code> evita salirse de 0–255.</p>
      <table class="conn-table">
        <caption class="sr-only">Brillo esperado</caption>
        <thead><tr><th scope="col">Distancia</th><th scope="col">Brillo de D9</th></tr></thead>
        <tbody>
          ${[70, 40, 30, 20, 6, null].map((cm) => `<tr><td>${fmtCm(cm)}</td><td>${pct(alertDuty(cm))}</td></tr>`).join('')}
        </tbody>
      </table>
      ${example('escala')}
      ${question('Sin eco, pulseIn devuelve 0 y la cuenta da 0 cm. ¿Qué haría el LED si no tratas ese caso?', 'Se encendería del todo, como si el obstáculo estuviera pegado al sensor. Comprueba el 0 antes de calcular el brillo.')}`,
  },
  {
    id: 'ritmo',
    short: 'Sin bloquear',
    title: 'Responder a tiempo',
    html: `
      <p>Mientras pulseIn espera, el programa no hace nada más. Con un tiempo máximo de 30&nbsp;000&nbsp;µs la espera más larga es de 30&nbsp;ms; el reto pide escribir «Fuera de rango» <strong>≤ 40&nbsp;ms</strong> después del disparo.</p>
      <p>Además, cada vuelta de <code>loop()</code> debe medir y actualizar el LED: el reto pide un disparo nuevo <strong>al menos cada 300&nbsp;ms</strong> (y nunca a menos de 60&nbsp;ms del anterior).</p>
      ${question('Si loop() mide y después espera delay(500), ¿cumple el reto?', 'No: pasan más de 500 ms entre disparos, así que el LED tarda demasiado en reaccionar. Con esperas de 60–150 ms el ciclo queda dentro de los 300 ms.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <p>La comprobación mueve siempre el obstáculo igual: ${ALERTA.steps.map((s) => `${fmtCm(s.cm)} desde ${(s.t / 1000).toFixed(1).replace('.', ',')} s`).join(' → ')}, durante ${String(ALERTA.durationMs / 1000).replace('.', ',')} s. Puedes verlo en tiempo real con «Reproducir guion del reto».</p>
      <ol>
        <li>Mide la distancia con un tiempo máximo en pulseIn.</li>
        <li>Si no hubo eco, apaga el LED y escribe «Fuera de rango».</li>
        <li>Si lo hubo, calcula el brillo según la tabla y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${String(ALERTA.durationMs / 1000).replace('.', ',')} segundos simulados con el guion del obstáculo y mide los pulsos de D7, el PWM de D9 y el monitor serie. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'usar umbrales y condiciones encadenadas para convertir una distancia en una alerta luminosa con PWM, y poner un tiempo máximo a pulseIn para detectar cuándo no hay eco.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'El HC-SR04 es un modelo eléctrico: detecta los pulsos reales de D7 (≥ 10 µs) y mantiene D8 en HIGH el tiempo de ida y vuelta del sonido (≈ 58,3 µs por cm), con precisión de ciclo de reloj. Sin eco, ECHO baja a los 38 ms.',
  'El LED de D9 se mide por ventanas de 20 ms: % del tiempo en HIGH y frecuencia del PWM de analogWrite.',
  'La comprobación aplica un guion fijo de distancias, con un tramo sin obstáculo, siempre igual.',
  'Simplificaciones: obstáculo plano, sin ruido ni ecos múltiples, temperatura fija (20 °C). El circuito es fijo: no se evalúa un montaje físico.',
  'Todavía no: servos, motores ni librerías adicionales.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'el caso sin eco', hints: [
    'Sin obstáculo, el sensor sube ECHO y lo baja a los 38 ms.',
    'Ejecuta el código inicial con «Sin obstáculo» marcado y fíjate en el valor de pulseIn; luego quita el 30000 y repite.',
  ] },
  'paso-1': { label: 'los umbrales', hints: [
    'Con if / else if / else solo se ejecuta la primera rama que se cumple.',
    'Prueba el ejemplo y cambia el orden de las condiciones para ver qué pasa.',
  ] },
  'paso-2': { label: 'el brillo', hints: [
    'A 50 cm el brillo es 0 y a 10 cm es 255.',
    'map() acepta rangos al revés; constrain() recorta un valor a un rango.',
  ] },
  'paso-3': { label: 'el tiempo de respuesta', hints: [
    'pulseIn bloquea el programa mientras espera.',
    'Un tiempo máximo de 30000 µs limita la espera a 30 ms; las esperas de loop() deben dejar el ciclo por debajo de 300 ms.',
  ] },
  compilar: COMPILE_TOPIC,
  disparo: { label: 'el pulso TRIG', hints: [
    'Sin un pulso TRIG válido el sensor no mide.',
    'D7 debe ser OUTPUT y quedarse al menos 10 µs en HIGH; deja al menos 60 ms entre disparos.',
  ] },
  medir: { label: 'la medida', hints: [
    'Primero hay que medir la distancia como en la lección 7.',
    'Dispara TRIG, mide ECHO con pulseIn y conviértelo a centímetros.',
  ] },
  timeout: { label: 'el tiempo máximo', hints: [
    'Sin tercer argumento, pulseIn puede esperar hasta 1 segundo.',
    'Pasa el tiempo máximo en microsegundos como tercer argumento de pulseIn. Si se agota, devuelve 0.',
  ] },
  fuera: { label: '«Fuera de rango»', hints: [
    'Cuando no hay eco hay que avisar por el monitor serie.',
    'Un resultado 0 de pulseIn (con tiempo máximo) significa que no hubo eco: en ese caso escribe «Fuera de rango».',
    '«Fuera de rango» solo debe aparecer sin eco: revisa que el mensaje esté dentro de esa rama.',
  ] },
  cero: { label: 'el 0 de pulseIn', hints: [
    'Sin eco, el LED debe apagarse.',
    'Si calculas la distancia con un 0, sale 0 cm y el LED se enciende al máximo. Trata el 0 antes de calcular el brillo.',
  ] },
  pwm: { label: 'el brillo con PWM', hints: [
    'Para brillos intermedios hace falta analogWrite en D9 (pin con «~»).',
    'digitalWrite solo enciende o apaga; el reto pide un brillo proporcional entre 50 y 10 cm.',
  ] },
  escala: { label: 'la escala del brillo', hints: [
    'Compara el % medido con la tabla del paso «Brillo».',
    'A 50 cm → 0 y a 10 cm → 255; fuera de ese tramo, recorta con constrain o con condiciones.',
  ] },
  invertido: { label: 'el sentido', hints: [
    'Cuanto más cerca está el obstáculo, más brillo.',
    'Revisa el orden de los extremos en map(): de 50 cm a 10 cm debe ir de 0 a 255.',
  ] },
  ciclo: { label: 'el ritmo del bucle', hints: [
    'Cada vuelta de loop() debe medir y actualizar el LED a menudo.',
    'Reduce las esperas: entre disparos, de 60 a 150 ms.',
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
    'Ya superaste el reto. Prueba a hacer parpadear el LED cuando el obstáculo esté a menos de 5 cm, sin usar delay.',
    'Otra idea: escribe también la distancia cuando cambie más de 2 cm.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  const plain = src.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!/delayMicroseconds\s*\(/.test(src)) return { topic: 'disparo', facts };
  if (!/pulseIn\s*\(|micros\s*\(/.test(src)) return { topic: 'medir', facts };
  if (/pulseIn\s*\(/.test(src) && !/pulseIn\s*\([^;]*,[^;]*,[^;]*\)/.test(src)) return { topic: 'timeout', facts };
  if (!/analogWrite\s*\(/.test(src)) return { topic: 'pwm', facts };
  if (!plain.includes('fuera de rango')) return { topic: 'fuera', facts };
  if (!/Serial\s*\.\s*begin\s*\(\s*9600\s*\)/.test(src)) return { topic: 'baud', facts };
  if (delays.some((d) => d > 200)) return { topic: 'ciclo', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { trig: 'disparo', pwm: 'pwm', ciclo: 'ciclo', baud: 'baud' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    const d = failed.detail || '';
    if (failed.id === 'brillo') return { topic: /Sin eco/.test(d) ? 'cero' : /invertido/.test(d) ? 'invertido' : /tarda demasiado/.test(d) ? 'ciclo' : 'escala', facts: analysis.facts };
    if (failed.id === 'fuera') return { topic: /tiempo máximo a pulseIn/.test(d) ? 'timeout' : 'fuera', facts: analysis.facts };
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
  pwm: ['El LED está en D9 y necesita analogWrite con valores entre 0 y 255.',
    'Entre 50 y 10 cm el brillo debe tomar valores intermedios, no solo encendido o apagado.'],
  brillo: ['Compara el % medido con el esperado en el detalle: 70 cm → 0 %, 30 cm → 50 %, 6 cm → 100 %, sin eco → 0 %.',
    'Si sin eco el LED se enciende, trata el 0 de pulseIn antes de calcular la distancia.'],
  fuera: ['El detalle dice si faltó «Fuera de rango», si llegó tarde o si apareció con eco.',
    'Con pulseIn(ECO, HIGH, 30000), un resultado 0 significa que no hubo eco.'],
  ciclo: ['El detalle indica cuánto tiempo pasó sin un disparo nuevo.',
    'Acorta las esperas de loop(): mide al menos cada 300 ms.'],
  baud: ['La velocidad del monitor serie se fija con Serial.begin(…) dentro de setup(). El reto pide 9600.',
    'Revisa que solo haya un Serial.begin(…) y que use 9600.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy convertirás la distancia en una alerta luminosa y aprenderás qué hacer cuando no vuelve ningún eco. Pulsa Ejecutar y marca «Sin obstáculo» para ver qué devuelve pulseIn. Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el sensor usa D7 (TRIG) y D8 (ECHO) y el LED está en D9.`,
  evalPass: '¡Reto superado! El LED de D9 siguió la distancia, se apagó sin eco y tu programa avisó «Fuera de rango» a tiempo. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 8,
  tema: 'Sensor ultrasónico HC-SR04',
  titulo: 'Alerta por cercanía y fuera de rango',
  corto: 'Alerta de cercanía',
  kicker: 'Lección 8 · Sensor ultrasónico',
  previas: ['arduino-ultrasonico-distancia', 'arduino-pwm-brillo'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root, opts) => createSonarCircuit(root, { ...opts, led: true, cm: 30 }),
  pins: [LED, TRIG],
  sonar: { trig: TRIG, echo: ECHO },
  evaluation: {
    durationMs: ALERTA.durationMs,
    evaluate: evaluateAlerta,
    stimulus: { sonar: { trig: TRIG, echo: ECHO, cm: ALERTA.steps[0].cm }, sonarScript: ALERTA.script },
    note: 'La comprobación ejecuta tu programa 7,2 segundos simulados moviendo el obstáculo (70, 40, 30, 20 y 6 cm, sin obstáculo y 30 cm) y mide los pulsos de D7, el PWM de D9 y el monitor serie.',
  },
  guide: { chooseTopic, hintText, help },
};
