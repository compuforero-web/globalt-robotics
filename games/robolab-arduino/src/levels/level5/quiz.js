// Fase 4: 3 preguntas aleatorias de un banco de 6 (energía, PWM, ultrasonido, decisión).
const BANK = [
  { q: 'Las 2 baterías 18650 en serie dan 7.4V. ¿Cómo alimentas el Nano y los sensores de forma segura?', o: ['Batería + directa al pin 5V del Nano', 'Con el regulador 5V del L298N (o VIN del Nano)', 'Al pin 3.3V del Nano'], a: 1, w: 'El regulador baja 7.4V a 5V. Directo al pin 5V quemarías el Nano.' },
  { q: '¿Por qué el GND del L298N, el del Nano y el de los sensores deben unirse?', o: ['Para ahorrar cables', 'Para que todas las señales compartan la misma referencia de 0V', 'Para subir el voltaje'], a: 1, w: 'Sin GND común, un HIGH de 5V no significa nada para el otro módulo.' },
  { q: 'analogWrite(ENA, 100) en lugar de 255 hace que el motor…', o: ['Gire más lento (menor ciclo de trabajo PWM)', 'Gire en sentido contrario', 'Se detenga siempre'], a: 0, w: 'PWM 100/255 ≈ 39% del tiempo en HIGH: menos potencia media y menor velocidad.' },
  { q: '¿Qué pin es válido para ENA y para la señal del servo en el Nano?', o: ['D4', 'D5 (~PWM)', 'A7'], a: 1, w: 'Solo D3, D5, D6, D9, D10 y D11 tienen PWM. A7 ni siquiera es una salida digital.' },
  { q: 'El HC-SR04 devuelve un eco de 1166 µs. ¿Qué distancia hay? (t × 0.034 / 2)', o: ['≈ 20 cm', '≈ 40 cm', '≈ 80 cm'], a: 0, w: '1166 × 0.034 / 2 ≈ 19.8 cm: el sonido va y vuelve, por eso se divide entre 2.' },
  { q: 'Tras frenar, el robot mide 130 cm a la izquierda y 25 cm a la derecha. ¿Qué hace?', o: ['Gira a la derecha', 'Gira a la izquierda (más despejado)', 'Retrocede sin girar'], a: 1, w: 'La regla es izq > der → girar hacia el lado con más distancia libre.' },
];

export function mountQuiz(host, { onPass }) {
  const draw = () => {
    const qs = [...BANK].sort(() => Math.random() - 0.5).slice(0, 3);
    let score = 0;
    let done = 0;
    host.innerHTML = `${qs.map((x, i) => `<fieldset class="l5-q"><legend>${i + 1}. ${x.q}</legend>${x.o.map((t, j) =>
      `<button type="button" class="l5-opt" data-q="${i}" data-o="${j}">${t}</button>`).join('')}<p class="l5-why" hidden></p></fieldset>`).join('')}
      <div class="l5-msg" role="status"></div>`;
    host.querySelectorAll('.l5-opt').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.q);
      const f = b.closest('fieldset');
      const ok = Number(b.dataset.o) === qs[i].a;
      f.querySelectorAll('.l5-opt').forEach((n) => { n.disabled = true; });
      f.querySelectorAll('.l5-opt')[qs[i].a].classList.add('is-right');
      if (!ok) b.classList.add('is-wrong');
      const why = f.querySelector('.l5-why');
      why.hidden = false; why.textContent = (ok ? '✔ ' : '✘ ') + qs[i].w;
      score += ok ? 1 : 0; done += 1;
      if (done < 3) return;
      const msg = host.querySelector('.l5-msg');
      if (score >= 2) { msg.className = 'l5-msg is-ok'; msg.textContent = `✔ ${score}/3 correctas. ¡Certificación aprobada!`; onPass(); return; }
      msg.className = 'l5-msg is-err';
      msg.innerHTML = `${score}/3 correctas: necesitas al menos 2. <button type="button" class="l5-btn">Reintentar con otras preguntas</button>`;
      msg.querySelector('button').addEventListener('click', draw);
    }));
  };
  draw();
}
