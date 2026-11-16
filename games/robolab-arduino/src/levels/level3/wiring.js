// Reto de cableado HC-SR04 → Arduino Nano: tocar pin del sensor y luego pin del Nano.
const SENSOR = [['VCC', '#d64545'], ['Trig', '#e8a317'], ['Echo', '#2a9d8f'], ['GND', '#555']];
const POWER = ['5V', '3V3', 'VIN', 'GND'];
const NANO = [...POWER, ...Array.from({ length: 14 }, (_, i) => `D${i}`),
  ...Array.from({ length: 8 }, (_, i) => `A${i}`)];

function signalError(name, pin) {
  if (pin === '5V' || pin === 'VIN' || pin === '3V3') {
    return name === 'Trig'
      ? `Trig en ${pin}: queda siempre en HIGH; Arduino no puede generar el pulso de 10 µs.`
      : `Echo en ${pin}: la salida del sensor choca con la alimentación (cortocircuito) y Arduino no lee nada.`;
  }
  if (pin === 'GND') {
    return name === 'Trig'
      ? 'Trig en GND: queda siempre en LOW; el sensor nunca recibe la orden de disparo.'
      : 'Echo en GND: cuando el sensor ponga Echo en HIGH habrá un cortocircuito a tierra.';
  }
  if (pin === 'A6' || pin === 'A7') {
    return name === 'Trig'
      ? `Trig en ${pin}: A6/A7 son solo de entrada analógica; no pueden funcionar como salida digital.`
      : `Echo en ${pin}: A6/A7 solo admiten analogRead(); pulseIn() no funciona en ellos.`;
  }
  if (pin === 'D0' || pin === 'D1') {
    return `${name} en ${pin}: D0/D1 son RX/TX del Monitor Serie; interferirías la comunicación.`;
  }
  return null;
}

export function validate(m) {
  if (SENSOR.some(([n]) => !m[n])) return { ok: false, errs: ['Faltan cables: conecta los 4 pines.'] };
  const errs = [];
  if (m.VCC === 'GND' && m.GND === '5V') {
    errs.push('⚡ VCC y GND invertidos: polaridad al revés, puedes quemar el sensor.');
  } else {
    if (m.VCC === '3V3') errs.push('VCC en 3V3: el HC-SR04 necesita 5 V para medir bien.');
    else if (m.VCC === 'VIN') errs.push('VCC en VIN: VIN es la entrada sin regular; usa la salida 5V.');
    else if (m.VCC === 'GND') errs.push('VCC en GND: el sensor no recibe energía.');
    else if (m.VCC !== '5V') errs.push(`VCC en ${m.VCC}: un pin de señal no es fuente de alimentación; usa 5V.`);
    if (m.GND !== 'GND') errs.push(`GND en ${m.GND}: la tierra del sensor debe ir a GND del Nano.`);
  }
  ['Trig', 'Echo'].forEach((n) => { const e = signalError(n, m[n]); if (e) errs.push(e); });
  if (m.Trig === m.Echo && !POWER.includes(m.Trig)) errs.push('Trig y Echo no pueden compartir el mismo pin.');
  const num = (p) => (p.startsWith('D') ? p.slice(1) : p);
  return errs.length ? { ok: false, errs } : { ok: true, errs, trig: num(m.Trig), echo: num(m.Echo) };
}

export function mountWiring(host, onResult) {
  host.innerHTML = `
    <p class="l3-hint">1) Toca un pin del sensor. 2) Toca el pin del Arduino Nano al que va el cable.</p>
    <div class="l3-wire-sensor"></div>
    <div class="l3-wire-nano" role="group" aria-label="Pines del Arduino Nano"></div>
    <div class="l3-actions">
      <button type="button" class="l3-btn-primary" data-act="check">Comprobar cableado</button>
      <button type="button" class="l3-btn" data-act="reset">Quitar cables</button>
    </div>
    <div class="l3-msg" aria-live="polite"></div>`;
  const $ = (s) => host.querySelector(s);
  let map = {};
  let sel = 'VCC';
  let wasOk = false;

  function render() {
    $('.l3-wire-sensor').innerHTML = SENSOR.map(([n, c]) => `
      <button type="button" class="l3-wire-pin ${sel === n ? 'is-sel' : ''}" data-s="${n}" style="--c:${c}">
        <span class="l3-dot"></span><b>${n}</b><span>→ ${map[n] || '…'}</span>
      </button>`).join('');
    $('.l3-wire-nano').innerHTML = NANO.map((p) => {
      const owner = SENSOR.find(([n]) => map[n] === p);
      const style = owner ? `style="--c:${owner[1]}"` : '';
      return `<button type="button" class="l3-npin ${owner ? 'is-used' : ''}" data-n="${p}" ${style}>${p}</button>`;
    }).join('');
  }

  function invalidate() {
    $('.l3-msg').innerHTML = '';
    $('.l3-msg').className = 'l3-msg';
    if (wasOk) { wasOk = false; onResult({ ok: false }); }
  }

  host.addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]');
    const n = e.target.closest('[data-n]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (s) { sel = s.dataset.s; render(); return; }
    if (n && sel) {
      map[sel] = n.dataset.n;
      sel = SENSOR.map(([k]) => k).find((k) => !map[k]) || null;
      invalidate(); render(); return;
    }
    if (act === 'reset') { map = {}; sel = 'VCC'; invalidate(); render(); return; }
    if (act === 'check') {
      const r = validate(map);
      const msg = $('.l3-msg');
      msg.className = `l3-msg ${r.ok ? 'is-ok' : 'is-err'}`;
      msg.innerHTML = r.ok
        ? `✔ ¡Perfecto! Trig en ${map.Trig} (OUTPUT) y Echo en ${map.Echo} (INPUT). Simulación desbloqueada.`
        : `<ul>${r.errs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
      wasOk = r.ok;
      onResult(r);
    }
  });
  render();
}
