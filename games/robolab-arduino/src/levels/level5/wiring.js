// Fase 1: formulario de conexiones + validación con retroalimentación por componente.
import { PINS, PIN_ROLES, validate } from './check.js';

const SRC5 = [['n5', 'Pin 5V del Nano'], ['l5', 'Salida 5V del L298N'], ['n33', 'Pin 3.3V del Nano'], ['bat', 'Batería + (7.4V)']];
const GND = [['gc', 'Riel GND común (Nano)'], ['aislado', 'Sin conectar']];
const GROUPS = [
  ['Potencia (baterías 18650)', [
    ['bat_pos', 'Batería + (rojo)', [['l12', 'Borne 12V del L298N'], ['lgnd', 'Borne GND del L298N'], ['n5', 'Pin 5V del Nano']]],
    ['bat_neg', 'Batería − (negro)', [['lgnd', 'Borne GND del L298N'], ['l12', 'Borne 12V del L298N']]],
  ]],
  ['Alimentación 5V', [
    ['nano_pwr', 'Arduino Nano', [['l5', '5V del L298N → pin 5V'], ['vin', '12V del L298N → VIN'], ['bat5', 'Batería + → pin 5V']]],
    ['servo_vcc', 'Servo (cable rojo)', SRC5],
    ['hc_vcc', 'HC-SR04 (VCC)', SRC5],
  ]],
  ['GND común', [
    ['gnd_l298n', 'GND del L298N', GND], ['gnd_servo', 'Servo (cable marrón)', GND], ['gnd_hc', 'HC-SR04 (GND)', GND],
  ]],
  ['Pines de señal', PIN_ROLES.map(([k, label, part]) => [k, `${label} · ${part}`, PINS.map((p) => [p, p])])],
];
const opt = (o) => o.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

export function mountWiring(host, { onState }) {
  const w = {};
  host.innerHTML = `<p class="l5-hint">Conecta cada cable. Los pines D0/D1 (serial) y A6/A7 (solo lectura analógica) están disponibles a propósito: ¡elige con cuidado!</p>
    ${GROUPS.map(([title, rows]) => `<fieldset class="l5-group"><legend>${title}</legend>${rows.map(([k, label, o]) =>
    `<label class="l5-row"><span>${label}</span><select data-k="${k}"><option value="">— elegir —</option>${opt(o)}</select></label>`).join('')}</fieldset>`).join('')}
    <div class="l5-actions"><button type="button" class="l5-btn-primary" data-check>Verificar ensamblaje</button></div>
    <div class="l5-msg" role="status" aria-live="polite"></div>`;
  const msg = host.querySelector('.l5-msg');
  let ok = false;

  const run = (show) => {
    const errors = validate(w);
    const nowOk = errors.length === 0;
    if (show) {
      msg.className = `l5-msg ${nowOk ? 'is-ok' : 'is-err'}`;
      msg.innerHTML = nowOk
        ? '✔ Ensamblaje correcto: potencia, 5V, GND común y pines sin conflictos.'
        : `<p>En la vida real esto fallaría:</p><ul>${errors.map((e) => `<li><strong>${e.part}:</strong> ${e.msg}</li>`).join('')}</ul>`;
    }
    if (nowOk !== ok) { ok = nowOk; onState(ok, w); } else if (nowOk && show) onState(true, w);
    return nowOk;
  };
  host.addEventListener('change', (e) => {
    if (e.target.dataset.k) { w[e.target.dataset.k] = e.target.value; if (ok) run(true); }
  });
  host.querySelector('[data-check]').addEventListener('click', () => run(true));
  return w;
}
