// Resumen: conteos y estado de la conexión de datos.
import * as db from '../services/db.js';
import { icon } from '../ui/icons.js';

const CARDS = [
  { table: 'games', label: 'Juegos', icon: 'robot' },
  { table: 'courses', label: 'Cursos', icon: 'code' },
  { table: 'tutorials', label: 'Videotutoriales', icon: 'play' },
  { table: 'workshops', label: 'Talleres', icon: 'users' },
];

export async function renderDashboard(panel, go) {
  const mode = await db.getMode();
  const counts = await Promise.all(CARDS.map((c) => db.list(c.table).then((r) => r.length)));
  const settings = await db.getSettings();
  panel.innerHTML = `
    <header class="panel__head"><div><h1>Panel de administración</h1>
      <p class="muted">Publica y edita el contenido de GLOBALT ROBOTICS sin tocar código.</p></div>
      <a class="btn btn--outline" href="/" target="_blank" rel="noopener">${icon('external')} Ver sitio</a></header>
    ${mode === 'local' ? `<div class="notice notice--warn">
      <strong>Modo local activo.</strong> Los cambios se guardan solo en <em>este navegador</em> (localStorage) y los visitantes aún no los ven.
      Para publicarlos para todos, conecta Supabase (ver <code>README_DESPLIEGUE.md</code>) y usa <button class="link-btn" data-go="backup">Respaldo</button> para migrar tu contenido.
    </div>` : `<div class="notice notice--ok"><strong>Conectado a Supabase.</strong> Los cambios se publican al instante para todos los visitantes.</div>`}
    <div class="stats">${CARDS.map((c, i) => `
      <button class="stat" data-go="${c.table}">${icon(c.icon)}<strong>${counts[i]}</strong><span>${c.label}</span></button>`).join('')}
    </div>
    <div class="notice">
      Cintillo de anuncios: <strong>${settings.banner_active ? 'ACTIVO' : 'inactivo'}</strong>
      ${settings.banner_active ? `— “${settings.banner_text.replace(/[<>&]/g, '')}”` : ''}
      · <button class="link-btn" data-go="settings">Editar</button>
    </div>`;
  panel.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}
