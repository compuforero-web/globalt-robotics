// Lección 14 · Integra los modelos existentes de sensor y motores con el mapa del robot.
import { exampleHtml, question, goTo, challengeBox, renderLesson, SCOPE_COMMON } from './view.js';
import { DECISION, EVASOR_PINS, decisionStimulus, evaluateDecision } from './evasor-eval.js';
import { createEvasorCircuit } from '../evasor-circuit.js';
import { COMPILE_TOPIC, makeHintText, createPreparedHelp } from '../guide.js';

export const ID = 'arduino-evasor-decision';
// El ejemplo solo mide: nunca arranca los motores por su cuenta ni entrega la solución del reto.
export const EXAMPLE_CODE = `// GLOBALT Robotics · Evasor en banco: primero comprueba el sensor.
const int TRIG = 7, ECHO = 8;
const int IN1 = 2, IN2 = 4, IN3 = 10, IN4 = 11;
const int ENA = 5, ENB = 6;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long eco = pulseIn(ECHO, HIGH, 30000);
  if (eco == 0) Serial.println("Sin eco: motores parados");
  else {
    Serial.print("Distancia: ");
    Serial.print(eco / 58);
    Serial.println(" cm");
  }
  delay(70);
}
`;
export const EXAMPLES = {
  estados: { title: 'Recordar una etapa con millis()', code: `// Ejemplo independiente: dos estados de un LED, no controla el evasor.
bool encendido = false;
unsigned long cambio = 0;
void setup() { pinMode(13, OUTPUT); }
void loop() {
  unsigned long ahora = millis();
  if (ahora - cambio >= 400) {
    cambio = ahora;
    encendido = !encendido;
    digitalWrite(13, encendido);
  }
}
` },
};
export const CHALLENGE = {
  title: 'Reto: leer, decidir y actuar',
  summary: 'Integra el sensor y los dos motores: avanza con el camino libre; ante un obstáculo, para, retrocede y gira hasta despejarlo. Sin eco, detente.',
  criteria: [
    'Mapa del evasor: TRIG D7, ECHO D8; IN1 D2, IN2 D4, IN3 D10, IN4 D11; ENA D5 y ENB D6.',
    'Con camino libre avanza. Al detectar 25 cm o menos, ordena parar los dos motores en ≤150 ms y mantén esa orden al menos 20 ms (tolerancia de medición: 1 ms).',
    'Después retrocede con ambos motores 300–500 ms, empezando dentro de los 300 ms siguientes a la aparición del obstáculo.',
    'Tras el retroceso, gira sobre sí mismo (ruedas en sentidos opuestos) en ≤50 ms. Mantén el giro hasta medir más de 40 cm; entonces avanza en ≤150 ms.',
    'Sigue midiendo durante todas las maniobras: TRIG ≥10 µs, separado entre 60 y 150 ms del siguiente disparo.',
    'Si no llega eco, ordena parar en ≤150 ms y continúa midiendo. EN debe superar el 30 % para que los ejes giren.',
  ],
};
export const STEPS = [
  { id: 'mapa', short: 'Conexiones', title: 'Un Nano, dos sistemas', html: `
    <p>Ahora el sensor y los motores trabajan juntos. <strong>D7 y D8 pertenecen al sensor</strong>: no puedes conservar los pines de sentido de las primeras prácticas de motores.</p>
    <table class="conn-table"><caption>Mapa del robot evasor</caption><thead><tr><th>Componente</th><th>Pines del Nano</th></tr></thead><tbody>
    <tr><td>HC-SR04</td><td>TRIG D7 · ECHO D8</td></tr>
    <tr><td>Motor izquierdo</td><td>IN1 D2 · IN2 D4 · ENA D5</td></tr>
    <tr><td>Motor derecho</td><td>IN3 D10 · IN4 D11 · ENB D6</td></tr>
    <tr><td>Alimentación</td><td>Nano por USB; sensor a 5 V; motor con batería 7–9 V; GND común</td></tr></tbody></table>
    <p>D9 queda reservado para un futuro servo. No alimentes los motores desde el Nano.</p>
    ${question('¿Qué ocurre si usas D7 para IN1 y también para TRIG?', 'Cada orden al motor dispararía el sensor y cada medida cambiaría el motor. Usa constantes con nombre y el mapa nuevo.')}${goTo('#sim-panel', 'Ver las dos vistas del circuito')}` },
  { id: 'medir', short: 'Leer', title: 'Comprueba el sensor antes de mover', html: `
    <p>Ejecuta el código inicial y mueve el control de distancia. Los motores se mantienen parados; el monitor muestra una lectura real de <code>pulseIn()</code>. El control cambia el obstáculo del modelo HC-SR04 y este genera el eco en D8.</p>
    <p>Un resultado 0 significa <strong>sin eco</strong>. No significa 0 cm ni infinito: ordena parar y vuelve a medir. Usa un tiempo máximo de 30000 µs.</p>
    ${question('¿Por qué no sirve avanzar siempre que la lectura sea 0?', 'No puedes distinguir un camino vacío de una medida que falló. Este reto usa parada segura ante la incertidumbre.')}` },
  { id: 'estados', short: 'Decidir', title: 'Recuerda la maniobra actual', html: `
    <p>Un único <code>if (distancia &gt; 25)</code> no basta: después del retroceso debes seguir girando incluso al medir 32 o 38 cm. Guarda un estado: avance, parada, retroceso o giro.</p>
    <p>Hay dos umbrales: <strong>25 cm para iniciar la evasión, más de 40 cm para terminarla</strong>. Esa separación evita alternar órdenes cerca del obstáculo.</p>
    ${question('Si estás girando y mides 32 cm, ¿avanzas?', 'No. Continúa girando hasta superar 40 cm; el umbral de 25 cm solo inicia la secuencia.')}` },
  { id: 'tiempo', short: 'Temporizar', title: 'Sigue leyendo mientras retrocedes', html: `
    <p>Guarda el instante de entrada al estado y compara <code>millis() - inicio</code>. No uses un <code>delay(400)</code> para el retroceso: dejarías de medir durante 400 ms.</p>
    ${exampleHtml(EXAMPLES, 'estados')}
    <p>Organiza funciones para avanzar, frenar, retroceder y girar. Para girar sobre sí mismo, una rueda va adelante y la otra atrás; puedes elegir cualquiera de los dos sentidos.</p>
    <p>La comprobación mide la <strong>orden eléctrica</strong> de parada, no que el eje se detenga instantáneamente. El motor conserva su inercia.</p>` },
  { id: 'probar', short: 'Probar', title: 'Prueba el banco antes del reto', html: `
    <p>Pulsa <strong>Reproducir guion del reto</strong>: el obstáculo pasa por distancias lejanas, cercanas, intermedias y un tramo sin eco. Observa las órdenes y los ejes de ambos motores.</p>
    <p>Las ruedas están al aire: <strong>este banco no tiene pista ni movimiento del robot</strong>. Aquí validas decisiones; el recorrido completo será la siguiente lección.</p>
    <p>Puedes imprimir el estado y la distancia para depurar. El monitor ayuda, pero los mensajes no sustituyen las señales de los motores ni son un requisito de aprobación.</p>${goTo('#btn-run', 'Ir a Ejecutar')}` },
  { id: 'reto', short: 'Reto', title: 'Integra tu programa', html: `${challengeBox(CHALLENGE)}
    <p>La comprobación ejecuta tu programa 7,9 segundos simulados. Debe reaccionar a dos obstáculos y a la ausencia de eco. Leer los pasos, pedir pistas o guardar no aprueba el reto.</p>${goTo('#btn-check', 'Comprobar mi programa')}` },
];
const HINTS = {
  pines: ['El mapa del sensor y el de los motores no pueden compartir pines.', 'D7/D8 son TRIG/ECHO. Los IN son D2, D4, D10 y D11; ENA/ENB son D5/D6.'],
  sensor: ['El robot debe seguir tomando medidas mientras actúa.', 'Evita esperas largas: mide cada 60–150 ms y usa un timeout de hasta 30000 µs.'],
  avanzar: ['Compara el estado actual con la nueva distancia.', 'Tras superar 40 cm, termina el giro y vuelve a avanzar sin esperar otra maniobra.'],
  parada: ['Antes del retroceso debe existir una orden de parada para ambos motores.', 'Usa un estado de parada de al menos 20 ms. Un motor frenado y el otro avanzando no es una parada.'],
  retroceso: ['Guarda cuándo empieza el retroceso.', 'Compara millis() con ese instante. Debe durar entre 300 y 500 ms sin dejar de medir.'],
  giro: ['El giro depende del estado y del nuevo eco.', 'Mientras gires, una distancia intermedia no termina la evasión: debes superar 40 cm.'],
  'sin-eco': ['Un timeout no demuestra que el camino esté libre.', 'Comprueba el valor de pulseIn antes de convertirlo a cm y da una orden de parada a ambos motores.'],
  motores: ['Mira las lecturas de los dos ejes, no solo la orden del puente.', 'Un EN bajo no vence la zona muerta. Prueba velocidades moderadas, por encima de 77 de 255.'],
  comprobar: ['Prueba primero los casos de lejos, cerca y sin eco.', 'Pulsa Comprobar reto y revisa el primer punto que falle. Solo el programa emulado decide el resultado.'],
  superado: ['Ya integraste lectura, decisiones y motores.', 'Experimenta con el sentido del giro sin cambiar los umbrales. El robot en pista será una lección posterior.'],
};
const TOPICS = Object.fromEntries(Object.entries(HINTS).map(([id, hints]) => [id, { label: id.replace('-', ' '), hints }]));
TOPICS.compilar = COMPILE_TOPIC;
export const hintText = makeHintText(TOPICS);
export function chooseTopic(ctx = {}) {
  if (ctx.compileError) return { topic: 'compilar', facts: ctx.compileError };
  const fail = ctx.lastChecks?.find((c) => !c.ok);
  if (fail) return { topic: fail.id in TOPICS ? fail.id : 'comprobar', facts: {} };
  if (ctx.completed) return { topic: 'superado', facts: {} };
  const topics = ['pines', 'sensor', 'giro', 'retroceso', 'comprobar', 'comprobar'];
  return { topic: topics[ctx.step] || 'comprobar', facts: {} };
}
const help = createPreparedHelp({ hintText, checkHints: HINTS, texts: {
  welcome: 'Hola, soy Chispa. Vamos a unir el sensor y los motores. Primero verifica el mapa de pines; después construye las decisiones sin dejar de medir.',
  otherPins: (pins) => `Hay actividad en ${pins}. Comprueba el mapa completo del banco antes de cambiar conexiones.`,
  evalPass: '¡Reto superado! Tu programa reaccionó a los obstáculos y a la falta de eco usando el sensor y ambos motores. El resultado queda guardado en este navegador.',
} });
export default {
  id: ID, numero: 14, tema: 'Robot evasor', titulo: 'Evasor: decidir ante un obstáculo', corto: 'Evasor en banco',
  kicker: 'Lección 14 · Robot evasor', previas: ['arduino-ultrasonico-alerta', 'arduino-l298n-dos-motores'], baud: 9600,
  exampleCode: EXAMPLE_CODE, examples: EXAMPLES, steps: STEPS, challenge: CHALLENGE,
  html: () => renderLesson({ goal: 'integrar sensor y motores mediante estados, con respuesta rápida y parada segura sin eco.', steps: STEPS,
    scope: [...SCOPE_COMMON, 'Dos vistas del mismo Nano y los modelos HC-SR04/L298N ya utilizados. Los motores responden a los pines reales del HEX.',
      'Banco con ruedas al aire: no se simula una pista. La distancia la cambia el control o el guion.',
      'Se conserva el modelo didáctico de motor: zona muerta del 30 % e inercia, sin carga ni corriente. La alimentación se representa en el diagrama.',
      'La cuenta guarda el código; superar el reto solo se registra en este navegador.'] }),
  circuit: createEvasorCircuit, pins: [2, 4, 5, 6, 7, 10, 11], sonar: { trig: 7, echo: 8 }, motors: { channels: EVASOR_PINS },
  evaluation: { durationMs: DECISION.durationMs, evaluate: evaluateDecision, stimulus: decisionStimulus(),
    note: 'Se ejecuta tu HEX 7,9 s: dos obstáculos, distancias intermedias, despejes y un tramo sin eco; se miden TRIG/ECHO y ambos motores.' },
  guide: { chooseTopic, hintText, help },
};
