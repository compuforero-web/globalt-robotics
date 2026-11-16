/**
 * Capa de datos híbrida.
 * - Con Supabase configurado → lee/escribe en las tablas remotas.
 * - Sin Supabase → catálogo precargado (seed.js) + persistencia en localStorage.
 * API idéntica en ambos modos para que la web y el /admin no cambien.
 */
import { CONFIG } from '../config.js';
import { getSupabase } from './supabase.js';
import { SEED } from '../data/seed.js';
import { migrateLocalGames } from '../data/game-catalog-migration.js';

export const TABLES = ['games', 'courses', 'tutorials', 'workshops'];
const SETTINGS_KEY = 'site';

const storageKey = (table) => `${CONFIG.STORAGE_PREFIX}${table}`;
const clone = (obj) => JSON.parse(JSON.stringify(obj));
const byOrder = (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

function localRead(table) {
  try {
    const raw = localStorage.getItem(storageKey(table));
    if (raw) {
      const items = JSON.parse(raw);
      return table === 'games' ? migrateLocalGames(items) : items;
    }
  } catch (err) {
    console.warn('[GLOBALT] localStorage no disponible:', err);
  }
  const defaults = clone(SEED[table] ?? []);
  return table === 'games' ? migrateLocalGames(defaults) : defaults;
}

function localWrite(table, data) {
  try {
    localStorage.setItem(storageKey(table), JSON.stringify(data));
  } catch (err) {
    throw new Error('No se pudo guardar en este navegador (almacenamiento bloqueado o lleno).');
  }
}

export async function getMode() {
  return (await getSupabase()) ? 'supabase' : 'local';
}

export async function list(table) {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from(table).select('*').order('sort_order', { ascending: true });
    if (!error) return data ?? [];
    console.error(`[GLOBALT] Error leyendo "${table}" en Supabase:`, error.message);
    return clone(SEED[table] ?? []).sort(byOrder);
  }
  return localRead(table).sort(byOrder);
}

export async function save(table, item) {
  const record = { ...item, id: item.id || newId(), updated_at: new Date().toISOString() };
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from(table).upsert(record).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const items = localRead(table);
  const idx = items.findIndex((x) => x.id === record.id);
  if (idx >= 0) items[idx] = record;
  else items.push(record);
  localWrite(table, items);
  return record;
}

export async function remove(table, id) {
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  localWrite(table, localRead(table).filter((x) => x.id !== id));
}

export async function getSettings() {
  const defaults = clone(SEED.settings);
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    if (error) console.error('[GLOBALT] Error leyendo ajustes:', error.message);
    return { ...defaults, ...(data?.value ?? {}) };
  }
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(storageKey('settings')) || '{}'); } catch { stored = {}; }
  return { ...defaults, ...stored };
}

export async function saveSettings(value) {
  const sb = await getSupabase();
  if (sb) {
    const { error } = await sb.from('settings').upsert({ key: SETTINGS_KEY, value });
    if (error) throw new Error(error.message);
    return value;
  }
  localWrite('settings', value);
  return value;
}

export async function exportAll() {
  const backup = { app: 'globalt-robotics', version: 1, exported_at: new Date().toISOString() };
  backup.settings = await getSettings();
  for (const table of TABLES) backup[table] = await list(table);
  return backup;
}

export async function importAll(backup) {
  if (!backup || backup.app !== 'globalt-robotics') {
    throw new Error('El archivo no es un respaldo válido de GLOBALT ROBOTICS.');
  }
  const sb = await getSupabase();
  for (const table of TABLES) {
    if (!Array.isArray(backup[table])) continue;
    const rows = backup[table].map((r) => ({ ...r, id: r.id || newId() }));
    if (sb) {
      const ids = rows.map((r) => `"${r.id}"`).join(',');
      const del = sb.from(table).delete();
      const { error: delErr } = rows.length ? await del.not('id', 'in', `(${ids})`) : await del.neq('id', '');
      if (delErr) throw new Error(delErr.message);
      if (rows.length) {
        const { error } = await sb.from(table).upsert(rows);
        if (error) throw new Error(error.message);
      }
    } else {
      localWrite(table, rows);
    }
  }
  if (backup.settings) await saveSettings(backup.settings);
}

/** Solo modo local: borra los cambios del navegador y vuelve al catálogo inicial. */
export function resetLocal() {
  [...TABLES, 'settings'].forEach((t) => localStorage.removeItem(storageKey(t)));
}
