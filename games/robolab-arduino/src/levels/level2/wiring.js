// Paso 2: reto de cableado del SG90 al Nano (o fuente externa 5V con GND común) con validación real.
const CABLES = [
  { id: 'gnd', name: 'Marrón (GND)', color: '#7c4a21' },
  { id: 'vcc', name: 'Rojo (VCC)', color: '#d62828' },
  { id: 'sig', name: 'Naranja (Señal)', color: '#f77f00' },
];

const NANO = ['5V', '3V3', 'VIN', 'GND', 'D2', 'D3~', 'D9~', 'D10~', 'A0', 'A6', 'A7'];
const EXT = ['EXT+5V', 'EXT-GND'];
const LABEL = { 'EXT+5V': '+5V', 'EXT-GND': 'GND' };

const isV5 = (p) => p === '5V' || p === 'EXT+5V';
const isGnd = (p) => p === 'GND' || p === 'EXT-GND';
const isPower = (p) => isV5(p) || p === '3V3' || p === 'VIN';
const isDigital = (p) => /^D\d+/.test(p) || /^A[0-5]$/.test(p);

/** Devuelve { ok, msg, pin?, supply? } según las conexiones actuales. */
export function validate(conn, commonGnd) {
  const { gnd, vcc, sig } = conn;
  if (!gnd || !vcc || !sig) return { ok: false, msg: 'Faltan cables por conectar: cada uno de los 3 cables necesita un destino.' };
  if (isGnd(vcc) && isPower(gnd)) {
    return { ok: false, msg: '⚡ Polaridad invertida: VCC y GND están intercambiados. La corriente circula al revés por el circuito de control del servo y puede quemarlo.' };
  }
  if (isPower(sig)) {
    return { ok: false, msg: '⚠ Señal conectada a una línea de alimentación: el servo recibe un nivel alto constante, no pulsos, y no sabe qué ángulo tomar.' };
  }
  if (isGnd(sig)) return { ok: false, msg: '⚠ Señal conectada a GND: el cable naranja queda siempre en 0 V y nunca llegan pulsos PWM.' };
  if (sig === 'A6' || sig === 'A7') {
    return { ok: false, msg: '🚫 A6 y A7 del Nano son solo entradas analógicas: no tienen circuito de salida digital y no pueden generar pulsos. Usa D9~ u otro pin digital.' };
  }
  if (vcc === '3V3') return { ok: false, msg: '🔋 3.3 V es poco para el SG90 (necesita 4.8–6 V) y ese regulador solo entrega unos 50 mA.' };
  if (vcc === 'VIN') return { ok: false, msg: '🔥 VIN puede tener 7–12 V (la entrada de la batería): supera los 6 V máximos del servo.' };
  if (!isV5(vcc)) return { ok: false, msg: `🔋 El rojo en ${vcc} no sirve: un pin de señal da como máximo ~20–40 mA y el servo puede pedir 650 mA. El rojo va a 5V.` };
  if (!isGnd(gnd)) return { ok: false, msg: `El cable marrón es la tierra: debe ir a GND, no a ${gnd}.` };
  if (!isDigital(sig)) return { ok: false, msg: 'La señal debe ir a un pin digital (D2–D13 o A0–A5 usados como digitales).' };
  const usesExt = vcc === 'EXT+5V' || gnd === 'EXT-GND';
  if (usesExt && !commonGnd) {
    return { ok: false, msg: '🔗 Falta el GND común: sin unir el GND de la fuente con el GND del Nano, el pulso no tiene referencia y el servo tiembla o no responde.' };
  }
  const supply = vcc === 'EXT+5V' ? 'externa' : 'nano';
  const tip = supply === 'nano'
    ? 'Funciona con un solo servo. Para varios, usa fuente externa (lee la nota de energía).'
    : 'Excelente práctica: fuente externa para la potencia y GND común para la señal.';
  return { ok: true, msg: `✅ ¡Circuito correcto! Señal en ${sig}. ${tip}`, pin: sig.replace(/[~]/, ''), supply };
}

/** Monta el reto. `onResult(result)` se llama tras cada comprobación. */
export function mountWiring(host, onResult) {
  const conn = { gnd: null, vcc: null, sig: null };
  let active = 'gnd';
  host.innerHTML = `
    <p class="l2-hint">1) Toca un cable · 2) toca el pin de destino. Usa el pin <b>5V</b> del Nano o una <b>fuente externa</b>.</p>
    <div class="l2-cables"></div>
    <div class="l2-dests">
      <fieldset><legend>Arduino Nano (compatible)</legend><div class="l2-pins" data-group="nano"></div></fieldset>
      <fieldset><legend>Fuente externa 5V · 2A</legend><div class="l2-pins" data-group="ext"></div>
        <label class="l2-check"><input type="checkbox" class="l2-common"> Unir GND de la fuente con GND del Nano</label>
      </fieldset>
    </div>
    <div class="l2-actions">
      <button type="button" class="l2-btn-primary l2-verify">Comprobar circuito</button>
      <button type="button" class="l2-btn l2-clear">Desconectar todo</button>
    </div>
    <p class="l2-feedback" aria-live="polite"></p>`;

  const $ = (s) => host.querySelector(s);
  const pinBtn = (p) => `<button type="button" class="l2-pin" data-pin="${p}">${LABEL[p] || p}</button>`;
  $('[data-group="nano"]').innerHTML = NANO.map(pinBtn).join('');
  $('[data-group="ext"]').innerHTML = EXT.map(pinBtn).join('');

  function render() {
    $('.l2-cables').innerHTML = CABLES.map((c) => `
      <button type="button" class="l2-cable ${active === c.id ? 'is-active' : ''}" data-cable="${c.id}" style="--wire:${c.color}">
        <span class="l2-dot" style="background:${c.color}"></span>${c.name}
        <small>→ ${conn[c.id] ? (LABEL[conn[c.id]] ? `Fuente ${LABEL[conn[c.id]]}` : conn[c.id]) : 'sin conectar'}</small>
      </button>`).join('');
    host.querySelectorAll('.l2-pin').forEach((b) => {
      const owner = CABLES.find((c) => conn[c.id] === b.dataset.pin);
      b.style.setProperty('--wire', owner ? owner.color : 'transparent');
      b.classList.toggle('is-wired', !!owner);
    });
  }

  host.addEventListener('click', (e) => {
    const cable = e.target.closest('[data-cable]');
    if (cable) { active = cable.dataset.cable; render(); return; }
    const pin = e.target.closest('[data-pin]');
    if (pin && active) {
      CABLES.forEach((c) => { if (conn[c.id] === pin.dataset.pin) conn[c.id] = null; });
      conn[active] = pin.dataset.pin;
      const next = CABLES.find((c) => !conn[c.id]);
      active = next ? next.id : active;
      render();
    }
  });

  $('.l2-verify').addEventListener('click', () => {
    const r = validate(conn, $('.l2-common').checked);
    const fb = $('.l2-feedback');
    fb.textContent = r.msg;
    fb.className = `l2-feedback ${r.ok ? 'is-ok' : 'is-error'}`;
    onResult(r);
  });

  $('.l2-clear').addEventListener('click', () => {
    Object.keys(conn).forEach((k) => { conn[k] = null; });
    active = 'gnd';
    $('.l2-feedback').textContent = '';
    render();
    onResult({ ok: false });
  });

  render();
}
