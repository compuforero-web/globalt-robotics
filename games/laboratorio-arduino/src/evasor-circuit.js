// Dos vistas del mismo Nano: reutiliza los componentes ya probados, con IDs únicos por vista.
import { createSonarCircuit, createMotorCircuit } from './circuit.js';
import { PIN_MAPS } from './motor.js';

function namespace(root, prefix) {
  for (const node of root.querySelectorAll('[id]')) {
    const old = node.id;
    node.id = prefix + old;
    for (const ref of root.querySelectorAll('[for], [aria-labelledby], [aria-describedby]')) {
      for (const attr of ['for', 'aria-labelledby', 'aria-describedby']) {
        const value = ref.getAttribute(attr);
        if (value) ref.setAttribute(attr, value.split(' ').map((id) => id === old ? prefix + id : id).join(' '));
      }
    }
  }
}
export function createEvasorCircuit(root, opts = {}) {
  root.innerHTML = `<p class="muted small">Banco de pruebas · Dos vistas del mismo Nano. Las ruedas están al aire: el control cambia la distancia del obstáculo, no la posición del robot.</p>
    <section data-bench="sensor" aria-label="Sensor y obstáculo"></section>
    <section data-bench="motors" aria-label="Puente H y motores"></section>`;
  const sensorRoot = root.querySelector('[data-bench="sensor"]');
  const motorRoot = root.querySelector('[data-bench="motors"]');
  const sonar = createSonarCircuit(sensorRoot, { ...opts, cm: 100 });
  const motor = createMotorCircuit(motorRoot, { channels: PIN_MAPS.robot });
  namespace(sensorRoot, 'bench-sonar-');
  namespace(motorRoot, 'bench-motor-');
  return {
    update(w) { sonar.update(w); motor.update(w); },
    sonarState: (s) => sonar.sonarState(s),
    motorState: (s) => motor.motorState(s),
    sonarCm: () => sonar.sonarCm(),
    stopped() { sonar.stopped(); motor.stopped(); },
    reset() { sonar.reset(); motor.reset(); },
  };
}
