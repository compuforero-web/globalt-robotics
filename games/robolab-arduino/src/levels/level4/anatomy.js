// Textos de la anatomía del L298N: qué es cada parte y por qué se necesita.
import { PART_IDS } from './l298n-svg.js';

const PARTS = {
  heatsink: {
    name: 'Chip L298N + disipador',
    what: 'Contiene dos puentes H (uno por motor). Maneja hasta ~2 A por canal y se calienta, por eso lleva el disipador rojo/negro.',
    why: 'Cada puente H tiene 4 interruptores (transistores). IN1 decide si OUT1 va al + o a GND; IN2 hace lo mismo con OUT2. Al invertir cuál está en HIGH, la corriente cruza el motor al revés: cambia la polaridad y el sentido de giro.',
  },
  power: {
    name: 'Bornera de potencia',
    what: '12V: entrada del + de las baterías (2×18650 = 7.4 V). GND: el − de las baterías y la referencia común. 5V: salida del regulador interno; no se conectan baterías ahí.',
    why: 'El Arduino Nano entrega máximo 40 mA por pin y un motor DC pide cientos de mA (más al arrancar). La energía sale de las baterías por esta bornera; el Nano solo manda señales.',
  },
  outA: {
    name: 'Salida Motor Izquierdo (OUT1, OUT2)',
    what: 'Los dos cables del motor izquierdo. Con IN1=HIGH e IN2=LOW gira hacia un lado; con IN1=LOW e IN2=HIGH, al contrario.',
    why: 'Los interruptores S1–S4 del puente H conectan OUT1/OUT2 a +V o a GND: así se invierte la polaridad del motor sin mover cables. Si gira al revés de lo esperado, intercambia sus cables.',
  },
  outB: {
    name: 'Salida Motor Derecho (OUT3, OUT4)',
    what: 'Los dos cables del motor derecho, controlados por IN3 e IN4 con el segundo puente H del chip.',
    why: 'Es un puente H independiente: un motor puede avanzar y el otro retroceder. Girar sobre el sitio = un motor en cada sentido, algo imposible conectando el motor directo al Nano (40 mA máx. por pin).',
  },
  ctrl: {
    name: 'Pines de control (ENA, IN1–IN4, ENB)',
    what: 'IN1–IN4 indican la dirección (HIGH/LOW). ENA y ENB habilitan cada puente; con PWM (analogWrite 0–255) regulan la velocidad, por eso van a pines con ~.',
    why: 'Aquí solo circulan unos pocos mA: el Nano "pide" y el L298N "ejecuta" con la potencia de las baterías. Además, el GND del L298N debe unirse al GND del Nano para compartir referencia.',
  },
};

/** Chips y tarjeta informativa; devuelve { show(id) } para sincronizar con el SVG. */
export function mountAnatomy(chipsEl, cardEl, board) {
  chipsEl.innerHTML = PART_IDS.map((id) => `<button type="button" class="l4-chip" data-part="${id}">${PARTS[id].name.split(' (')[0]}</button>`).join('');
  function show(id) {
    const p = PARTS[id];
    board.select(id);
    chipsEl.querySelectorAll('.l4-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.part === id));
    cardEl.innerHTML = `<h4>${p.name}</h4><p>${p.what}</p><p><b>💡 Por qué importa:</b> ${p.why}</p>`;
  }
  chipsEl.addEventListener('click', (e) => { if (e.target.dataset.part) show(e.target.dataset.part); });
  cardEl.innerHTML = '<p>👆 Toca una parte del módulo (o un botón) para descubrir qué hace.</p>';
  return { show };
}
