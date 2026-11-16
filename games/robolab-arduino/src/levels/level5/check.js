// Validación estricta del ensamblaje completo (potencia, 5V, GND común y pines).
export const PINS = [
  ...Array.from({ length: 14 }, (_, i) => `D${i}`),
  ...Array.from({ length: 8 }, (_, i) => `A${i}`),
];
export const PWM = ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'];
export const PIN_ROLES = [
  ['trig', 'Trig', 'HC-SR04'], ['echo', 'Echo', 'HC-SR04'], ['servo', 'Señal del Servo (PWM)', 'Servo SG90'],
  ['in1', 'IN1', 'L298N'], ['in2', 'IN2', 'L298N'], ['in3', 'IN3', 'L298N'], ['in4', 'IN4', 'L298N'],
  ['ena', 'ENA (PWM)', 'L298N'], ['enb', 'ENB (PWM)', 'L298N'],
];
const NEEDS_PWM = ['servo', 'ena', 'enb'];
const GND_MSG = {
  gnd_l298n: ['L298N', 'Sin GND común con el Nano: IN1–IN4 y ENA/ENB no tienen referencia y los motores no obedecen.'],
  gnd_servo: ['Servo SG90', 'Sin GND común: la señal PWM no tiene referencia, el servo tiembla o no se mueve.'],
  gnd_hc: ['HC-SR04', 'Sin GND común: Echo no se puede leer y pulseIn() devuelve 0 (siempre "400 cm").'],
};

function checkPower(w, err) {
  const { bat_pos: p, bat_neg: n } = w;
  let battOk = false;
  if (!p || !n) err('Baterías 18650', 'Falta conectar el + o el − de las baterías: el robot no tiene energía.');
  else if (p === 'lgnd' && n === 'l12') err('L298N', 'Polaridad invertida: el + entra por GND y el − por 12V. Se dañan el regulador y el chip del puente H.');
  else if (p === 'n5') err('Arduino Nano', '7.4V directos al pin 5V: el Nano (máx. 5V) se quema al instante.');
  else if (p === n) err('Baterías 18650', 'Ambos polos van al mismo borne: no hay circuito, el L298N queda sin potencia.');
  else battOk = true;
  const src = [w.nano_pwr === 'l5', w.servo_vcc === 'l5', w.hc_vcc === 'l5'].some(Boolean);
  if (src && !battOk) err('L298N', 'Sin baterías bien conectadas el regulador del L298N no entrega 5V.');
  if (!w.nano_pwr) err('Arduino Nano', 'El Nano no tiene alimentación: no ejecuta el programa.');
  else if (w.nano_pwr === 'bat5') err('Arduino Nano', 'Batería 7.4V directa al pin 5V: se quema. Usa VIN o el 5V del L298N.');
  for (const [k, name] of [['servo_vcc', 'Servo SG90'], ['hc_vcc', 'HC-SR04']]) {
    const v = w[k];
    if (!v) err(name, 'Sin alimentación de 5V: el componente no enciende.');
    else if (v === 'bat') err(name, '7.4V lo destruyen: su máximo es 5V.');
    else if (v === 'n33') err(name, name === 'Servo SG90' ? 'Con 3.3V el servo no tiene torque y se reinicia el Nano.' : 'Con 3.3V el HC-SR04 mide mal o no responde.');
    else if (v === 'n5' && !w.nano_pwr) err(name, 'El pin 5V del Nano no tiene voltaje porque el Nano no está alimentado.');
  }
  for (const k of Object.keys(GND_MSG)) if (w[k] !== 'gc') err(...GND_MSG[k]);
}

function checkPins(w, err) {
  const used = {};
  for (const [k, label, part] of PIN_ROLES) {
    const pin = w[k];
    if (!pin) { err(part, `Falta asignar el pin de ${label}.`); continue; }
    (used[pin] ||= []).push([label, part]);
    if (pin === 'D0' || pin === 'D1') err(part, `${label} en ${pin}: son los pines seriales (RX/TX); chocan con el USB y la carga del programa falla.`);
    if (pin === 'A6' || pin === 'A7') err(part, `${label} en ${pin}: A6/A7 son solo entradas analógicas, no pueden hacer digitalWrite ni PWM.`);
    if (NEEDS_PWM.includes(k) && !PWM.includes(pin) && !['D0', 'D1', 'A6', 'A7'].includes(pin)) {
      err(part, `${label} en ${pin}: no tiene PWM (~). Usa D3, D5, D6, D9, D10 o D11; sin PWM no controlas ${k === 'servo' ? 'el ángulo' : 'la velocidad'}.`);
    }
  }
  for (const [pin, roles] of Object.entries(used)) {
    if (roles.length > 1) err(roles.map((r) => r[1]).filter((v, i, a) => a.indexOf(v) === i).join(' / '), `Conflicto: ${roles.map((r) => r[0]).join(' y ')} comparten ${pin}. Un pin solo maneja una señal a la vez.`);
  }
}

/** Devuelve la lista de fallos [{ part, msg }]; vacía = ensamblaje correcto. */
export function validate(w) {
  const errors = [];
  const err = (part, msg) => errors.push({ part, msg });
  checkPower(w, err);
  checkPins(w, err);
  return errors;
}
