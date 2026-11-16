// Reto de cableado: mini-protoboard con LED y resistencia de 220Ω.
import { analyze } from './circuit.js';

const NODES = {
  D2: { x: 98, y: 40, label: 'D2' },
  D3: { x: 98, y: 80, label: 'D3~' },
  D5: { x: 98, y: 120, label: 'D5~' },
  D13: { x: 98, y: 160, label: 'D13' },
  '5V': { x: 98, y: 200, label: '5V' },
  GND: { x: 98, y: 240, label: 'GND' },
  A: { x: 300, y: 150, label: 'Ánodo +' },
  K: { x: 360, y: 150, label: 'Cátodo −' },
  R1: { x: 270, y: 225, label: 'R' },
  R2: { x: 430, y: 225, label: 'R' },
};
const COLORS = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
const key = (a, b) => [a, b].sort().join('|');

function wireColor(w, i) {
  if (w.includes('GND')) return '#1f2937';
  if (w.includes('5V')) return '#dc2626';
  return COLORS[i % COLORS.length];
}

function staticSvg() {
  const pins = ['D2', 'D3', 'D5', 'D13', '5V', 'GND'].map((id) => {
    const n = NODES[id];
    return `<text x="50" y="${n.y + 5}" class="l1-wlabel" text-anchor="middle">${n.label}</text>`;
  }).join('');
  return `
  <defs>
    <pattern id="l1-holes" width="16" height="16" patternUnits="userSpaceOnUse">
      <rect x="6" y="6" width="4" height="4" rx="1" class="l1-bb-hole"/>
    </pattern>
    <radialGradient id="l1-glow"><stop offset="0" stop-color="#ff5a5a" stop-opacity=".9"/>
      <stop offset="1" stop-color="#ff5a5a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="14" y="14" width="112" height="250" rx="8" class="l1-pcb"/>
  <text x="70" y="12" class="l1-small" text-anchor="middle">Arduino</text>
  ${pins}
  <rect x="170" y="14" width="300" height="250" rx="8" class="l1-bb"/>
  <rect x="170" y="14" width="300" height="250" rx="8" fill="url(#l1-holes)"/>
  <text x="320" y="12" class="l1-small" text-anchor="middle">Mini-protoboard</text>
  <circle cx="330" cy="70" r="46" fill="url(#l1-glow)" class="l1-led-glow" opacity="0"/>
  <path d="M312 98 V150 M300 150 H312" class="l1-leg"/>
  <path d="M348 98 V132 L360 150" class="l1-leg"/>
  <path d="M308 100 V64 a22 22 0 0 1 44 0 V100 Z" class="l1-led-body"/>
  <rect x="304" y="96" width="52" height="7" rx="2" class="l1-led-rim"/>
  <text x="300" y="178" class="l1-wlabel" text-anchor="middle">+ larga</text>
  <text x="360" y="178" class="l1-wlabel" text-anchor="middle">− corta</text>
  <path d="M270 225 H320 M380 225 H430" class="l1-leg"/>
  <rect x="320" y="213" width="60" height="24" rx="10" class="l1-res"/>
  <rect x="332" y="213" width="6" height="24" fill="#dc2626"/>
  <rect x="344" y="213" width="6" height="24" fill="#dc2626"/>
  <rect x="356" y="213" width="6" height="24" fill="#7c3f12"/>
  <rect x="368" y="213" width="4" height="24" fill="#d4a017"/>
  <text x="350" y="205" class="l1-wlabel" text-anchor="middle">220 Ω (rojo-rojo-marrón)</text>`;
}

/** Monta el reto. `onResult(result)` se llama al comprobar. Devuelve API { setLed }. */
export function mountWiring(host, onResult) {
  host.innerHTML = `
    <svg class="l1-wiring" viewBox="0 0 480 270" role="img" aria-label="Reto de cableado">
      ${staticSvg()}<g class="l1-wires"></g><g class="l1-nodes"></g>
    </svg>
    <div class="l1-row">
      <button type="button" class="l1-btn-primary" data-act="check">Comprobar circuito</button>
      <button type="button" class="l1-btn-ghost" data-act="clear">Borrar cables</button>
    </div>
    <p class="l1-hint">Toca un punto y luego otro para unirlos con un cable. Toca un cable para quitarlo.</p>
    <div class="l1-feedback" role="status" aria-live="polite"></div>`;

  const svg = host.querySelector('svg');
  const wiresG = svg.querySelector('.l1-wires');
  const nodesG = svg.querySelector('.l1-nodes');
  const feedback = host.querySelector('.l1-feedback');
  let wires = [];
  let pending = null;

  function draw() {
    wiresG.innerHTML = wires.map((w, i) => {
      const [a, b] = w.map((id) => NODES[id]);
      const sag = Math.max(a.y, b.y) + 28;
      return `<path class="l1-wire" data-i="${i}" stroke="${wireColor(w, i)}"
        d="M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${sag} ${b.x} ${b.y}"/>`;
    }).join('');
    nodesG.innerHTML = Object.entries(NODES).map(([id, n]) => `
      <g class="l1-node${pending === id ? ' is-pending' : ''}" data-id="${id}" tabindex="0" role="button"
         aria-label="Punto ${n.label}">
        <circle cx="${n.x}" cy="${n.y}" r="18" class="l1-hit"/>
        <circle cx="${n.x}" cy="${n.y}" r="7" class="l1-dot"/>
      </g>`).join('');
  }

  function tap(id) {
    if (!pending) pending = id;
    else if (pending === id) pending = null;
    else {
      const k = key(pending, id);
      if (!wires.some((w) => key(...w) === k)) wires.push([pending, id]);
      pending = null;
      setFeedback(null);
    }
    draw();
  }

  function setFeedback(r) {
    feedback.className = `l1-feedback${r ? ` is-${r.kind}` : ''}`;
    feedback.innerHTML = r ? `<strong>${r.title}</strong><p>${r.msg}</p>` : '';
    if (!r) onResult({ ok: false, pin: null, changed: true });
  }

  svg.addEventListener('click', (e) => {
    const node = e.target.closest('.l1-node');
    if (node) return tap(node.dataset.id);
    const wire = e.target.closest('.l1-wire');
    if (wire) { wires.splice(Number(wire.dataset.i), 1); setFeedback(null); draw(); }
  });
  svg.addEventListener('keydown', (e) => {
    const node = e.target.closest('.l1-node');
    if (node && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      tap(node.dataset.id);
      svg.querySelector(`.l1-node[data-id="${node.dataset.id}"]`)?.focus();
    }
  });
  host.querySelector('[data-act="check"]').addEventListener('click', () => {
    const r = analyze(wires);
    setFeedback(r);
    onResult(r);
  });
  host.querySelector('[data-act="clear"]').addEventListener('click', () => {
    wires = []; pending = null; setFeedback(null); draw();
  });

  draw();
  const glow = svg.querySelector('.l1-led-glow');
  const body = svg.querySelector('.l1-led-body');
  return {
    setLed(level) {
      glow.setAttribute('opacity', String(level));
      body.style.fillOpacity = String(0.45 + 0.55 * level);
    },
  };
}
