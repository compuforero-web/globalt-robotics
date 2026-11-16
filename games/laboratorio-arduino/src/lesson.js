// Lección piloto «Electrónica y C++ con Arduino»: LED intermitente y monitor serie. Contenido original de GLOBALT.
export const LESSON = {
  id: 'arduino-led-serie',
  course: 'Electrónica y C++ con Arduino',
  title: 'Tu primer LED intermitente y mensajes al monitor serie',
  ledPin: 13,
  baud: 9600,
};

export const EXAMPLE_CODE = `// GLOBALT Robotics · Lección 1: LED intermitente y monitor serie
// El LED externo está en el pin digital 13 (D13) con una resistencia de 220 Ω.

const int PIN_LED = 13;        // pin donde conectamos el LED

void setup() {
  pinMode(PIN_LED, OUTPUT);    // D13 entregará voltaje: lo configuramos como salida
  Serial.begin(9600);          // abre el monitor serie a 9600 baudios
  Serial.println("Hola, soy tu Arduino Nano");
}

void loop() {
  digitalWrite(PIN_LED, HIGH); // 5 V en D13: el LED se enciende
  Serial.println("LED encendido");
  delay(1000);                 // espera 1000 ms (1 segundo)

  digitalWrite(PIN_LED, LOW);  // 0 V en D13: el LED se apaga
  Serial.println("LED apagado");
  delay(1000);
}
`;

export const CHALLENGE = {
  title: 'Reto: el latido',
  summary: 'Convierte el parpadeo en un «latido»: el LED de D13 debe encenderse 200 ms y apagarse 800 ms, una y otra vez. En cada latido, el monitor serie debe mostrar una línea «Latido 1», «Latido 2», «Latido 3»… contando desde 1.',
  criteria: [
    'El LED de D13 parpadea al menos 4 veces en 5 segundos.',
    'Cada encendido dura 200 ms (±10 %).',
    'Cada apagado dura 800 ms (±10 %).',
    'El monitor serie funciona a 9600 baudios.',
    'Aparece una línea «Latido N» por cada latido, numerada 1, 2, 3…',
  ],
};

export function lessonHtml() {
  return `
  <section class="lesson-block" aria-labelledby="l-obj">
    <h2 id="l-obj">Objetivo</h2>
    <p>Programar un Arduino Nano para que encienda y apague un LED con un ritmo exacto y para que te cuente, por el monitor serie, qué está haciendo.</p>
  </section>
  <section class="lesson-block" aria-labelledby="l-exp">
    <h2 id="l-exp">Cómo funciona</h2>
    <p>Un <strong>pin digital</strong> es como un interruptor que el programa controla. Con <code>pinMode(13, OUTPUT)</code> le decimos que entregue voltaje; con <code>digitalWrite(13, HIGH)</code> pone 5&nbsp;V y con <code>LOW</code> lo deja en 0&nbsp;V.</p>
    <p>Un LED solo deja pasar corriente en un sentido: la pata larga (ánodo, +) va hacia el pin y la corta (cátodo, −) hacia GND. Sin una <strong>resistencia</strong> la corriente sería demasiado alta. Con 220&nbsp;Ω pasan unos (5&nbsp;V − 2&nbsp;V) ÷ 220&nbsp;Ω ≈ 14&nbsp;mA: suficiente para verlo y seguro para el pin.</p>
    <p><code>delay(ms)</code> detiene el programa los milisegundos indicados. Todo lo que está dentro de <code>loop()</code> se repite sin fin; así nace el parpadeo.</p>
    <p>El <strong>monitor serie</strong> es la ventana donde el Arduino escribe texto. <code>Serial.begin(9600)</code> fija la velocidad (9600 baudios) y <code>Serial.println("…")</code> envía una línea.</p>
  </section>
  <section class="lesson-block" aria-labelledby="l-cir">
    <h2 id="l-cir">Circuito y conexiones</h2>
    <table class="conn-table">
      <thead><tr><th>Desde</th><th>Hacia</th><th>Para qué</th></tr></thead>
      <tbody>
        <tr><td>D13 del Nano</td><td>Resistencia 220&nbsp;Ω</td><td>Limita la corriente</td></tr>
        <tr><td>Resistencia</td><td>Ánodo del LED (pata larga)</td><td>Entrada de corriente al LED</td></tr>
        <tr><td>Cátodo del LED (pata corta)</td><td>GND del Nano</td><td>Cierra el circuito</td></tr>
      </tbody>
    </table>
    <p class="muted small">El Nano también tiene un LED pequeño marcado «L» conectado a D13; en el simulador verás ambos.</p>
  </section>
  <section class="lesson-block" aria-labelledby="l-ej">
    <h2 id="l-ej">Ejemplo comentado</h2>
    <p>El editor empieza con este ejemplo: parpadea cada segundo y escribe el estado. Pulsa <strong>Ejecutar</strong> para verlo funcionar y luego modifícalo para resolver el reto.</p>
    <pre class="lesson-code"><code>${EXAMPLE_CODE.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code></pre>
  </section>
  <section class="lesson-block lesson-block--challenge" aria-labelledby="l-reto">
    <h2 id="l-reto">${CHALLENGE.title}</h2>
    <p>${CHALLENGE.summary}</p>
    <ul class="criteria">${CHALLENGE.criteria.map((c) => `<li>${c}</li>`).join('')}</ul>
    <p class="muted small">Al pulsar <strong>Comprobar reto</strong>, el laboratorio compila tu código, lo ejecuta 5 segundos simulados y mide el LED y el texto del monitor serie.</p>
  </section>
  <details class="lesson-block scope">
    <summary>Alcance del simulador</summary>
    <ul>
      <li>Tu código se compila de verdad con avr-gcc y el núcleo Arduino AVR para Nano (ATmega328P a 16&nbsp;MHz).</li>
      <li>El archivo resultante se ejecuta instrucción por instrucción en un ATmega328P emulado (avr8js) dentro de tu navegador.</li>
      <li>Funciona: pines digitales (pinMode, digitalWrite, digitalRead de salidas), temporizadores (delay, millis, micros) y Serial (print, println, write).</li>
      <li>Todavía no: entradas externas (botones, sensores), analogRead, servos, librerías adicionales ni lectura desde el monitor serie.</li>
      <li>El circuito de esta lección es fijo: LED con resistencia en D13. Los demás pines se muestran como indicadores.</li>
    </ul>
  </details>`;
}
