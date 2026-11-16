// Fichas explicativas de cada parte del HC-SR04 (ecolocalización).
const INFO = {
  T: ['Transductor emisor (T)', `Cuando Arduino pone <code>Trig</code> en HIGH durante <b>10 µs</b>, el módulo
    hace vibrar este piezoeléctrico y lanza una ráfaga de <b>8 ciclos a 40 kHz</b>. Es ultrasonido: los
    humanos solo oímos hasta unos 20 kHz, por eso no escuchas nada.`],
  R: ['Transductor receptor (R)', `Funciona como un micrófono afinado a 40 kHz. Escucha el <b>eco</b> que rebota
    en el obstáculo. Desde que sale la ráfaga hasta que llega el eco, el pin <code>Echo</code> permanece en HIGH.`],
  crystal: ['Cristal de cuarzo', `Es el reloj del pequeño circuito del módulo. Vibra a una frecuencia muy estable
    y permite generar la ráfaga de 40 kHz exacta y medir los tiempos con precisión de microsegundos.`],
  VCC: ['Pin VCC (alimentación)', `Va a <b>5V</b> del Arduino. El módulo consume unos 15 mA. Con 3.3 V no mide de
    forma fiable, y si lo inviertes con GND puedes dañarlo.`],
  Trig: ['Pin Trig (disparo)', `Entrada del sensor → en Arduino es <code>OUTPUT</code>. Secuencia:
    <code>digitalWrite(TRIG, LOW)</code> 2 µs, <code>HIGH</code> 10 µs y otra vez <code>LOW</code>.
    Ese pulso ordena lanzar el ultrasonido.`],
  Echo: ['Pin Echo (eco)', `Salida del sensor → en Arduino es <code>INPUT</code>. <code>pulseIn(ECHO, HIGH)</code>
    devuelve cuántos µs estuvo en HIGH: el tiempo de <b>ida y vuelta</b>.
    Distancia = (tiempo × 0.034) / 2, porque el sonido recorre 0.034 cm cada µs (343 m/s).`],
  GND: ['Pin GND (tierra)', `Referencia común de 0 V. Debe unirse al GND del Arduino para que ambos
    "hablen" el mismo idioma eléctrico.`],
};

const ORDER = ['T', 'R', 'crystal', 'VCC', 'Trig', 'Echo', 'GND'];
const SHORT = { T: 'T emisor', R: 'R receptor', crystal: 'Cristal' };

export function mountAnatomy(chipsHost, cardHost, sensor) {
  chipsHost.innerHTML = ORDER.map((p) =>
    `<button type="button" class="l3-chip" data-part="${p}">${SHORT[p] || p}</button>`).join('');

  function show(part) {
    const [title, text] = INFO[part];
    cardHost.innerHTML = `<h4>${title}</h4><p>${text}</p>`;
    chipsHost.querySelectorAll('.l3-chip').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.part === part));
    sensor.select(part);
  }

  chipsHost.addEventListener('click', (e) => {
    const b = e.target.closest('.l3-chip');
    if (b) show(b.dataset.part);
  });
  cardHost.innerHTML = `<p>Toca una parte del sensor o un botón para descubrir cómo
    <b>ecolocaliza</b> como un murciélago: emite un sonido, espera el eco y mide el tiempo.</p>`;
  return { show };
}
