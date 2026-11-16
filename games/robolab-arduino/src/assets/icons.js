// Iconos SVG generados por código: 100% propios, libres de derechos.
const svg = (body, vb = '0 0 64 64') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

const pins = (x0, y, n, step) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${x0 + i * step}" cy="${y}" r="1.6" fill="#f5c542"/>`).join('');

export const ICONS = {
  board: svg(`<rect x="8" y="18" width="48" height="28" rx="3" fill="#1f6fb2"/>
    <rect x="26" y="26" width="12" height="12" rx="1" fill="#14202f"/>
    <rect x="4" y="27" width="8" height="10" rx="1" fill="#b8c2cc"/>
    ${pins(14, 21, 9, 5)}${pins(14, 43, 9, 5)}`),
  servo: svg(`<rect x="12" y="22" width="34" height="24" rx="3" fill="#2b74c7"/>
    <circle cx="22" cy="34" r="7" fill="#e8edf2"/>
    <rect x="20" y="14" width="34" height="6" rx="3" fill="#f2f4f6" transform="rotate(-25 22 34)"/>
    <path d="M46 40 C54 40 54 50 60 50" stroke="#e67e22" stroke-width="2" fill="none"/>`),
  sonar: svg(`<rect x="6" y="22" width="52" height="22" rx="2" fill="#1e7d4f"/>
    <circle cx="20" cy="33" r="8" fill="#c9d1d9"/><circle cx="20" cy="33" r="4" fill="#3a4450"/>
    <circle cx="44" cy="33" r="8" fill="#c9d1d9"/><circle cx="44" cy="33" r="4" fill="#3a4450"/>
    <path d="M24 12 Q32 6 40 12 M20 8 Q32 0 44 8" stroke="#7fd1ff" stroke-width="2" fill="none"/>`),
  motor: svg(`<rect x="8" y="14" width="30" height="36" rx="2" fill="#c0392b"/>
    <rect x="14" y="20" width="18" height="14" fill="#2d2d2d"/>
    <circle cx="48" cy="32" r="12" fill="#2d2d2d"/><circle cx="48" cy="32" r="5" fill="#f5c542"/>
    <path d="M48 20 V44 M36 32 H60" stroke="#555" stroke-width="2"/>`),
  robot: svg(`<rect x="14" y="26" width="36" height="22" rx="4" fill="#1f6fb2"/>
    <rect x="22" y="12" width="20" height="10" rx="2" fill="#1e7d4f"/>
    <circle cx="27" cy="17" r="3" fill="#c9d1d9"/><circle cx="37" cy="17" r="3" fill="#c9d1d9"/>
    <rect x="30" y="22" width="4" height="4" fill="#2b74c7"/>
    <circle cx="20" cy="50" r="7" fill="#2d2d2d"/><circle cx="44" cy="50" r="7" fill="#2d2d2d"/>`),
  lock: svg(`<rect x="16" y="28" width="32" height="24" rx="4" fill="currentColor"/>
    <path d="M22 28 V20 a10 10 0 0 1 20 0 V28" stroke="currentColor" stroke-width="5" fill="none"/>`),
  check: svg(`<circle cx="32" cy="32" r="26" fill="#2ecc71"/>
    <path d="M20 33 l8 8 l16 -18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>`),
  logo: svg(`<rect x="10" y="20" width="44" height="30" rx="8" fill="#2b74c7"/>
    <circle cx="24" cy="35" r="5" fill="#7fd1ff"/><circle cx="40" cy="35" r="5" fill="#7fd1ff"/>
    <path d="M32 20 V10" stroke="#f5c542" stroke-width="3"/><circle cx="32" cy="9" r="4" fill="#f5c542"/>`),
};
