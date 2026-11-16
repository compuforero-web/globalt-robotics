// Ilustración original del circuito: Nano compatible, resistencia de 220 Ω y LED en D13.
const DIGITAL = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export function createCircuit(root) {
  root.innerHTML = `
  <svg class="circuit" viewBox="0 0 360 230" role="img" aria-labelledby="circuit-title circuit-desc">
    <title id="circuit-title">Circuito de la lección</title>
    <desc id="circuit-desc">Arduino Nano compatible: D13 conectado a una resistencia de 220 ohmios, luego al ánodo de un LED; el cátodo va a GND.</desc>
    <rect x="20" y="70" width="200" height="86" rx="8" class="c-pcb"/>
    <rect x="6" y="99" width="22" height="28" rx="3" class="c-usb"/>
    <rect x="92" y="98" width="44" height="30" rx="3" class="c-chip"/>
    <text x="114" y="117" class="c-chip-txt" text-anchor="middle">328P</text>
    <text x="176" y="118" class="c-label" text-anchor="middle">NANO</text>
    <g class="c-onboard"><rect x="56" y="104" width="12" height="7" rx="2" class="c-l"/><text x="62" y="124" class="c-tiny" text-anchor="middle">L</text></g>
    ${DIGITAL.map((pin, i) => `<g><circle cx="${40 + i * 15}" cy="82" r="3.4" class="c-hole ${pin === 13 ? 'is-used' : ''}"/>
      <text x="${40 + i * 15}" y="96" class="c-tiny" text-anchor="middle">${pin}</text></g>`).join('')}
    <circle cx="40" cy="144" r="3.4" class="c-hole is-used"/><text x="40" y="136" class="c-tiny" text-anchor="middle">GND</text>
    <text x="34" y="66" class="c-pin-name">D13</text>
    <path d="M40 82 V30 H120" class="c-wire c-wire--sig"/>
    <g transform="translate(120 22)"><rect width="56" height="16" rx="6" class="c-res"/>
      <rect x="12" y="0" width="4" height="16" class="c-band1"/><rect x="21" y="0" width="4" height="16" class="c-band1"/>
      <rect x="30" y="0" width="4" height="16" class="c-band2"/><rect x="44" y="0" width="3" height="16" class="c-band3"/></g>
    <text x="148" y="14" class="c-small" text-anchor="middle">220 Ω</text>
    <path d="M176 30 H286 V84" class="c-wire c-wire--sig"/>
    <g class="c-led" transform="translate(286 104)">
      <circle r="30" class="c-glow"/>
      <path d="M-13 6 V-10 a13 13 0 0 1 26 0 V6 z" class="c-led-body"/>
      <rect x="-16" y="6" width="32" height="5" rx="2" class="c-led-rim"/>
      <line x1="-5" y1="11" x2="-5" y2="40" class="c-leg"/><line x1="5" y1="11" x2="5" y2="32" class="c-leg"/>
    </g>
    <text x="300" y="80" class="c-tiny">ánodo +</text>
    <text x="300" y="148" class="c-tiny">cátodo −</text>
    <path d="M291 136 V196 H40 V144" class="c-wire c-wire--gnd"/>
  </svg>
  <div class="pin-strip" aria-label="Estado de los pines digitales">
    ${[...Array(14).keys()].map((p) => `<span class="pin-dot" data-pin="${p}" title="D${p}">D${p}</span>`).join('')}
  </div>`;
  const led = root.querySelector('.c-led');
  const onboard = root.querySelector('.c-onboard');
  const dots = new Map([...root.querySelectorAll('.pin-dot')].map((d) => [Number(d.dataset.pin), d]));
  return {
    setPin(pin, high) {
      dots.get(pin)?.classList.toggle('is-high', high);
      if (pin === 13) {
        led.classList.toggle('is-on', high);
        onboard.classList.toggle('is-on', high);
        led.setAttribute('aria-label', high ? 'LED encendido' : 'LED apagado');
      }
    },
    resetPins() { for (const pin of dots.keys()) this.setPin(pin, false); },
  };
}
