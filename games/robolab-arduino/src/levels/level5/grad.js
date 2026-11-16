// Pantalla de graduación con el resumen de los 5 niveles dominados.
import { LEVELS } from '../catalog.js';

export function showGraduation(host, onExit) {
  host.hidden = false;
  host.innerHTML = `<div class="l5-cert" role="region" aria-label="Certificado completado">
    <div class="l5-medal" aria-hidden="true">🎓</div>
    <h3>¡Graduación! Certificado completado</h3>
    <p>Construiste, programaste y probaste un robot evasor de obstáculos 100% autónomo. Dominaste:</p>
    <ol class="l5-levels">${LEVELS.map((l) => `<li><strong>Nivel ${l.id} · ${l.title}</strong><small>${l.skills.join(' · ')}</small></li>`).join('')}</ol>
    <p class="l5-cert-end">Certificado de Constructor de Robots · RoboLab Arduino</p>
    <button type="button" class="l5-btn-primary">Volver al menú</button></div>`;
  host.querySelector('button').addEventListener('click', onExit);
  host.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
