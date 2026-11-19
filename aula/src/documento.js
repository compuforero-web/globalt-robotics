// Texto exacto de una versión de los términos de uso o de la autorización de datos (solo lectura).
// El texto se muestra como texto plano (textContent): nunca se interpreta como HTML.
import * as api from './api.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
(async () => {
  try {
    const d = await api.documento(q.get('tipo') || '', q.get('version') || '');
    document.title = d.titulo + ' · Aula GLOBALT ROBOTICS';
    $('#titulo').textContent = d.titulo;
    $('#version').textContent = d.version;
    $('#vigencia').textContent = d.vigente_desde
      ? ' · vigente desde el ' + new Date(d.vigente_desde).toLocaleDateString('es-CO', { dateStyle: 'long' }) : '';
    $('#finalidad').textContent = d.finalidad;
    $('#texto').textContent = d.texto;
    $('#huella').textContent = d.sha256;
    $('#aviso-prueba').hidden = !d.prueba;
    $('#documento').hidden = false;
    $('#estado').hidden = true;
  } catch (error) {
    $('#estado').textContent = error.status === 404 || error.status === 422 ? 'Este documento no está disponible.' : error.message;
    $('#estado').dataset.tipo = 'error';
  }
})();
