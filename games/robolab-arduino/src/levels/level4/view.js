// Panel de tabla de verdad activa + código C++ con las líneas ejecutadas resaltadas.
import { ACTIONS, ORDER, codeLines } from './truth.js';

export function mountView(host) {
  host.innerHTML = `
    <div class="l4-tt-wrap"><table class="l4-tt"></table></div>
    <p class="l4-pwm" aria-live="polite"></p>
    <pre class="l4-code" aria-label="Código C++ del robot"></pre>`;
  const table = host.querySelector('.l4-tt');
  const pwmEl = host.querySelector('.l4-pwm');
  const code = host.querySelector('.l4-code');
  let last = null;

  function update(action, p, pwm, powered) {
    const cell = (v) => `<td class="${v ? 'hi' : 'lo'}">${v ? 'HIGH' : 'LOW'}</td>`;
    table.innerHTML = `<thead>
      <tr><th rowspan="2">Maniobra</th><th colspan="2">Motor izq.</th><th colspan="2">Motor der.</th></tr>
      <tr>${[1, 2, 3, 4].map((i) => `<th>IN${i}<small>D${p['in' + i]}</small></th>`).join('')}</tr></thead>
      <tbody>${['stop', ...ORDER].map((k) =>
    `<tr class="${k === action ? 'is-active' : ''}"><th scope="row">${ACTIONS[k].label}</th>${ACTIONS[k].ins.map(cell).join('')}</tr>`).join('')}</tbody>`;
    const v = action === 'brake' ? 255 : action === 'stop' ? 0 : pwm;
    pwmEl.innerHTML = `<code>analogWrite(ENA, ${v})</code> y <code>analogWrite(ENB, ${v})</code> → ciclo de trabajo
      <b>${Math.round((v / 255) * 100)} %</b>${powered ? '' : ' (⚠ sin efecto: el cableado no está completo)'}`;
    const top = code.scrollTop;
    code.innerHTML = codeLines(action, p, pwm).map((l) =>
      `<span class="l4-ln${l.tag && l.tag === action ? ' is-active' : ''}">${l.t || ' '}</span>`).join('\n');
    if (action !== last) {
      const first = code.querySelector('.is-active');
      code.scrollTop = first ? Math.max(first.offsetTop - 8, 0) : 0;
      last = action;
    } else code.scrollTop = top;
  }
  return { update };
}
