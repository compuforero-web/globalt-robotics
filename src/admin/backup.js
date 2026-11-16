// Exportar / importar respaldo JSON de toda la configuración.
import * as db from '../services/db.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

export async function renderBackup(panel) {
  const mode = await db.getMode();
  panel.innerHTML = `
    <header class="panel__head"><div><h1>Respaldo de datos</h1>
      <p class="muted">Descarga todo el contenido (juegos, cursos, videos, talleres y ajustes) en un archivo JSON o restáuralo con un clic.</p></div></header>
    <div class="backup-grid">
      <article class="card-form">
        <h2>${icon('download')} Exportar</h2>
        <p class="muted">Guarda este archivo en un lugar seguro. Sirve también para pasar el contenido del modo local a Supabase.</p>
        <button class="btn btn--primary" data-export>Descargar respaldo .json</button>
      </article>
      <article class="card-form">
        <h2>${icon('upload')} Importar / Restaurar</h2>
        <p class="muted">Reemplaza el contenido actual por el del archivo. Recomendado: exporta primero un respaldo.</p>
        <label class="btn btn--outline file-btn">Elegir archivo .json<input type="file" accept="application/json,.json" data-import hidden></label>
      </article>
      ${mode === 'local' ? `<article class="card-form card-form--danger">
        <h2>Restablecer catálogo inicial</h2>
        <p class="muted">Solo modo local: borra los cambios guardados en este navegador y vuelve al contenido precargado.</p>
        <button class="btn btn--danger" data-reset>Restablecer</button>
      </article>` : ''}
    </div>`;

  panel.querySelector('[data-export]').addEventListener('click', async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `globalt-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Respaldo descargado.');
  });

  panel.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('¿Reemplazar todo el contenido actual por el del respaldo?')) return;
      await db.importAll(data);
      toast('Respaldo restaurado correctamente.');
    } catch (err) {
      toast(err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message, 'error');
    }
  });

  panel.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!confirm('¿Borrar los cambios locales y volver al catálogo inicial?')) return;
    db.resetLocal();
    toast('Catálogo inicial restablecido.');
  });
}
