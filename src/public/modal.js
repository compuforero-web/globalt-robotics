// Modal a pantalla completa para jugar (iframe) con opción de abrir en nueva pestaña.
import { $ } from '../utils/dom.js';

export function setupGameModal(dialog) {
  const frame = $('iframe', dialog);
  const title = $('.modal__title', dialog);
  const newTab = $('[data-newtab]', dialog);
  const close = () => dialog.close();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-play]');
    if (!btn) return;
    const url = btn.dataset.play;
    title.textContent = btn.dataset.title || 'Juego';
    newTab.href = url;
    frame.src = url;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else window.open(url, '_blank', 'noopener');
  });

  $('[data-close]', dialog).addEventListener('click', close);
  $('[data-fullscreen]', dialog).addEventListener('click', () => {
    const target = $('.modal__frame', dialog);
    if (document.fullscreenElement) document.exitFullscreen();
    else target.requestFullscreen?.().catch(() => window.open(frame.src, '_blank', 'noopener'));
  });
  dialog.addEventListener('close', () => { frame.src = 'about:blank'; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
}
