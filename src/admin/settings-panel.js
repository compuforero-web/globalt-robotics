// Banner de anuncios + ajustes generales (WhatsApp, ubicación).
import * as db from '../services/db.js';
import { esc } from '../utils/dom.js';
import { toast } from '../ui/toast.js';

export async function renderSettings(panel) {
  const s = await db.getSettings();
  panel.innerHTML = `
    <header class="panel__head"><div><h1>Banner de anuncios y ajustes</h1>
      <p class="muted">Activa el cintillo superior de inscripciones abiertas y ajusta los datos de contacto.</p></div></header>
    <form class="card-form" id="settings-form">
      <h2>Cintillo de anuncios</h2>
      <div class="field field--check"><label class="switch">
        <input type="checkbox" name="banner_active" ${s.banner_active ? 'checked' : ''}><span></span>Mostrar cintillo en la web</label></div>
      <div class="field field--wide"><label for="s-text">Texto del anuncio</label>
        <input id="s-text" name="banner_text" value="${esc(s.banner_text)}" maxlength="160"></div>
      <div class="field"><label for="s-cta">Texto del botón</label>
        <input id="s-cta" name="banner_cta" value="${esc(s.banner_cta)}" maxlength="30"></div>
      <div class="banner-preview" aria-label="Vista previa">
        <span data-prev-text>${esc(s.banner_text)}</span> <u data-prev-cta>${esc(s.banner_cta)} →</u>
      </div>

      <h2>Contacto</h2>
      <div class="field"><label for="s-wa">Número de WhatsApp (con indicativo, sin +)</label>
        <input id="s-wa" name="whatsapp_number" value="${esc(s.whatsapp_number)}" inputmode="numeric" pattern="[0-9]{8,15}"></div>
      <div class="field field--wide"><label for="s-msg">Mensaje general prellenado</label>
        <input id="s-msg" name="whatsapp_default_message" value="${esc(s.whatsapp_default_message)}"></div>
      <div class="field"><label for="s-loc">Ubicación</label>
        <input id="s-loc" name="location" value="${esc(s.location)}"></div>
      <div class="field"><label for="s-mail">Correo (opcional)</label>
        <input id="s-mail" type="email" name="email" value="${esc(s.email)}"></div>
      <div class="form-actions"><button class="btn btn--primary" type="submit">Guardar ajustes</button></div>
    </form>`;

  const form = panel.querySelector('#settings-form');
  form.addEventListener('input', () => {
    panel.querySelector('[data-prev-text]').textContent = form.banner_text.value;
    panel.querySelector('[data-prev-cta]').textContent = `${form.banner_cta.value} →`;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = {
      ...s,
      banner_active: form.banner_active.checked,
      banner_text: form.banner_text.value.trim(),
      banner_cta: form.banner_cta.value.trim(),
      whatsapp_number: form.whatsapp_number.value.replace(/\D/g, ''),
      whatsapp_default_message: form.whatsapp_default_message.value.trim(),
      location: form.location.value.trim(),
      email: form.email.value.trim(),
    };
    try {
      await db.saveSettings(value);
      toast('Ajustes guardados.');
    } catch (err) { toast(`No se pudo guardar: ${err.message}`, 'error'); }
  });
}
