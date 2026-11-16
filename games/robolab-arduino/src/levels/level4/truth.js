// Tabla de verdad, física de motores y código C++ generado según el cableado.
export const FN = { fwd: 'avanzar', back: 'retroceder', left: 'girarIzquierda', right: 'girarDerecha', brake: 'frenar' };
export const ACTIONS = {
  stop: { label: 'Detenido', ins: [0, 0, 0, 0] },
  fwd: { label: 'Avanzar', ins: [1, 0, 1, 0] },
  back: { label: 'Retroceder', ins: [0, 1, 0, 1] },
  left: { label: 'Girar izq.', ins: [0, 1, 1, 0] },
  right: { label: 'Girar der.', ins: [1, 0, 0, 1] },
  brake: { label: 'Frenar', ins: [1, 1, 1, 1] },
};
export const ORDER = ['fwd', 'back', 'left', 'right', 'brake'];
export const DEFAULT_PINS = { ena: 9, in1: 4, in2: 5, in3: 6, in4: 7, enb: 10 };
export const MAX_RPM = 200;
export const MIN_PWM = 40; // por debajo, el motor zumba pero no vence la fricción

export const rpmOf = (pwm) => (pwm < MIN_PWM ? 0 : Math.round((pwm / 255) * MAX_RPM));
const dir = (a, b) => (a && !b ? 1 : !a && b ? -1 : 0);

/** Sentido de cada motor: 1 adelante, -1 atrás, 0 parado/frenado. */
export function motors(action) {
  const [a, b, c, d] = ACTIONS[action].ins;
  return { l: dir(a, b), r: dir(c, d) };
}

export function codeLines(action, p, pwm) {
  const L = [];
  const add = (t, tag = '') => L.push({ t, tag });
  add('// Pines según tu cableado');
  add(`const int ENA = ${p.ena}, IN1 = ${p.in1}, IN2 = ${p.in2};`);
  add(`const int ENB = ${p.enb}, IN3 = ${p.in3}, IN4 = ${p.in4};`);
  add('');
  add('void setup() {');
  add('  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);');
  add('  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);');
  add('}');
  add('');
  add('void loop() {');
  add(action === 'stop' ? '  // elige una maniobra' : `  ${FN[action]}(${action === 'brake' ? '' : pwm});`, action);
  add('}');
  ORDER.forEach((k) => {
    const brake = k === 'brake';
    add('');
    add(`void ${FN[k]}(${brake ? '' : 'int v'}) {`, k);
    ACTIONS[k].ins.forEach((v, i) => add(`  digitalWrite(IN${i + 1}, ${v ? 'HIGH' : 'LOW'});`, k));
    add(`  analogWrite(ENA, ${brake ? 255 : 'v'});`, k);
    add(`  analogWrite(ENB, ${brake ? 255 : 'v'});`, k);
    add('}', k);
  });
  return L;
}
