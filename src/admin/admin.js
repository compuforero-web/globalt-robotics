// Controlador del panel /admin: login, navegación por pestañas y carga de paneles.
import { $, $$ } from '../utils/dom.js';
import { getMode } from '../services/db.js';
import { toast } from '../ui/toast.js';
import { login, logout, isLoggedIn, currentUserLabel } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderCrud } from './crud.js';
import { renderSettings } from './settings-panel.js';
import { renderBackup } from './backup.js';

const VIEWS = {
  dashboard: (p) => renderDashboard(p, go),
  games: (p) => renderCrud(p, 'games'),
  courses: (p) => renderCrud(p, 'courses'),
  tutorials: (p) => renderCrud(p, 'tutorials'),
  workshops: (p) => renderCrud(p, 'workshops'),
  settings: renderSettings,
  backup: renderBackup,
};

async function go(view) {
  if (!VIEWS[view]) view = 'dashboard';
  $$('.side__link').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  const panel = $('#panel');
  panel.setAttribute('aria-busy', 'true');
  try {
    await VIEWS[view](panel);
  } catch (err) {
    console.error(err);
    panel.innerHTML = `<div class="notice notice--warn">No se pudo cargar esta sección: ${err.message}</div>`;
  }
  panel.removeAttribute('aria-busy');
  $('.side').classList.remove('is-open');
  panel.focus({ preventScroll: true });
}

async function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#user-label').textContent = await currentUserLabel();
  go(location.hash.slice(1) || 'dashboard');
}

async function init() {
  const mode = await getMode();
  $('#mode-badge').textContent = mode === 'supabase' ? 'Supabase Auth' : 'Modo local (contraseña maestra)';
  $('#email-field').hidden = mode !== 'supabase';
  $('#login-email').required = mode === 'supabase';
  $('#mode-help').hidden = mode === 'supabase';

  if (await isLoggedIn()) return showApp();
  $('#login').hidden = false;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-form button[type="submit"]');
    btn.disabled = true;
    $('#login-error').textContent = '';
    try {
      await login({ email: $('#login-email').value.trim(), password: $('#login-password').value });
      await showApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

$('.side__nav').addEventListener('click', (e) => {
  const link = e.target.closest('[data-view]');
  if (link) go(link.dataset.view);
});
$('#logout').addEventListener('click', async () => {
  await logout();
  toast('Sesión cerrada.');
  location.reload();
});
$('#menu-toggle').addEventListener('click', () => $('.side').classList.toggle('is-open'));
$$('#editor [data-cancel]').forEach((b) => b.addEventListener('click', () => $('#editor').close()));

init().catch((err) => {
  console.error('[GLOBALT admin]', err);
  $('#login').hidden = false;
});
