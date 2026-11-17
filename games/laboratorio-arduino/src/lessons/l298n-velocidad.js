// Lección 10 · Tema 5: velocidad con ENA y PWM (5.2 de la ruta). Contenido original de GLOBALT.
// Solo «Comprobar reto» aprueba: se mide el PWM real de D9 (ENA) por ventanas y el modelo L298N + motor (motor.js)
// sigue IN1 (D7), IN2 (D8) y los flancos de ENA, con zona muerta e inercia (motor-eval.js).
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { evaluateVelocidad, VELOCIDAD, VELOCIDAD_PINS } from './motor-eval.js';
import { MOTOR, motorStep } from '../motor.js';
import { createMotorCircuit } from '../circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp, strip } from '../guide.js';

export const ID = 'arduino-l298n-velocidad';
const [CH] = VELOCIDAD_PINS;

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 10: velocidad con ENA
// IN1 en D7, IN2 en D8 y ENA en D9 (se quita el puente de ENA).
// Práctica: observa el motor con ENA a 60, 120 y 255. ¿Gira a 60?

const int IN1 = 7;
const int IN2 = 8;
const int ENA = 9;

void setup() {
  Serial.begin(9600);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);   // sentido: adelante
  digitalWrite(IN2, LOW);
}

void probar(int valor) {
  Serial.print("ENA = ");
  Serial.println(valor);
  analogWrite(ENA, valor);
  delay(1500);
}

void loop() {
  probar(60);
  probar(120);
  probar(255);
  probar(0);
}
`;

export const EXAMPLES = {
  pasos: {
    title: 'Un for que avanza a pasos',
    code: `// Ejemplo: un for repite un bloque cambiando una variable.
// Aquí cuenta de 0 a 100 de 20 en 20 y espera entre pasos.
void setup() {
  Serial.begin(9600);
  for (int v = 0; v <= 100; v += 20) {
    Serial.println(v);
    delay(100);
  }
  Serial.println("Fin");
}

void loop() { }
`,
  },
  calculo: {
    title: '¿Cuánto esperar en cada paso?',
    code: `// Ejemplo: para recorrer N pasos en T milisegundos,
// cada paso dura T / N. Calcúlalo con decimales.
void setup() {
  Serial.begin(9600);
  float total = 3000;    // ms
  int pasos = 100;
  Serial.print("Cada paso: ");
  Serial.print(total / pasos);
  Serial.println(" ms");
}

void loop() { }
`,
  },
};

const pct = (d) => `${Math.round(d * 100)} %`;
/** Velocidad final (fracción) del modelo con ENA = valor/255 hacia adelante. */
const steady = (valor) => {
  let v = 0;
  for (let t = 0; t < 3000; t++) v = motorStep(v, 'adelante', valor / 255, 1);
  return v;
};

export const CHALLENGE = {
  title: 'Reto: rampa suave',
  summary: 'Siempre hacia adelante, sube la velocidad de 0 al máximo en 2 s, mantenla 1 s, bájala hasta 0 en 2 s y espera 1 s parado. Repite el ciclo.',
  criteria: [
    'ENA (D9) recibe PWM con analogWrite (unos 490 Hz).',
    'El % de ENA sigue el perfil: 0 → 100 % en 2 s, 100 % durante 1 s, 100 → 0 % en 2 s, 0 % durante 1 s (±8 puntos). La rampa empieza al arrancar.',
    'Sin saltos: ENA no cambia más de 15 puntos de una ventana de 20 ms a la siguiente.',
    'Dirección constante hacia adelante (IN1 HIGH, IN2 LOW) mientras ENA no está en 0.',
    'El motor modelado arranca, llega a su máximo y nunca gira hacia atrás.',
  ],
};

const example = (id) => exampleHtml(EXAMPLES, id);

export const STEPS = [
  {
    id: 'ena',
    short: 'ENA',
    title: 'Regular la velocidad con ENA',
    html: `
      <p>En la lección 9, ENA llevaba un <strong>puente</strong>: el canal estaba siempre habilitado al 100&nbsp;%. Si quitas el puente y llevas ENA a un pin con PWM (<strong>D9</strong>, marcado con «~»), <code>analogWrite(ENA, valor)</code> enciende y apaga el canal unas 490 veces por segundo. El motor recibe energía solo una parte del tiempo: cuanto mayor el valor, más rápido gira.</p>
      <table class="conn-table">
        <caption class="sr-only">Conexiones del circuito</caption>
        <thead><tr><th scope="col">L298N</th><th scope="col">Conexión</th></tr></thead>
        <tbody>
          <tr><td>IN1 / IN2</td><td>D7 / D8: el <strong>sentido</strong></td></tr>
          <tr><td>ENA (sin puente)</td><td>D9: la <strong>velocidad</strong> con PWM</td></tr>
          <tr><td>VS y GND</td><td>Batería 7–9&nbsp;V; GND del módulo unido al GND del Nano</td></tr>
        </tbody>
      </table>
      ${question('Si ENA queda en 0 (analogWrite(ENA, 0)) pero IN1 = HIGH e IN2 = LOW, ¿gira el motor?', 'No. Con ENA en 0 el canal está deshabilitado: el puente desconecta el motor (rueda libre) aunque IN1 e IN2 indiquen un sentido.')}
      ${goTo('#sim-panel', 'Ver el circuito')}`,
  },
  {
    id: 'zona-muerta',
    short: 'Zona muerta',
    title: 'La zona muerta',
    html: `
      <p>Ejecuta el código inicial. Con valores bajos el motor <strong>no llega a girar</strong>: el par que produce no vence el rozamiento del eje y los engranajes. Es la <strong>zona muerta</strong>. En el modelo del simulador está en el ${pct(MOTOR.deadZone)} de ENA (≈ ${Math.round(MOTOR.deadZone * 255)}); en un motor real depende del motor, la batería y la carga.</p>
      <table class="conn-table">
        <caption class="sr-only">Velocidad del motor modelado según ENA</caption>
        <thead><tr><th scope="col">analogWrite(ENA, …)</th><th scope="col">ENA</th><th scope="col">Motor modelado</th></tr></thead>
        <tbody>
          ${[60, 120, 255].map((v) => `<tr><td>${v}</td><td>${pct(v / 255)}</td><td>${Math.round(steady(v) * MOTOR.rpmMax)} rpm</td></tr>`).join('')}
        </tbody>
      </table>
      ${question('¿Por qué un robot necesita más de 60 para arrancar, aunque con 60 «llegue» algo de energía al motor?', 'Porque esa energía no basta para vencer el rozamiento: el motor se queda quieto y solo se calienta. Por debajo de la zona muerta conviene dejar ENA en 0.')}`,
  },
  {
    id: 'rampa',
    short: 'Rampa',
    title: 'Rampas suaves',
    html: `
      <p>Pasar de 0 a 255 de golpe provoca un pico de corriente y hace patinar las ruedas. Una <strong>rampa</strong> sube el valor poco a poco. Con un <code>for</code> de 0 a 255 hay 256 pasos: para tardar 2 s, cada paso dura unos 2000 / 256 ≈ <strong>8&nbsp;ms</strong>.</p>
      ${example('pasos')}
      ${example('calculo')}
      ${question('Si cada paso de la rampa dura 4 ms en lugar de 8 ms, ¿cuánto tarda la subida?', 'Más o menos la mitad: unos 1,0 s. El reto pide 2 s, así que el % medido de ENA iría por delante del perfil.')}
      ${goTo('#editor-zone', 'Ir al editor')}`,
  },
  {
    id: 'parar',
    short: 'Frenar o soltar',
    title: 'Freno y rueda libre',
    html: `
      <p>Hay dos formas de parar, y las dos son una <strong>orden</strong> instantánea, no una parada instantánea del eje:</p>
      <table class="conn-table">
        <caption class="sr-only">Formas de parar</caption>
        <thead><tr><th scope="col">Orden</th><th scope="col">Pines</th><th scope="col">Qué hace el eje (modelo)</th></tr></thead>
        <tbody>
          <tr><td>Freno</td><td>IN1 = IN2, ENA activo</td><td>Se detiene rápido (constante ${MOTOR.tauBrakeMs}&nbsp;ms)</td></tr>
          <tr><td>Rueda libre</td><td>ENA = 0</td><td>Sigue girando por inercia y se va parando (constante ${MOTOR.tauCoastMs}&nbsp;ms)</td></tr>
        </tbody>
      </table>
      <p>Durante la rampa, IN1 e IN2 no cambian: el sentido es siempre adelante. La rampa de bajada termina en ENA = 0: el motor queda en rueda libre.</p>
      ${question('Al terminar la bajada, la lectura «Motor» aún marca unas rpm. ¿Por qué?', 'Por la inercia: la orden ya es «libre», pero el eje sigue girando un poco hasta que el rozamiento lo detiene.')}`,
  },
  {
    id: 'reto',
    short: 'Reto',
    title: 'Resolver el reto',
    html: `
      ${challengeBox(CHALLENGE)}
      <ol>
        <li>Fija el sentido adelante en <code>setup()</code>.</li>
        <li>En <code>loop()</code>: rampa de subida, 1 s a tope, rampa de bajada y 1 s parado.</li>
        <li>Ejecuta, mira el % de D9 en la tira de pines y el motor, y pulsa <strong>Comprobar reto</strong>.</li>
      </ol>
      <p class="muted small">Solo <strong>Comprobar reto</strong> aprueba: compila tu código, lo ejecuta ${String(VELOCIDAD.durationMs / 1000).replace('.', ',')} segundos simulados y mide el PWM de D9 cada 20 ms, las órdenes de IN1 e IN2 y la respuesta del motor modelado. Si te atascas, pide una pista a Chispa.</p>
      ${goTo('#btn-check', 'Ir a Comprobar reto')}`,
  },
];

export const GOAL = 'regular la velocidad de un motor con PWM en ENA, conocer su zona muerta y su inercia, y acelerar y frenar con rampas suaves.';

export const SCOPE = [
  ...SCOPE_COMMON,
  'El PWM de D9 se mide por ventanas de 20 ms: % del tiempo en HIGH y frecuencia.',
  `El L298N y el motor son un modelo: el % de ENA se mide en cada periodo de los flancos reales; zona muerta ${pct(MOTOR.deadZone)}, ${MOTOR.rpmMax} rpm al 100 % y respuesta con inercia (${MOTOR.tauDriveMs} ms al acelerar, ${MOTOR.tauCoastMs} ms en rueda libre, ${MOTOR.tauBrakeMs} ms con freno).`,
  'Simplificaciones: velocidad proporcional al % de ENA por encima de la zona muerta, sin carga, sin caída de tensión del L298N ni límite de corriente. La batería y el GND común solo se representan en el diagrama.',
  'Todavía no: servos, robot completo ni librerías adicionales.',
];

// ---------- Guía Chispa ----------
const TOPICS = {
  'paso-0': { label: 'ENA', hints: [
    'IN1 e IN2 eligen el sentido; ENA, la velocidad.',
    'ENA está en D9, un pin con PWM: usa analogWrite(9, valor) con valores de 0 a 255.',
  ] },
  'paso-1': { label: 'la zona muerta', hints: [
    'Ejecuta el código inicial y mira la lectura «Motor» con cada valor.',
    'Con 60 el motor no gira: está por debajo de la zona muerta del modelo (30 %).',
  ] },
  'paso-2': { label: 'la rampa', hints: [
    'Un for puede cambiar el valor de 0 a 255 de 1 en 1.',
    'Para que la subida dure 2 s con 256 pasos, cada paso espera unos 8 ms.',
  ] },
  'paso-3': { label: 'parar', hints: [
    'ENA = 0 deja el motor en rueda libre; IN1 = IN2 lo frena.',
    'En este reto, IN1 e IN2 no cambian: solo cambia ENA.',
  ] },
  compilar: COMPILE_TOPIC,
  analogwrite: { label: 'el PWM de ENA', hints: [
    'Para regular la velocidad hace falta analogWrite, no digitalWrite.',
    'analogWrite(9, valor) con un valor entre 0 y 255: D9 es ENA.',
  ] },
  pin: { label: 'el pin de ENA', hints: [
    'ENA está conectado a D9.',
    'Revisa el número de pin de analogWrite: si escribes en otro pin, el canal sigue deshabilitado.',
  ] },
  sentido: { label: 'el sentido', hints: [
    'La rampa es siempre hacia adelante.',
    'Configura D7 y D8 como salidas y fija IN1 = HIGH e IN2 = LOW antes de la rampa.',
  ] },
  bucle: { label: 'la rampa', hints: [
    'El perfil sube, se mantiene, baja y descansa.',
    'Usa un for para subir de 0 a 255 y otro para bajar de 255 a 0, con una espera dentro de cada uno.',
  ] },
  perfil: { label: 'los tiempos del perfil', hints: [
    'Compara el % medido con el perfil en el detalle de la comprobación.',
    'Cada rampa dura 2 s: con pasos de 1, espera unos 8 ms en cada paso. Después, 1 s a tope y 1 s parado.',
  ] },
  suave: { label: 'la suavidad', hints: [
    'Hubo un salto brusco de ENA.',
    'No pases de 0 a 255 (ni de 255 a 0) de golpe: cambia el valor poco a poco.',
  ] },
  comprobar: { label: 'comprobar', hints: [
    'Tu código parece tener todas las piezas. Pulsa Comprobar reto: solo la medición de la simulación decide si está bien.',
    'Si la comprobación falla, revisa el primer punto marcado con ✗: muestra lo que se midió realmente.',
  ] },
  superado: { label: 'ir más allá', hints: [
    'Ya superaste el reto. Prueba a empezar la rampa desde el borde de la zona muerta (≈ 80) en vez de desde 0.',
    'Otra idea: haz que la bajada termine con freno (IN1 = IN2) y compara cuánto tarda el eje en parar.',
  ] },
};

/** Reglas locales sobre el código para orientar la pista. Nunca evalúa el reto. */
export function analyzeCode(code) {
  const src = strip(code);
  const delays = [...src.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
  const facts = { delays };
  if (!/analogWrite\s*\(/.test(src)) return { topic: 'analogwrite', facts };
  const pins = [...src.matchAll(/analogWrite\s*\(\s*(\w+)/g)].map((m) => m[1]);
  if (!pins.some((p) => p === '9' || p === 'ENA' || /^en/i.test(p))) return { topic: 'pin', facts };
  if ((src.match(/pinMode\s*\([^)]*OUTPUT/g) || []).length < 2) return { topic: 'sentido', facts };
  if (!/for\s*\(|millis\s*\(/.test(src)) return { topic: 'bucle', facts };
  return { topic: 'comprobar', facts };
}

const CHECK_TOPIC = { pwm: 'analogwrite', perfil: 'perfil', suave: 'suave', direccion: 'sentido', motor: 'perfil' };

export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const analysis = analyzeCode(ctx.code || '');
  if (ctx.untouched && Number.isInteger(ctx.step) && ctx.step < 4) return { topic: `paso-${ctx.step}`, facts: analysis.facts };
  const failed = ctx.lastChecks?.find((c) => !c.ok);
  if (failed && analysis.topic === 'comprobar') {
    if (failed.id === 'pwm' && /Hay PWM en/.test(failed.detail || '')) return { topic: 'pin', facts: analysis.facts };
    if (CHECK_TOPIC[failed.id]) return { topic: CHECK_TOPIC[failed.id], facts: analysis.facts };
  }
  if (ctx.completed && analysis.topic === 'comprobar') return { topic: 'superado', facts: {} };
  return analysis;
}

export const hintText = makeHintText(TOPICS);
export const TOPIC_IDS = Object.keys(TOPICS);

const CHECK_HINTS = {
  pwm: ['ENA está en D9 y necesita analogWrite con valores intermedios.',
    'Si ENA queda en 0 o en otro pin, el canal está deshabilitado y el motor queda libre.'],
  perfil: ['Compara el % medido con el que pide el perfil en el detalle.',
    'Subida y bajada de 2 s cada una (unos 8 ms por paso), 1 s a tope y 1 s parado.'],
  suave: ['El detalle dice cuándo saltó ENA y de cuánto a cuánto.',
    'Sustituye el salto por un for que cambie el valor poco a poco.'],
  direccion: ['Durante la rampa, IN1 = HIGH e IN2 = LOW.',
    'Revisa pinMode(7, OUTPUT) y pinMode(8, OUTPUT) y que no cambies IN1 ni IN2 dentro de la rampa.'],
  motor: ['El motor modelado debe llegar a su velocidad máxima: ENA al 100 % con sentido adelante.',
    'Revisa el detalle del perfil y de la dirección.'],
};

const help = createPreparedHelp({ hintText, checkHints: CHECK_HINTS, texts: {
  welcome: 'Hola, soy Chispa. Hoy controlarás la velocidad del motor con PWM en ENA. Pulsa Ejecutar y mira la lectura «Motor» con cada valor: ¿gira con 60? Si te atascas, pídeme una pista.',
  otherPins: (pins) => `Veo actividad en ${pins}, pero el L298N usa D7 (IN1), D8 (IN2) y D9 (ENA).`,
  evalPass: '¡Reto superado! ENA siguió la rampa con PWM, sin saltos, y el motor aceleró y frenó suavemente hacia adelante. Tu avance quedó guardado en este navegador.',
} });

export default {
  id: ID,
  numero: 10,
  tema: 'Puente H L298N y motores',
  titulo: 'Velocidad con ENA y PWM',
  corto: 'Velocidad con PWM',
  kicker: 'Lección 10 · Motores',
  previas: ['arduino-l298n-direccion', 'arduino-pwm-brillo'],
  baud: 9600,
  exampleCode: EXAMPLE_CODE,
  examples: EXAMPLES,
  steps: STEPS,
  challenge: CHALLENGE,
  html: () => renderLesson({ goal: GOAL, steps: STEPS, scope: SCOPE }),
  circuit: (root) => createMotorCircuit(root, { channels: VELOCIDAD_PINS }),
  pins: [CH.in1, CH.in2, CH.en],
  motors: { channels: VELOCIDAD_PINS },
  evaluation: {
    durationMs: VELOCIDAD.durationMs,
    evaluate: evaluateVelocidad,
    stimulus: { motors: { channels: VELOCIDAD_PINS } },
    note: 'La comprobación ejecuta tu programa 6,6 segundos simulados y mide el PWM de D9 (ENA) cada 20 ms, las órdenes de D7 y D8 y la respuesta del motor modelado.',
  },
  guide: { chooseTopic, hintText, help },
};
