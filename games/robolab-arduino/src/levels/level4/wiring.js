// Reto de cableado: Potencia + Motores + Control + GND común.
import { DIGITAL_PINS, PWM_PINS, emptyState, evaluate } from './check.js';

const POWER = [['12V', 'Bornera 12V'], ['GND', 'Bornera GND'], ['5V', 'Bornera 5V']];
const OUTS = ['OUT1', 'OUT2', 'OUT3', 'OUT4'].map((o) => [o, o]);
const PINS = DIGITAL_PINS.map((p) => [String(p), `D${p}${PWM_PINS.includes(p) ? '~' : ''}`]);
const GNDS = [['GND', 'GND del Nano'], ['5V', '5V del Nano']];

const GROUPS = [
  ['⚡ Potencia · baterías 2×18650 (7.4 V)', [
    ['batP', 'Batería + (rojo) →', POWER], ['batN', 'Batería − (negro) →', POWER]]],
  ['⚙️ Motores DC', [
    ['l1', 'Motor izq. cable 1 →', OUTS], ['l2', 'Motor izq. cable 2 →', OUTS],
    ['r1', 'Motor der. cable 1 →', OUTS], ['r2', 'Motor der. cable 2 →', OUTS]]],
  ['🎛️ Control · pines del Nano (~ = PWM)', [
    ['in1', 'IN1 →', PINS], ['in2', 'IN2 →', PINS], ['in3', 'IN3 →', PINS], ['in4', 'IN4 →', PINS],
    ['ena', 'ENA (velocidad) →', PINS], ['enb', 'ENB (velocidad) →', PINS]]],
  ['🔗 Referencia común', [['gnd', 'GND del L298N →', GNDS]]],
];

const select = ([key, label, opts]) => `
  <label class="l4-row"><span>${label}</span>
    <select data-k="${key}"><option value="">— sin conectar —</option>
      ${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;

/** onResult recibe el resultado de evaluate() o { status: 'pending' } si el estudiante cambia algo. */
export function mountWiring(host, onResult) {
  host.innerHTML = `
    <p class="l4-hint">Elige a dónde va cada cable. Reglas: el + de las baterías a <b>12V</b>, motores
      a <b>OUT1–OUT4</b>, <b>IN1–IN4</b> a pines digitales, <b>ENA/ENB</b> a pines con PWM (~) y el
      <b>GND del L298N unido al GND del Nano</b>.</p>
    ${GROUPS.map(([t, rows]) => `<fieldset class="l4-group"><legend>${t}</legend>${rows.map(select).join('')}</fieldset>`).join('')}
    <div class="l4-actions"><button type="button" class="l4-btn-primary">Comprobar cableado</button></div>
    <div class="l4-msg" role="status" aria-live="polite"></div>`;
  const msg = host.querySelector('.l4-msg');
  const state = emptyState();

  host.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    state[k] = e.target.value;
    msg.className = 'l4-msg';
    msg.innerHTML = '';
    onResult({ status: 'pending' });
  });

  host.querySelector('.l4-btn-primary').addEventListener('click', () => {
    const res = evaluate(state);
    if (res.status === 'ok') {
      msg.className = 'l4-msg is-ok';
      msg.textContent = '✔ Cableado correcto: potencia, motores, control y GND común. ¡Prueba las maniobras!';
    } else {
      msg.className = 'l4-msg is-err';
      msg.innerHTML = `<ul>${res.errors.map((e) => `<li>${e}</li>`).join('')}</ul>`;
    }
    onResult(res);
  });
}
