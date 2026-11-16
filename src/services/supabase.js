// Carga perezosa del cliente oficial de Supabase (solo si hay credenciales).
import { CONFIG, isSupabaseConfigured } from '../config.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let clientPromise = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(SDK_URL)
      .then(({ createClient }) => createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY))
      .catch((err) => {
        console.error('[GLOBALT] No se pudo cargar Supabase, usando modo local.', err);
        return null;
      });
  }
  return clientPromise;
}
