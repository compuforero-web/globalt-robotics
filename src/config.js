/**
 * GLOBALT ROBOTICS — Configuración central
 * ----------------------------------------------------------------
 * 1) MODO LOCAL (por defecto): deja SUPABASE_URL y SUPABASE_ANON_KEY vacíos.
 *    La web usa el catálogo precargado + localStorage del navegador.
 * 2) MODO PRODUCCIÓN: pega aquí las 2 claves de tu proyecto Supabase
 *    (Supabase → Project Settings → API). La web leerá y escribirá en Supabase
 *    y el /admin usará Supabase Auth (correo + contraseña).
 */
export const CONFIG = {
  SUPABASE_URL: '',        // Ej: 'https://abcdefghijk.supabase.co'
  SUPABASE_ANON_KEY: '',   // Ej: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

  // Contraseña maestra SOLO para pruebas locales (modo sin Supabase).
  // Cámbiala antes de publicar. En producción se usa Supabase Auth.
  ADMIN_MASTER_PASSWORD: 'globalt2026',

  WHATSAPP_NUMBER: '573144864187',
  SITE_NAME: 'GLOBALT ROBOTICS',
  STORAGE_PREFIX: 'globalt_v1_',
};

export function isSupabaseConfigured() {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } = CONFIG;
  return Boolean(url && key && url.startsWith('https://') && !url.includes('TU_PROYECTO'));
}
