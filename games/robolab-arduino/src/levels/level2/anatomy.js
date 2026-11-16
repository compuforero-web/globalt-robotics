// Paso 1: anatomía interactiva del microservo (SVG + tarjetas explicativas + botones accesibles).
export const PARTS = {
  gnd: {
    name: 'Cable marrón · GND', color: '#7c4a21',
    text: 'Es el retorno de corriente (0 V). Debe compartirse con el GND del Arduino para que la señal tenga la misma referencia.',
  },
  vcc: {
    name: 'Cable rojo · VCC 5V', color: '#d62828',
    text: 'Alimenta el motor y el circuito de control (4.8–6 V). Al arrancar o forzarse puede pedir hasta ~650 mA.',
  },
  sig: {
    name: 'Cable naranja · Señal PWM', color: '#f77f00',
    text: 'Recibe un pulso cada 20 ms (50 Hz). Su duración indica el ángulo: ~1000 µs = 0°, 1500 µs = 90°, 2000 µs = 180°. Casi no consume corriente.',
  },
  motor: {
    name: 'Motor DC', color: '#64748b',
    text: 'Un pequeño motor de corriente continua que gira muy rápido pero con poca fuerza. El circuito lo hace girar en un sentido u otro.',
  },
  gears: {
    name: 'Caja de engranajes', color: '#a16207',
    text: 'Reduce la velocidad del motor (relación aprox. 1:300) y multiplica la fuerza (torque ≈ 1.8 kg·cm). El último engranaje mueve el eje de salida.',
  },
  pot: {
    name: 'Potenciómetro interno', color: '#3f6212',
    text: 'Está unido al eje de salida. Su resistencia cambia con el ángulo y así el servo "sabe" dónde está su brazo (realimentación).',
  },
  pcb: {
    name: 'Circuito de control', color: '#15803d',
    text: 'Compara el pulso recibido con la lectura del potenciómetro y mueve el motor hasta que ambos coinciden. ¡Es un lazo cerrado!',
  },
  horn: {
    name: 'Brazo (horn)', color: '#475569',
    text: 'Pieza de plástico que se encaja en el eje. Gira de 0° a 180° y sobre él montas talanqueras, radares o pinzas.',
  },
  case: {
    name: 'Carcasa y orejas de montaje', color: '#1e5fa8',
    text: 'Protege el mecanismo. Las orejas con agujeros sirven para atornillar el servo al chasis del robot.',
  },
};

/** Monta la exploración. `servo` es la API devuelta por createServoSvg. */
export function mountAnatomy(chipsHost, card, servo) {
  chipsHost.innerHTML = Object.entries(PARTS).map(([id, p]) =>
    `<button type="button" class="l2-chip" data-part="${id}">
      <span class="l2-dot" style="background:${p.color}"></span>${p.name.split(' · ')[0]}</button>`).join('');

  function show(id) {
    const p = PARTS[id];
    if (!p) return;
    card.innerHTML = `<h4><span class="l2-dot" style="background:${p.color}"></span>${p.name}</h4><p>${p.text}</p>`;
    chipsHost.querySelectorAll('.l2-chip').forEach((b) => b.classList.toggle('is-active', b.dataset.part === id));
  }

  chipsHost.addEventListener('click', (e) => {
    const b = e.target.closest('[data-part]');
    if (!b) return;
    servo.select(b.dataset.part);
    show(b.dataset.part);
  });

  card.innerHTML = '<p>Toca una pieza o un cable del servo para descubrir su función.</p>';
  return { show };
}
