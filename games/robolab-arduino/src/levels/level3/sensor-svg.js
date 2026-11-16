// SVG propio (generado por código) del módulo ultrasónico genérico HC-SR04.
const PINS = [['VCC', 118], ['Trig', 146], ['Echo', 174], ['GND', 202]];

function transducer(part, cx, label, name) {
  return `
    <g class="l3-part" data-part="${part}" tabindex="0" role="button" aria-label="${name}">
      <circle class="l3-ring" cx="${cx}" cy="78" r="44" />
      <circle cx="${cx}" cy="78" r="44" fill="#c9d1d9" stroke="#6b7682" stroke-width="3" />
      <circle cx="${cx}" cy="78" r="35" fill="url(#l3-mesh)" stroke="#4a525b" stroke-width="2" />
      <circle cx="${cx}" cy="78" r="35" fill="none" stroke="#9aa4ae" stroke-width="1" />
      <text x="${cx - 52}" y="40" class="l3-silk">${label}</text>
    </g>`;
}

function pin([name, x]) {
  return `
    <g class="l3-part" data-part="${name}" tabindex="0" role="button" aria-label="Pin ${name}">
      <rect x="${x - 11}" y="128" width="22" height="58" fill="transparent" />
      <rect x="${x - 6}" y="140" width="12" height="10" fill="#1b1b1b" />
      <rect x="${x - 2}" y="150" width="4" height="32" fill="#d8b44a" />
      <text x="${x}" y="134" text-anchor="middle" class="l3-silk l3-silk-sm">${name}</text>
    </g>`;
}

/** Dibuja el sensor y avisa con onPick(part) al tocar una pieza. */
export function createSensorSvg(host, onPick) {
  host.innerHTML = `
    <svg viewBox="0 0 320 192" class="l3-sensor" role="group" aria-label="Sensor ultrasónico HC-SR04">
      <defs>
        <pattern id="l3-mesh" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#2c3238" />
          <circle cx="3" cy="3" r="1.5" fill="#6d7680" />
        </pattern>
      </defs>
      <rect x="10" y="14" width="300" height="128" rx="8" fill="#1f5fa8" stroke="#123f73" stroke-width="3" />
      <circle cx="22" cy="26" r="5" fill="#0d2c52" /><circle cx="298" cy="26" r="5" fill="#0d2c52" />
      <circle cx="22" cy="130" r="5" fill="#0d2c52" /><circle cx="298" cy="130" r="5" fill="#0d2c52" />
      <text x="160" y="118" text-anchor="middle" class="l3-silk">HC-SR04</text>
      ${transducer('T', 78, 'T', 'Transductor emisor T')}
      ${transducer('R', 242, 'R', 'Transductor receptor R')}
      <g class="l3-part" data-part="crystal" tabindex="0" role="button" aria-label="Cristal de cuarzo">
        <rect x="136" y="30" width="48" height="22" rx="11" fill="#dfe5ea" stroke="#7d8793" stroke-width="2" />
        <rect x="142" y="36" width="36" height="10" rx="5" fill="#b9c2ca" />
        <text x="160" y="66" text-anchor="middle" class="l3-silk l3-silk-sm">cristal</text>
      </g>
      ${PINS.map(pin).join('')}
    </svg>`;
  const svg = host.querySelector('svg');
  const parts = [...svg.querySelectorAll('.l3-part')];
  const pick = (e) => {
    const g = e.target.closest('.l3-part');
    if (g) onPick(g.dataset.part);
  };
  svg.addEventListener('click', pick);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); }
  });
  return {
    select(part) {
      parts.forEach((g) => g.classList.toggle('is-selected', g.dataset.part === part));
    },
  };
}
