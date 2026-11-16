import { setupRobotHero } from './robot-hero/index.js';
// Punto de entrada de la web pública.
import * as db from '../services/db.js';
import { $, $$ } from '../utils/dom.js';
import { setWhatsAppNumber, waMsg } from '../utils/whatsapp.js';
import { renderGames } from './render-games.js';
import { renderCourses } from './render-courses.js';
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
  renderVideos($('#videos-grid'), $('#player'), tutorials);
  renderWorkshops($('#workshops-grid'), workshops);

  $$('[data-filter-grid]').forEach((grid) => {
    const chips = $(`[data-chips-for="${grid.id}"]`);
    if (chips) setupChips(chips, grid, $$('[data-search]', grid));
  });

  $('#stat-games').textContent = games.filter((g) => g.url).length;
  $('#stat-courses').textContent = courses.length;
  $('#footer-location').textContent = settings.location;
  $('#year').textContent = new Date().getFullYear();
}

init().catch((err) => console.error('[GLOBALT] Error iniciando la web:', err));
