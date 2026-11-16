// SVG propio (generado por código) de un microservo genérico tipo SG90, vista superior en corte.
const NS = 'http://www.w3.org/2000/svg';
const CX = 150, CY = 140; // eje de salida
const SPEED = 360; // °/s de la animación (el SG90 real ronda 600 °/s sin carga)

const WIRES = [
  { part: 'gnd', color: '#7c4a21', y: 166, label: 'GND' },
  { part: 'vcc', color: '#d62828', y: 174, label: '5V' },
  { part: 'sig', color: '#f77f00', y: 182, label: 'PWM' },
];

function ticks() {
  let out = '';
  for (let a = 0; a <= 180; a += 15) {
    const r = (a * Math.PI) / 180, big = a % 90 === 0;
    const x1 = CX + Math.cos(r) * 92, y1 = CY - Math.sin(r) * 92;
    const x2 = CX + Math.cos(r) * (big ? 80 : 86), y2 = CY - Math.sin(r) * (big ? 80 : 86);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return out;
}

const ACCESSORIES = {
  horn: `<rect x="-8" y="-7" width="72" height="14" rx="7" fill="#f8fafc" stroke="#475569"/>
    <circle cx="20" cy="0" r="2.4" fill="#94a3b8"/><circle cx="36" cy="0" r="2.4" fill="#94a3b8"/>
    <circle cx="52" cy="0" r="2.4" fill="#94a3b8"/>`,
  barrier: `<rect x="-8" y="-6" width="100" height="12" rx="3" fill="#f8fafc" stroke="#475569"/>
    <g fill="#d62828"><rect x="14" y="-6" width="10" height="12"/><rect x="36" y="-6" width="10" height="12"/>
    <rect x="58" y="-6" width="10" height="12"/><rect x="80" y="-6" width="10" height="12"/></g>`,
  radar: `<path d="M0 0 L90 -22 A92 92 0 0 1 90 22 Z" fill="#22c55e" opacity=".28"/>
    <rect x="-8" y="-5" width="60" height="10" rx="5" fill="#f8fafc" stroke="#475569"/>
    <circle cx="56" cy="0" r="9" fill="#16a34a" stroke="#14532d"/>`,
};

/** Crea el SVG en `host`. `onPart(part)` se llama al tocar una pieza. */
export function createServoSvg(host, onPart) {
  host.innerHTML = `
  <svg class="l2-servo" viewBox="0 0 330 232" role="img" aria-label="Microservo SG90 con brazo móvil y tres cables">
    <g class="l2-dial" stroke="#64748b" stroke-width="1.5" fill="none">
      <path d="M${CX - 92} ${CY} A92 92 0 0 1 ${CX + 92} ${CY}" stroke-dasharray="3 4"/>${ticks()}
    </g>
    <g font-size="11" fill="currentColor" text-anchor="middle">
      <text x="${CX + 100}" y="${CY - 10}">0°</text><text x="${CX}" y="${CY - 98}">90°</text>
      <text x="${CX - 102}" y="${CY - 10}">180°</text>
    </g>
    <g data-part="case" class="l2-hit">
      <rect x="96" y="148" width="22" height="22" rx="3" fill="#1e5fa8"/>
      <rect x="252" y="148" width="22" height="22" rx="3" fill="#1e5fa8"/>
      <circle cx="107" cy="159" r="4" fill="#0b1f3a"/><circle cx="263" cy="159" r="4" fill="#0b1f3a"/>
      <rect x="114" y="116" width="142" height="80" rx="8" fill="#2f7bd1" opacity=".55" stroke="#1e5fa8" stroke-width="2"/>
      <text x="230" y="208" font-size="10" fill="currentColor" text-anchor="middle">carcasa</text>
    </g>
    <g data-part="motor" class="l2-hit">
      <rect x="206" y="124" width="42" height="34" rx="6" fill="#cbd5e1" stroke="#475569"/>
      <text x="227" y="145" font-size="11" text-anchor="middle" fill="#0f172a">M</text>
    </g>
    <g data-part="gears" class="l2-hit" fill="#fde68a" stroke="#a16207">
      <circle cx="184" cy="150" r="13" stroke-dasharray="3 2" stroke-width="3"/>
      <circle cx="${CX}" cy="${CY}" r="20" stroke-dasharray="4 2" stroke-width="3"/>
    </g>
    <g data-part="pot" class="l2-hit">
      <circle cx="134" cy="178" r="11" fill="#a3e635" stroke="#3f6212"/>
      <path d="M134 178 L134 169" stroke="#3f6212" stroke-width="2"/>
    </g>
    <g data-part="pcb" class="l2-hit">
      <rect x="168" y="168" width="40" height="22" rx="2" fill="#15803d" stroke="#14532d"/>
      <rect x="180" y="173" width="14" height="10" fill="#0f172a"/>
    </g>
    ${WIRES.map((w, i) => `
    <g data-part="${w.part}" class="l2-hit l2-wire">
      <path d="M256 ${w.y} C275 ${w.y} 280 ${200 + i * 8} 300 ${200 + i * 8}" stroke="transparent" stroke-width="16" fill="none"/>
      <path d="M256 ${w.y} C275 ${w.y} 280 ${200 + i * 8} 300 ${200 + i * 8}" stroke="${w.color}" stroke-width="4.5" fill="none"/>
      <text x="304" y="${203 + i * 8}" font-size="8" fill="currentColor">${w.label}</text>
    </g>`).join('')}
    <rect x="292" y="194" width="9" height="26" rx="1" fill="#0f172a"/>
    <g class="l2-horn" data-part="horn" transform="rotate(-90 ${CX} ${CY})">
      <g class="l2-acc" transform="translate(${CX} ${CY})">${ACCESSORIES.horn}</g>
      <circle cx="${CX}" cy="${CY}" r="7" fill="#e2e8f0" stroke="#475569"/>
    </g>
    <text class="l2-angle-label" x="20" y="24" font-size="15" font-weight="700" fill="currentColor">90°</text>
  </svg>`;

  const svg = host.querySelector('svg');
  const horn = svg.querySelector('.l2-horn');
  const label = svg.querySelector('.l2-angle-label');
  let current = 90, target = 90, raf = 0, last = 0;

  svg.addEventListener('pointerup', (e) => {
    const g = e.target.closest('[data-part]');
    if (!g) return;
    svg.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
    g.classList.add('is-selected');
    onPart?.(g.dataset.part);
  });

  function draw() {
    horn.setAttribute('transform', `rotate(${-current} ${CX} ${CY})`);
    label.textContent = `${Math.round(current)}°`;
  }

  function frame(t) {
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    const diff = target - current, step = SPEED * dt;
    current = Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;
    draw();
    raf = current === target ? 0 : requestAnimationFrame(frame);
    if (!raf) last = 0;
  }

  return {
    /** Gira suavemente hacia `deg` (0–180). */
    setAngle(deg) {
      target = Math.min(180, Math.max(0, deg));
      if (!raf) raf = requestAnimationFrame(frame);
    },
    setAccessory(kind) {
      svg.querySelector('.l2-acc').innerHTML = ACCESSORIES[kind] || ACCESSORIES.horn;
    },
    select(part) {
      svg.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
      svg.querySelector(`[data-part="${part}"]`)?.classList.add('is-selected');
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}
