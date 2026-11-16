// Notificaciones breves (accesibles con aria-live).
let host;
export function toast(message, type = 'ok') {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.classList.add('is-out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
