/**
 * Autenticación del panel.
 * - Producción (Supabase configurado): Supabase Auth con correo + contraseña.
 * - Pruebas locales: contraseña maestra de src/config.js (sesión de 8 horas en sessionStorage).
 *   Ojo: la contraseña maestra vive en el navegador; úsala solo para pruebas.
 */
import { CONFIG } from '../config.js';
import { getSupabase } from '../services/supabase.js';

const SESSION_KEY = `${CONFIG.STORAGE_PREFIX}admin_session`;
const SESSION_HOURS = 8;

export async function login({ email, password }) {
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Correo o contraseña incorrectos.');
    return;
  }
  if (!password || password !== CONFIG.ADMIN_MASTER_PASSWORD) throw new Error('Contraseña incorrecta.');
  sessionStorage.setItem(SESSION_KEY, String(Date.now()));
}

export async function isLoggedIn() {
  const sb = await getSupabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    return Boolean(data.session);
  }
  const started = Number(sessionStorage.getItem(SESSION_KEY));
  return Boolean(started) && Date.now() - started < SESSION_HOURS * 3600 * 1000;
}

export async function currentUserLabel() {
  const sb = await getSupabase();
  if (sb) {
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? 'Administrador';
  }
  return 'Administrador (modo local)';
}

export async function logout() {
  const sb = await getSupabase();
  if (sb) await sb.auth.signOut();
  sessionStorage.removeItem(SESSION_KEY);
}
