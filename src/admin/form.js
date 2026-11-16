// Construye formularios a partir de los esquemas y lee sus valores.
import { esc } from '../utils/dom.js';
import { getYouTubeId, ytThumb } from '../utils/youtube.js';

const optionPairs = (options) => options.map((o) => (Array.isArray(o) ? o : [o, o]));

function fieldHtml(field, value) {
  const id = `f-${field.name}`;
  const req = field.required ? 'required' : '';
  const ro = field.readonly ? 'readonly' : '';
  const ph = field.placeholder ? `placeholder="${esc(field.placeholder)}"` : '';
  const help = field.help ? `<small class="field__help">${esc(field.help)}</small>` : '';
  const label = `<label for="${id}">${esc(field.label)}${field.required ? ' *' : ''}</label>`;

  switch (field.type) {
    case 'textarea':
      return `<div class="field field--wide">${label}<textarea id="${id}" name="${field.name}" rows="3" ${ph} ${req}>${esc(value)}</textarea>${help}</div>`;
    case 'list':
      return `<div class="field field--wide">${label}<textarea id="${id}" name="${field.name}" rows="5" ${req}>${esc((value || []).join('\n'))}</textarea>${help}</div>`;
    case 'select':
      return `<div class="field">${label}<select id="${id}" name="${field.name}">${optionPairs(field.options)
        .map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}</div>`;
    case 'checkbox':
      return `<div class="field field--check"><label class="switch"><input type="checkbox" id="${id}" name="${field.name}" ${value ? 'checked' : ''}><span></span>${esc(field.label)}</label>${help}</div>`;
    case 'number':
      return `<div class="field">${label}<input id="${id}" type="number" name="${field.name}" value="${esc(value ?? 0)}" step="1">${help}</div>`;
    case 'youtube': {
      const vid = getYouTubeId(value);
      return `<div class="field field--wide">${label}<input id="${id}" type="url" name="${field.name}" value="${esc(value)}" ${ph} data-youtube>
        <div class="yt-preview" data-yt-preview>${vid ? `<img src="${ytThumb(vid)}" alt="Miniatura del video">` : '<span>La miniatura aparecerá aquí</span>'}</div>${help}</div>`;
    }
    default:
      return `<div class="field">${label}<input id="${id}" type="text" name="${field.name}" value="${esc(value)}" ${ph} ${req} ${ro}>${help}</div>`;
  }
}

export function buildForm(schema, record = {}) {
  return schema.fields
    .map((f) => fieldHtml(f, record[f.name] ?? (record.id ? '' : f.default ?? '')))
    .join('');
}

/** Conecta la detección automática del ID de YouTube con su vista previa. */
export function wireForm(form) {
  const yt = form.querySelector('[data-youtube]');
  if (!yt) return;
  const idInput = form.querySelector('[name="youtube_id"]');
  const preview = form.querySelector('[data-yt-preview]');
  const update = () => {
    const vid = getYouTubeId(yt.value);
    if (idInput) idInput.value = vid;
    preview.innerHTML = vid
      ? `<img src="${ytThumb(vid)}" alt="Miniatura del video">`
      : `<span>${yt.value ? '⚠️ Enlace de YouTube no reconocido' : 'La miniatura aparecerá aquí'}</span>`;
  };
  yt.addEventListener('input', update);
}

export function readForm(schema, form, original = {}) {
  const record = { ...original };
  for (const f of schema.fields) {
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') record[f.name] = el.checked;
    else if (f.type === 'number') record[f.name] = Number(el.value) || 0;
    else if (f.type === 'list') record[f.name] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else record[f.name] = el.value.trim();
  }
  if ('youtube_url' in record) record.youtube_id = getYouTubeId(record.youtube_url);
  return record;
}
