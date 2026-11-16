// Fórmula en vivo, código C++ resaltado, Monitor Serie y alerta LED/buzzer.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lines(trig, echo, alert) {
  return [
    [`const int TRIG = ${trig};`], [`const int ECHO = ${echo};`], [`const int ALERTA = ${alert}; // LED + buzzer`],
    ['void setup() {'], ['  Serial.begin(9600);'], ['  pinMode(TRIG, OUTPUT);'], ['  pinMode(ECHO, INPUT);'],
    ['  pinMode(ALERTA, OUTPUT);'], ['}'], ['void loop() {'],
    ['  digitalWrite(TRIG, LOW);', 'trigLow'], ['  delayMicroseconds(2);', 'trigLow'],
    ['  digitalWrite(TRIG, HIGH);', 'trigHigh'], ['  delayMicroseconds(10);', 'trigHigh'],
    ['  digitalWrite(TRIG, LOW);', 'trigEnd'],
    ['  long tiempo = pulseIn(ECHO, HIGH);', 'pulse'],
    ['  float distancia = tiempo * 0.034 / 2;', 'calc'],
    ['  Serial.print("Distancia: ");', 'print'], ['  Serial.print(distancia);', 'print'],
    ['  Serial.println(" cm");', 'print'],
    ['  if (distancia < 15) {', 'if'], ['    digitalWrite(ALERTA, HIGH);', 'on'],
    ['  } else {'], ['    digitalWrite(ALERTA, LOW);', 'off'], ['  }'], ['  delay(100);'], ['}'],
  ];
}

export function mountCode(host) {
  host.innerHTML = `
    <div class="l3-formula">
      <div>Distancia = <span class="l3-frac"><span>Tiempo (µs) × 0.034</span><span>2</span></span></div>
      <div class="l3-formula-live">= <span class="l3-frac"><span><b class="l3-t">—</b> µs × 0.034</span><span>2</span></span>
        = <b class="l3-d">—</b> cm</div>
      <p class="l3-note">0.034 cm/µs ≈ 343 m/s (velocidad del sonido). Se divide entre 2 porque la onda va y vuelve.</p>
    </div>
    <div class="l3-sim-cols">
      <pre class="l3-code" aria-label="Código del Arduino"></pre>
      <div class="l3-io">
        <div class="l3-serial">
          <div class="l3-serial-head"><span>Monitor Serie · 9600</span>
            <button type="button" class="l3-btn l3-btn-sm" data-act="clear">Limpiar</button></div>
          <pre class="l3-serial-out"></pre>
        </div>
        <div class="l3-alert">
          <svg viewBox="0 0 150 72" aria-hidden="true">
            <line x1="26" y1="44" x2="26" y2="68" class="l3-leg" /><line x1="38" y1="44" x2="38" y2="64" class="l3-leg" />
            <path d="M18 46 V28 a14 14 0 0 1 28 0 V46 Z" class="l3-led" />
            <circle cx="100" cy="36" r="22" fill="#222" /><circle cx="100" cy="36" r="4" fill="#555" />
            <g class="l3-beep"><path d="M126 22 q8 14 0 28" /><path d="M134 16 q12 20 0 40" /></g>
          </svg>
          <p class="l3-alert-txt">Sin alerta</p>
          <button type="button" class="l3-btn l3-btn-sm" data-act="sound" aria-pressed="true">🔊 Sonido: sí</button>
        </div>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  let sound = true, ctx = null, rows = [];

  function setPins(trig, echo) {
    const alert = ['13', '12', '11', '7'].find((p) => p !== trig && p !== echo);
    $('.l3-code').innerHTML = lines(trig, echo, alert)
      .map(([t, k]) => `<span class="l3-ln" data-k="${k || ''}">${esc(t)}</span>`).join('\n');
  }

  function beep() {
    if (!sound) return;
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume?.();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 2000; g.gain.value = 0.03;
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.09);
    } catch { /* sin audio: solo alerta visual */ }
  }

  function setAlert(on) {
    $('.l3-alert').classList.toggle('is-on', on);
    $('.l3-alert-txt').textContent = on ? '🚨 ¡Obstáculo a menos de 15 cm!' : 'Sin alerta';
    if (on) beep();
  }

  function phase(p, res) {
    const key = p === 'alert' ? (res.dist < 15 ? 'on' : 'off') : p;
    $('.l3-code').querySelectorAll('.l3-ln').forEach((l) => l.classList.toggle('is-active', l.dataset.k === key));
    if (p === 'calc') {
      $('.l3-t').textContent = res.t;
      $('.l3-d').textContent = res.dist.toFixed(2);
    } else if (p === 'print') {
      rows.push(`Distancia: ${res.dist.toFixed(2)} cm`);
      rows = rows.slice(-40);
      const out = $('.l3-serial-out');
      out.textContent = rows.join('\n');
      out.scrollTop = out.scrollHeight;
    } else if (p === 'alert') setAlert(res.dist < 15);
  }

  host.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'clear') { rows = []; $('.l3-serial-out').textContent = ''; }
    if (act === 'sound') {
      sound = !sound;
      e.target.textContent = sound ? '🔊 Sonido: sí' : '🔇 Sonido: no';
      e.target.setAttribute('aria-pressed', String(sound));
    }
  });
  setPins('10', '9');
  return {
    setPins, phase,
    reset() { setAlert(false); $('.l3-code').querySelectorAll('.is-active').forEach((l) => l.classList.remove('is-active')); },
    destroy() { ctx?.close?.(); },
  };
}
