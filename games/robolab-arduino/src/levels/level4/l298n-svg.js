// SVG propio y genérico de un módulo puente H dual "tipo L298N" (sin marcas ni imágenes externas).
const NS = 'http://www.w3.org/2000/svg';

const screw = (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="#cfd6e0" stroke="#7b8594" stroke-width="2"/>
  <line x1="${x - 8}" y1="${y - 4}" x2="${x + 8}" y2="${y + 4}" stroke="#555" stroke-width="3"/>`;
const silk = (x, y, t, a = 'middle') => `<text x="${x}" y="${y}" text-anchor="${a}" class="l4-silk">${t}</text>`;

const hl = (x, y, w, h) => `<rect class="l4-hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`;

const fins = Array.from({ length: 8 }, (_, i) =>
  `<rect x="${120 + i * 15}" y="46" width="8" height="94" rx="2" fill="#2b2b33"/>`).join('');

const PARTS = {
  heatsink: ['Chip L298N y disipador', `
    <rect x="108" y="26" width="144" height="124" rx="6" fill="#141418" stroke="#000" stroke-width="2"/>
    ${fins}<rect x="108" y="26" width="144" height="18" rx="6" fill="#d63a3a"/>
    ${silk(180, 40, 'DISIPADOR', 'middle').replace('l4-silk', 'l4-silk l4-silk-sm')}
    ${silk(180, 98, 'L298N')}${hl(104, 22, 152, 132)}`],
  outA: ['Salida Motor Izquierdo (OUT1, OUT2)', `
    <rect x="28" y="46" width="46" height="88" rx="4" fill="#2f6fd0" stroke="#153a7a" stroke-width="2"/>
    ${screw(51, 74)}${screw(51, 110)}${silk(80, 78, 'OUT1', 'start')}${silk(80, 114, 'OUT2', 'start')}
    ${silk(51, 152, 'MOTOR IZQ.')}${hl(22, 40, 90, 124)}`],
  outB: ['Salida Motor Derecho (OUT3, OUT4)', `
    <rect x="286" y="46" width="46" height="88" rx="4" fill="#2f6fd0" stroke="#153a7a" stroke-width="2"/>
    ${screw(309, 74)}${screw(309, 110)}${silk(280, 78, 'OUT3', 'end')}${silk(280, 114, 'OUT4', 'end')}
    ${silk(309, 152, 'MOTOR DER.')}${hl(248, 40, 90, 124)}`],
  power: ['Bornera de potencia (12V, GND, 5V)', `
    <rect x="100" y="174" width="160" height="46" rx="4" fill="#2f6fd0" stroke="#153a7a" stroke-width="2"/>
    ${screw(135, 197)}${screw(180, 197)}${screw(225, 197)}
    ${silk(135, 168, '12V')}${silk(180, 168, 'GND')}${silk(225, 168, '5V')}${hl(94, 156, 172, 68)}`],
  ctrl: ['Pines de control (ENA, IN1–IN4, ENB)', `
    <rect x="42" y="238" width="276" height="26" rx="3" fill="#111"/>
    ${['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].map((n, i) =>
    `${silk(72 + i * 43.5, 232, n)}<circle cx="${72 + i * 43.5}" cy="251" r="6" fill="#e6c15a"/>`).join('')}
    ${hl(36, 216, 288, 52)}`],
};

export const PART_IDS = Object.keys(PARTS);

/** Dibuja el módulo; onPick(id) se llama al tocar una parte. Devuelve { select(id) }. */
export function createL298nSvg(host, onPick) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 360 280');
  svg.setAttribute('class', 'l4-board');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Módulo puente H L298N. Toca cada parte para aprender.');
  svg.innerHTML = `<rect x="6" y="6" width="348" height="268" rx="14" fill="#a3202a" stroke="#5e0f15" stroke-width="3"/>
    ${[[22, 22], [338, 22], [22, 258], [338, 258]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#2a0a0d"/>`).join('')}
    ${PART_IDS.map((id) => `<g class="l4-part" data-part="${id}" tabindex="0" role="button" aria-label="${PARTS[id][0]}">${PARTS[id][1]}</g>`).join('')}`;
  host.appendChild(svg);

  const groups = [...svg.querySelectorAll('.l4-part')];
  const select = (id) => groups.forEach((g) => g.classList.toggle('is-selected', g.dataset.part === id));
  groups.forEach((g) => {
    g.addEventListener('click', () => onPick(g.dataset.part));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g.dataset.part); }
    });
  });
  return { select };
}
