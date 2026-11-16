// Menú selector de niveles con estado bloqueado/desbloqueado/completado.
import { LEVELS } from '../levels/catalog.js';
import { isUnlocked, isCompleted } from '../core/progress.js';
import { ICONS } from '../assets/icons.js';

function cardHTML(level) {
  const unlocked = isUnlocked(level.id);
  const done = isCompleted(level.id);
  const state = done ? 'done' : unlocked ? 'open' : 'locked';
  const badge = done ? ICONS.check : unlocked ? '' : ICONS.lock;
  const label = unlocked ? `Nivel ${level.id}: ${level.title}` : `Nivel ${level.id} bloqueado`;
  return `
    <li>
      <button type="button" class="level-card ${state}" data-level="${level.id}"
              ${unlocked ? '' : 'aria-disabled="true"'} aria-label="${label}">
        <span class="level-icon">${ICONS[level.icon]}</span>
        <span class="level-body">
          <span class="level-num">Nivel ${level.id}</span>
          <strong class="level-title">${level.title}</strong>
          <span class="level-summary">${level.summary}</span>
          <span class="level-tags">${level.skills.map((s) => `<em>${s.replace(/</g, '&lt;')}</em>`).join('')}</span>
        </span>
        <span class="level-badge">${badge}</span>
      </button>
    </li>`;
}

/** Pinta el menú en `root` y llama a onSelect(id) al elegir un nivel desbloqueado. */
export function renderMenu(root, onSelect) {
  root.innerHTML = `
    <section class="menu">
      <p class="menu-intro">Aprende robótica paso a paso: conecta cables, programa y prueba.
        Completa cada nivel para desbloquear el siguiente.</p>
      <ol class="level-list">${LEVELS.map(cardHTML).join('')}</ol>
      <p class="toast" role="status" hidden></p>
    </section>`;

  const toast = root.querySelector('.toast');
  root.querySelector('.level-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.level-card');
    if (!btn) return;
    const id = Number(btn.dataset.level);
    if (isUnlocked(id)) return onSelect(id);
    toast.textContent = `🔒 Completa el Nivel ${id - 1} para desbloquear este nivel.`;
    toast.hidden = false;
    btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.hidden = true; }, 2500);
  });
}
