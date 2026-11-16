// Escenario físico: obstáculo arrastrable (2–400 cm) y ondas de ultrasonido animadas.
const NS = 'http://www.w3.org/2000/svg';
const MIN = 2, MAX = 400, X0 = 44, X1 = 334, CY = 72, FACE = 40;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Escala raíz cuadrada: da más espacio a las distancias cortas (zona de alerta).
const frac = (d) => Math.sqrt((d - MIN) / (MAX - MIN));
const xOf = (d) => X0 + (X1 - X0) * frac(d);
const dOf = (x) => { const f = clamp((x - X0) / (X1 - X0), 0, 1); return MIN + f * f * (MAX - MIN); };
const TICKS = [2, 15, 50, 100, 200, 400];

function arc(cx, r, dir) {
  const a = 0.5, x = cx + dir * r * Math.cos(a), dy = r * Math.sin(a);
  return `M${x.toFixed(1)} ${(CY - dy).toFixed(1)} A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${x.toFixed(1)} ${(CY + dy).toFixed(1)}`;
}

/** onPhase(fase, medida) recibe: trigLow, trigHigh, trigEnd, pulse, calc, print, if, alert. */
export function mountSim(host, { onPhase }) {
  host.innerHTML = `
    <div class="l3-scene is-locked">
      <svg viewBox="0 0 360 150" class="l3-scene-svg" aria-label="Escenario: sensor y obstáculo">
        <rect class="l3-zone-near" x="${X0}" y="16" width="${xOf(15) - X0}" height="104" />
        <rect class="l3-zone-far" x="${xOf(50)}" y="16" width="${X1 + 12 - xOf(50)}" height="104" />
        <line x1="0" y1="120" x2="360" y2="120" class="l3-ground" />
        ${TICKS.map((t) => `<g class="l3-tick"><line x1="${xOf(t)}" y1="120" x2="${xOf(t)}" y2="126" />
          <text x="${xOf(t)}" y="138" text-anchor="middle">${t}</text></g>`).join('')}
        <text x="352" y="148" text-anchor="end" class="l3-tick">cm</text>
        <rect x="8" y="34" width="14" height="76" rx="2" fill="#1f5fa8" />
        <rect class="l3-sT" x="22" y="40" width="${FACE - 22}" height="22" rx="3" fill="#c9d1d9" stroke="#6b7682" />
        <rect x="22" y="82" width="${FACE - 22}" height="22" rx="3" fill="#c9d1d9" stroke="#6b7682" />
        <text x="6" y="28" class="l3-tick">HC-SR04</text>
        <g class="l3-waves"></g>
        <g class="l3-obstacle">
          <rect x="-9" y="36" width="18" height="84" rx="3" />
          <text class="l3-ob-label" x="0" y="28" text-anchor="middle"></text>
        </g>
      </svg>
      <p class="l3-scene-lock">🔒 Conecta bien el sensor (paso 2) para empezar a medir.</p>
    </div>
    <label class="l3-range">
      <span>Arrastra la caja o usa el deslizador: <strong class="l3-dist-val"></strong></span>
      <input type="range" min="0" max="1000" step="1" aria-label="Distancia del obstáculo" />
    </label>`;
  const $ = (s) => host.querySelector(s);
  const svg = $('svg'), ob = $('.l3-obstacle'), range = $('input');
  const waves = [...Array(6)].map((_, i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', i < 3 ? 'l3-wave-out' : 'l3-wave-back');
    $('.l3-waves').appendChild(p);
    return p;
  });

  let dist = 30, enabled = false, cyc = null, last = '', raf = 0, dragging = false;

  function setDist(d, fromRange = false) {
    dist = Math.round(clamp(d, MIN, MAX));
    ob.setAttribute('transform', `translate(${xOf(dist).toFixed(1)},0)`);
    ob.classList.toggle('is-near', dist < 15);
    $('.l3-ob-label').textContent = `${dist} cm`;
    $('.l3-dist-val').textContent = `${dist} cm`;
    if (!fromRange) range.value = Math.round(frac(dist) * 1000);
  }

  function toSvgX(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
  }
  svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    setDist(dOf(toSvgX(e)));
  });
  svg.addEventListener('pointermove', (e) => { if (dragging) setDist(dOf(toSvgX(e))); });
  const stop = () => { dragging = false; };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);
  range.addEventListener('input', () => {
    const f = range.value / 1000;
    setDist(MIN + f * f * (MAX - MIN), true);
  });

  function newCycle(now) {
    const t = Math.max(1, Math.round((2 * dist) / 0.034 + (Math.random() - 0.5) * 6));
    return { t0: now, travel: 220 + 600 * frac(dist), res: { t, dist: (t * 0.034) / 2 } };
  }

  function drawWaves(el) {
    const L = xOf(dist) - 9 - FACE;
    const p = (el - 150) / cyc.travel;
    waves.forEach((w, i) => {
      const out = i < 3;
      const r = (out ? p : p - 1) * L - (i % 3) * 10;
      const show = el >= 150 && r > 2 && r <= L && (out ? p <= 1.15 : p >= 1);
      w.style.display = show ? '' : 'none';
      if (show) w.setAttribute('d', out ? arc(FACE, r, 1) : arc(FACE + L, r, -1));
    });
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!enabled) return;
    if (!cyc) cyc = newCycle(now);
    const el = now - cyc.t0, end = 150 + 2 * cyc.travel;
    const marks = [[50, 'trigLow'], [100, 'trigHigh'], [150, 'trigEnd'], [end, 'pulse'],
      [end + 140, 'calc'], [end + 280, 'print'], [end + 420, 'if'], [end + 700, 'alert']];
    const hit = marks.find(([lim]) => el < lim);
    if (!hit) { cyc = null; last = ''; return; }
    const phase = hit[1];
    $('.l3-sT').classList.toggle('is-firing', phase === 'trigHigh' || phase === 'trigEnd');
    drawWaves(el);
    if (phase !== last) { last = phase; onPhase(phase, cyc.res); }
  }

  function hideWaves() { waves.forEach((w) => { w.style.display = 'none'; }); }

  setDist(dist);
  hideWaves();
  raf = requestAnimationFrame(frame);
  return {
    enable() { enabled = true; $('.l3-scene').classList.remove('is-locked'); },
    disable() {
      enabled = false; cyc = null; last = ''; hideWaves();
      $('.l3-scene').classList.add('is-locked');
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}
