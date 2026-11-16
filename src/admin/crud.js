// Gestor CRUD visual genérico: lista, crear, editar y eliminar registros de una tabla.
import * as db from '../services/db.js';
import { esc } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { ytThumb } from '../utils/youtube.js';
import { SCHEMAS } from './schemas.js';
import { buildForm, wireForm, readForm } from './form.js';

function cell(col, row) {
  const raw = row[col.key];
  switch (col.type) {
    case 'bool': return raw ? '<span class="pill pill--on">Sí</span>' : '<span class="pill">No</span>';
    case 'tag': return raw ? `<span class="tag">${esc(col.map?.[raw] ?? raw)}</span>` : '—';
    case 'thumb': return raw ? `<img class="thumb" src="${ytThumb(raw)}" alt="" loading="lazy">` : '<span class="thumb thumb--empty">Sin video</span>';
    default: return esc(raw) || '—';
  }
}

export async function renderCrud(panel, table) {
  const schema = SCHEMAS[table];
  const rows = await db.list(table);
  panel.innerHTML = `
    <header class="panel__head">
      <div><h1>${esc(schema.title)}</h1><p class="muted">${esc(schema.intro)}</p></div>
      <button class="btn btn--primary" data-new>${icon('plus')} Nuevo ${esc(schema.singular)}</button>
    </header>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${schema.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th class="t-actions">Acciones</th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => `<tr data-id="${esc(r.id)}">
          ${schema.columns.map((c) => `<td data-label="${esc(c.label)}">${cell(c, r)}</td>`).join('')}
          <td class="t-actions">
            <button class="icon-btn" data-edit aria-label="Editar ${esc(r.title)}">${icon('edit')}</button>
            <button class="icon-btn icon-btn--danger" data-del aria-label="Eliminar ${esc(r.title)}">${icon('trash')}</button>
          </td></tr>`).join('') : `<tr><td colspan="${schema.columns.length + 1}" class="empty-row">Aún no hay registros. Crea el primero.</td></tr>`}
        </tbody>
      </table>
    </div>`;

  panel.querySelector('[data-new]').addEventListener('click', () => openEditor(panel, table, null, rows));
  panel.querySelector('tbody').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const row = rows.find((r) => r.id === tr.dataset.id);
    if (e.target.closest('[data-edit]')) openEditor(panel, table, row, rows);
    if (e.target.closest('[data-del]')) {
      if (!confirm(`¿Eliminar "${row.title}"? Esta acción no se puede deshacer.`)) return;
      try {
        await db.remove(table, row.id);
        toast(`${schema.singular[0].toUpperCase()}${schema.singular.slice(1)} eliminado.`);
        renderCrud(panel, table);
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}

function openEditor(panel, table, record, rows) {
  const schema = SCHEMAS[table];
  const dialog = document.getElementById('editor');
  const form = dialog.querySelector('form');
  const nextOrder = rows.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0) + 1;
  const base = record ?? { sort_order: nextOrder };

  dialog.querySelector('.editor__title').textContent = record ? `Editar ${schema.singular}` : `Nuevo ${schema.singular}`;
  form.querySelector('.editor__fields').innerHTML = buildForm(schema, base);
  wireForm(form);
  dialog.showModal();
  form.querySelector('input, textarea, select')?.focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'cancel') { dialog.close(); return; }
    const saveBtn = form.querySelector('[value="save"]');
    saveBtn.disabled = true;
    try {
      await db.save(table, readForm(schema, form, record ?? {}));
      dialog.close();
      toast('Cambios guardados y publicados.');
      renderCrud(panel, table);
    } catch (err) {
      toast(`No se pudo guardar: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  };
}
