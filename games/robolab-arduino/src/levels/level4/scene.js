// Vista superior del chasis de 2 ruedas con giro animado, flechas de sentido y RPM.
const WHEELS = { l: 30, r: 246 };
const stripes = (x) => Array.from({ length: 9 }, (_, i) =>
  `<rect x="${x}" y="${50 + i * 20}" width="44" height="8" fill="#5a6270"/>`).join('');
const wheel = (k) => `
  <clipPath id="l4-clip-${k}"><rect x="${WHEELS[k]}" y="60" width="44" height="130" rx="6"/></clipPath>
  <rect x="${WHEELS[k]}" y="60" width="44" height="130" rx="6" fill="#1b1f27" stroke="#8a9bb0" stroke-width="2"/>
  <g clip-path="url(#l4-clip-${k})"><g class="l4-tread" data-k="${k}">${stripes(WHEELS[k])}</g></g>
  <text class="l4-arrow" data-k="${k}" x="${WHEELS[k] + 22}" y="136" text-anchor="middle"></text>
  <text class="l4-rpm" x="${WHEELS[k] + 22}" y="206" text-anchor="middle">${k === 'l' ? 'IZQ.' : 'DER.'}</text>
  <text class="l4-rpm l4-rpm-v" data-k="${k}" x="${WHEELS[k] + 22}" y="222" text-anchor="middle">0 RPM</text>`;

export function createScene(host) {
  host.innerHTML = `<div class="l4-scene">
    <svg viewBox="0 0 320 240" class="l4-scene-svg" role="img" aria-label="Vista superior del robot de 2 ruedas">
      <line class="l4-floor" x1="10" y1="0" x2="10" y2="240"/><line class="l4-floor" x1="310" y1="0" x2="310" y2="240"/>
      <rect x="84" y="40" width="152" height="160" rx="16" fill="#2a3a52" stroke="#8a9bb0" stroke-width="2"/>
      <polygon points="160,24 144,44 176,44" fill="#ffd23f"/><text x="160" y="16" text-anchor="middle" class="l4-rpm">FRENTE</text>
      <rect x="100" y="56" width="120" height="30" rx="4" fill="#0e7490"/><text x="160" y="76" text-anchor="middle" class="l4-chip-t">Arduino Nano</text>
      <rect x="100" y="94" width="120" height="30" rx="4" fill="#a3202a"/><text x="160" y="114" text-anchor="middle" class="l4-chip-t">L298N</text>
      <rect x="100" y="132" width="120" height="30" rx="4" fill="#3b7d3b"/><text x="160" y="152" text-anchor="middle" class="l4-chip-t">2×18650 · 7.4 V</text>
      <text class="l4-state" x="160" y="184" text-anchor="middle">Detenido</text>
      ${wheel('l')}${wheel('r')}
    </svg>
    <p class="l4-scene-lock" role="status"></p></div>`;
  const $ = (s) => host.querySelector(s);
  const phase = { l: 0, r: 0, floor: 0 };
  const els = {};
  ['l', 'r'].forEach((k) => {
    els[k] = { tread: $(`.l4-tread[data-k="${k}"]`), arrow: $(`.l4-arrow[data-k="${k}"]`), rpm: $(`.l4-rpm-v[data-k="${k}"]`) };
  });
  const floors = host.querySelectorAll('.l4-floor');
  const SPEED = 0.6; // px por segundo por RPM

  return {
    /** Muestra RPM con signo y flecha de sentido (una vez por cambio). */
    setRpm(l, r, label) {
      [['l', l], ['r', r]].forEach(([k, v]) => {
        els[k].arrow.textContent = v > 0 ? '▲' : v < 0 ? '▼' : '';
        els[k].rpm.textContent = `${Math.abs(v)} RPM`;
      });
      $('.l4-state').textContent = label;
    },
    /** Avanza la animación dt segundos con las RPM firmadas actuales. */
    frame(dt, l, r) {
      phase.l = (phase.l + l * SPEED * dt) % 20;
      phase.r = (phase.r + r * SPEED * dt) % 20;
      phase.floor -= ((l + r) / 2) * SPEED * dt;
      els.l.tread.setAttribute('transform', `translate(0 ${phase.l < 0 ? phase.l + 20 : phase.l})`);
      els.r.tread.setAttribute('transform', `translate(0 ${phase.r < 0 ? phase.r + 20 : phase.r})`);
      floors.forEach((f) => f.style.strokeDashoffset = phase.floor.toFixed(1));
    },
    lock(text) {
      const el = $('.l4-scene');
      el.classList.toggle('is-locked', !!text);
      $('.l4-scene-lock').textContent = text || '';
    },
  };
}
