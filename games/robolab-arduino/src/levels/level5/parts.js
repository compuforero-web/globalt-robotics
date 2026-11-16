// Los 5 componentes del robot, dibujados como SVG propio (sin imágenes externas).
const T = (x, y, s, c = '#fff') => `<text x="${x}" y="${y}" text-anchor="middle" fill="${c}" font-size="10" font-weight="700">${s}</text>`;
const tile = (x, y, w, h, label, body) => `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="10" class="l5-tile"/>${body}${T(w / 2, h - 8, label, 'currentColor')}</g>`;

export function partsSvg() {
  const nano = `<rect x="22" y="10" width="56" height="32" rx="3" fill="#1d4ed8"/><rect x="40" y="18" width="14" height="14" fill="#222"/>${T(50, 54, 'Nano', '#fff')}`;
  const servo = `<rect x="22" y="14" width="46" height="26" rx="3" fill="#2563eb"/><rect x="68" y="22" width="12" height="10" fill="#ccc"/><circle cx="76" cy="27" r="3" fill="#555"/>${T(45, 54, 'SG90', '#fff')}`;
  const hc = `<rect x="14" y="10" width="72" height="34" rx="3" fill="#0e7490"/><circle cx="34" cy="27" r="11" fill="#cbd5e1"/><circle cx="66" cy="27" r="11" fill="#cbd5e1"/>${T(50, 54, 'HC-SR04', '#fff')}`;
  const l298 = `<rect x="16" y="8" width="68" height="40" rx="3" fill="#b91c1c"/><rect x="34" y="12" width="32" height="14" fill="#444"/><circle cx="26" cy="38" r="5" fill="#222"/><circle cx="74" cy="38" r="5" fill="#222"/>${T(50, 58, 'L298N + 2 motores', '#fff')}`;
  const bat = `<rect x="26" y="10" width="20" height="40" rx="4" fill="#16a34a"/><rect x="54" y="10" width="20" height="40" rx="4" fill="#16a34a"/>${T(36, 34, '+')}${T(64, 34, '+')}`;
  return `<svg class="l5-parts-svg" viewBox="0 0 330 150" role="img" aria-label="Componentes: Arduino Nano, servo SG90, sensor HC-SR04, puente H L298N y baterías 18650">
    ${tile(0, 0, 100, 66, 'Arduino Nano', nano)}
    ${tile(110, 0, 100, 66, 'Microservo (cabeza)', servo)}
    ${tile(220, 0, 100, 66, 'Sonar sobre el servo', hc)}
    ${tile(0, 76, 160, 66, 'Puente H L298N', l298.replace('translate', 'translate'))}
    ${tile(170, 76, 150, 66, 'Pack 2×18650 · 7.4V', bat)}
  </svg>`;
}
