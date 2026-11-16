// Punto de entrada: router mínimo entre menú y niveles.
import { renderMenu } from './ui/menu.js';
import { resetProgress } from './core/progress.js';
import { LEVELS } from './levels/catalog.js';
import { ICONS } from './assets/icons.js';
import { mountLevel1 } from './levels/level1/index.js';
import { mountLevel2 } from './levels/level2/index.js';
import { mountLevel3 } from './levels/level3/index.js';
import { mountLevel4 } from './levels/level4/index.js';
import { mountLevel5 } from './levels/level5/index.js';

const app = document.getElementById('app');
document.getElementById('brand-logo').innerHTML = ICONS.logo;

const LEVEL_MODULES = { 1: mountLevel1, 2: mountLevel2, 3: mountLevel3, 4: mountLevel4, 5: mountLevel5 };
let cleanup = null;

function showMenu() {
  cleanup?.();
  cleanup = null;
  renderMenu(app, openLevel);
}

// Niveles aún sin módulo muestran un marcador temporal.
function openLevel(id) {
  if (LEVEL_MODULES[id]) {
    cleanup = LEVEL_MODULES[id](app, { onExit: showMenu });
    return;
  }
  const level = LEVELS.find((l) => l.id === id);
  app.innerHTML = `
    <section class="placeholder">
      <button type="button" class="back-btn">← Volver al menú</button>
      <h2>Nivel ${id}: ${level.title}</h2>
      <p>Este nivel está en construcción.</p>
    </section>`;
  app.querySelector('.back-btn').addEventListener('click', showMenu);
}

document.getElementById('reset-progress').addEventListener('click', () => {
  if (confirm('¿Reiniciar todo el progreso? Solo el Nivel 1 quedará desbloqueado.')) {
    resetProgress();
    showMenu();
  }
});

showMenu();
