// Mini puente H interactivo: IN1, IN2 y EN gobiernan 4 interruptores y la polaridad del motor.
export function mountHBridge(host) {
  const st = { in1: 1, in2: 0, en: 1 };
  host.innerHTML = `
    <h4>Dentro del chip: 4 interruptores</h4>
    <svg viewBox="0 0 240 150" class="l4-hb-svg" role="img" aria-label="Puente H con cuatro interruptores y un motor">
      <text x="120" y="11" text-anchor="middle" class="l4-hb-t">+V (baterías)</text>
      <text x="120" y="148" text-anchor="middle" class="l4-hb-t">GND</text>
      <line x1="60" y1="18" x2="180" y2="18" class="l4-hb-w"/><line x1="60" y1="132" x2="180" y2="132" class="l4-hb-w"/>
      <line x1="60" y1="18" x2="60" y2="132" class="l4-hb-w"/><line x1="180" y1="18" x2="180" y2="132" class="l4-hb-w"/>
      <line x1="60" y1="75" x2="180" y2="75" class="l4-hb-w"/>
      <polyline class="l4-hb-flow" points="" fill="none"/>
      <circle cx="120" cy="75" r="18" class="l4-hb-m"/><text x="120" y="80" text-anchor="middle" class="l4-hb-mt">M</text>
      <text x="54" y="72" text-anchor="end" class="l4-hb-t">OUT1</text><text x="186" y="72" class="l4-hb-t">OUT2</text>
      ${[['s1', 60, 46], ['s2', 180, 46], ['s3', 60, 104], ['s4', 180, 104]].map(([id, x, y]) =>
    `<g data-s="${id}"><rect x="${x - 14}" y="${y - 9}" width="28" height="18" rx="4" class="l4-hb-sw"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="l4-hb-st">${id.toUpperCase()}</text></g>`).join('')}
    </svg>
    <div class="l4-hb-ctl">
      <button type="button" class="l4-btn l4-btn-sm" data-t="in1"></button>
      <button type="button" class="l4-btn l4-btn-sm" data-t="in2"></button>
      <button type="button" class="l4-btn l4-btn-sm" data-t="en"></button>
    </div>
    <p class="l4-hb-msg" aria-live="polite"></p>`;

  const flow = host.querySelector('.l4-hb-flow');
  const msg = host.querySelector('.l4-hb-msg');

  function draw() {
    const on = {
      s1: st.en && st.in1, s3: st.en && !st.in1, s2: st.en && st.in2, s4: st.en && !st.in2,
    };
    Object.entries(on).forEach(([id, v]) => host.querySelector(`[data-s="${id}"]`).classList.toggle('is-closed', !!v));
    const names = { in1: 'IN1', in2: 'IN2', en: 'ENA' };
    host.querySelectorAll('[data-t]').forEach((b) => {
      b.textContent = `${names[b.dataset.t]} = ${st[b.dataset.t] ? 'HIGH' : 'LOW'}`;
    });
    const same = st.in1 === st.in2;
    flow.setAttribute('points', '');
    if (!st.en) {
      msg.textContent = 'ENA = LOW: los 4 interruptores están abiertos. El motor queda libre (sin energía).';
    } else if (same) {
      msg.textContent = 'IN1 = IN2: ambos bornes quedan al mismo voltaje, no circula corriente. El motor se frena.';
    } else if (st.in1) {
      flow.setAttribute('points', '60,18 60,75 180,75 180,132');
      msg.textContent = 'S1 y S4 cerrados: la corriente va de OUT1 a OUT2 (+ en OUT1). El motor gira en un sentido.';
    } else {
      flow.setAttribute('points', '180,18 180,75 60,75 60,132');
      msg.textContent = 'S2 y S3 cerrados: la corriente va de OUT2 a OUT1. Polaridad invertida: el motor gira al revés.';
    }
  }

  host.querySelector('.l4-hb-ctl').addEventListener('click', (e) => {
    const k = e.target.dataset.t;
    if (!k) return;
    st[k] = st[k] ? 0 : 1;
    draw();
  });
  draw();
}
