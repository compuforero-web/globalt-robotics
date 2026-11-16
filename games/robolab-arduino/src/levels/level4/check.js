// Reglas de evaluación del cableado del Nivel 4 (lógica pura, sin DOM).
export const PWM_PINS = [3, 5, 6, 9, 10, 11];
export const DIGITAL_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const CTRL = ['in1', 'in2', 'in3', 'in4', 'ena', 'enb'];
export const NAMES = { in1: 'IN1', in2: 'IN2', in3: 'IN3', in4: 'IN4', ena: 'ENA', enb: 'ENB' };

export const GND_MSG = '🔌 Falta el GND común: los motores NO responden. Las señales del Arduino '
  + '(IN1–IN4, ENA, ENB) son voltajes medidos respecto al GND del Nano. Si el GND del L298N no está '
  + 'unido al del Nano, no comparten el "0 V" de referencia y el L298N no puede saber si una señal es '
  + 'HIGH o LOW. Une GND del L298N con GND del Nano.';

export const emptyState = () => ({
  batP: '', batN: '', l1: '', l2: '', r1: '', r2: '',
  in1: '', in2: '', in3: '', in4: '', ena: '', enb: '', gnd: '',
});

const isPair = (a, b, x, y) => a !== b && [a, b].every((o) => o === x || o === y);

/** Devuelve { status: 'ok' | 'nognd' | 'bad', errors, pins }. */
export function evaluate(s) {
  const errors = [];
  if (!s.batP || !s.batN) {
    errors.push('Falta conectar el paquete 2×18650 (7.4 V): el positivo (+) a 12V y el negativo (−) a GND.');
  } else if (s.batP === 'GND' && s.batN === '12V') {
    errors.push('⚡ Polaridad invertida: el + de la batería está en GND y el − en 12V. Esto puede dañar el '
      + 'L298N. El positivo (+) va a 12V y el negativo (−) a GND.');
  } else if (s.batP !== '12V' || s.batN !== 'GND') {
    errors.push('Baterías mal ubicadas: + a 12V y − a GND. La bornera 5V es una salida del regulador, '
      + 'no una entrada.');
  }

  if (![s.l1, s.l2, s.r1, s.r2].every(Boolean)) {
    errors.push('Faltan cables de motor: cada motor DC tiene 2 cables y cada uno va a un borne OUT.');
  } else {
    if (!isPair(s.l1, s.l2, 'OUT1', 'OUT2')) errors.push('El Motor Izquierdo va a OUT1 y OUT2 (un cable en cada borne).');
    if (!isPair(s.r1, s.r2, 'OUT3', 'OUT4')) errors.push('El Motor Derecho va a OUT3 y OUT4 (un cable en cada borne).');
  }

  const missing = CTRL.filter((k) => !s[k]);
  if (missing.length) errors.push(`Falta conectar ${missing.map((k) => NAMES[k]).join(', ')} a pines del Arduino Nano.`);
  const used = CTRL.filter((k) => s[k]);
  const dups = [...new Set(used.filter((k, i) => used.findIndex((j) => s[j] === s[k]) !== i).map((k) => `D${s[k]}`))];
  if (dups.length) errors.push(`Pin repetido (${dups.join(', ')}): cada señal necesita su propio pin del Nano.`);
  for (const k of ['ena', 'enb']) {
    if (s[k] && !PWM_PINS.includes(Number(s[k]))) {
      errors.push(`${NAMES[k]} está en D${s[k]}, que NO tiene PWM (~). Para regular velocidad con analogWrite usa D3, D5, D6, D9, D10 o D11.`);
    }
  }

  let noGnd = false;
  if (s.gnd === '5V') errors.push('Unir GND con 5V es un error: el 5V no es referencia. Debes unir GND con GND.');
  else if (s.gnd !== 'GND') { noGnd = true; errors.push(GND_MSG); }

  const only = errors.length === 1 && noGnd;
  const status = errors.length === 0 ? 'ok' : only ? 'nognd' : 'bad';
  const pins = Object.fromEntries(CTRL.map((k) => [k, Number(s[k])]));
  return { status, errors, pins };
}
