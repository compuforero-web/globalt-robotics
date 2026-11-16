// Helpers mínimos de DOM y escape seguro de HTML.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Solo permite URLs http(s), rutas relativas o anclas (evita javascript:). */
export function safeUrl(url) {
  const value = String(url ?? '').trim();
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || /^[\w./#?=&%-]+$/.test(value)) return value;
  return '';
}

export const normalize = (text) =>
  String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const slug = (text) => normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
