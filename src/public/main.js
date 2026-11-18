import { setupRobotHero } from './robot-hero/index.js';
// Punto de entrada de la web pública.
import * as db from '../services/db.js';
import { $, $$ } from '../utils/dom.js';
import { setWhatsAppNumber, waMsg } from '../utils/whatsapp.js';
import { renderGames } from './render-games.js';
import { renderCourses } from './render-courses.js?v=inscripciones-1';
import { renderVideos } from './render-videos.js';
import { renderWorkshops, renderBanner } from './render-workshops.js';
import { setupChips, setupSearch } from './filters.js';
import { setupGameModal } from './modal.js';
import { setupNav, setupStaticWaLinks, setupWhatsAppFloat } from './nav.js';

async function init() {
  try { setupRobotHero(); } catch (error) { console.warn('[GLOBALT] Animación no disponible:', error); }
  setupNav();
  setupGameModal($('#game-modal'));
  setupSearch($('#site-search'), $('#search-status'));

  const [settings, games, courses, tutorials, workshops] = await Promise.all([
    db.getSettings(), db.list('games'), db.list('courses'), db.list('tutorials'), db.list('workshops'),
  ]);

  setWhatsAppNumber(settings.whatsapp_number);
  if (settings.whatsapp_default_message) waMsg.general = settings.whatsapp_default_message;
  setupStaticWaLinks();
  setupWhatsAppFloat();
  renderBanner($('#announce'), settings);

  renderGames($('#games-grid'), games);
  renderCourses($('#prog-grid'), courses.filter((c) => c.track !== 'ia'));
  renderCourses($('#ia-grid'), courses.filter((c) => c.track === 'ia'));
  // Sección y enlace de menú ocultos hasta que exista al menos un video publicado.
  const hasVideos = renderVideos($('#videos-grid'), $('#player'), tutorials);
  $('#videos').hidden = !hasVideos;
  $$('[data-section-link="videos"]').forEach((el) => { el.hidden = !hasVideos; });
  renderWorkshops($('#workshops-grid'), workshops);

  $$('[data-filter-grid]').forEach((grid) => {
    const chips = $(`[data-chips-for="${grid.id}"]`);
    if (chips) setupChips(chips, grid, $$('[data-search]', grid));
  });

  $('#stat-games').textContent = games.filter((g) => g.url).length;
  $('#stat-courses').textContent = courses.length;
  $('#footer-location').textContent = settings.location;
  $('#year').textContent = new Date().getFullYear();
  mostrarAulaSiDisponible();
}

// El acceso al aula solo aparece cuando su servicio responde en este sitio (evita enlaces rotos).
async function mostrarAulaSiDisponible() {
  try {
    const r = await fetch('api/aula/salud', { cache: 'no-store', headers: { Accept: 'application/json' } });
    const ok = r.ok && (r.headers.get('content-type') || '').includes('application/json') && (await r.json()).ok === true;
    $$('[data-aula-link]').forEach((el) => { el.hidden = !ok; });
  } catch { /* sin aula: el enlace sigue oculto */ }
}

init().catch((err) => console.error('[GLOBALT] Error iniciando la web:', err));
