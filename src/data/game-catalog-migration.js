// Actualización única del catálogo local; conserva contenidos y cambios del usuario.
import { CONFIG } from '../config.js';
import { SEED } from './seed.js';

const MARKER = `${CONFIG.STORAGE_PREFIX}games_catalog_20261116`;
const LEGACY_DESCRIPTION = 'Programa un robot con bloques de movimiento, llega a la meta esquivando obstáculos y mira el código C++ de Arduino que se genera en tiempo real. 6 niveles progresivos.';
const INTEGRATED_IDS = ['game-robolab-arduino', 'game-codicamp-agrotech'];

export function migrateLocalGames(items) {
  if (!Array.isArray(items)) return structuredClone(SEED.games);
  const result = items.map((item) => ({ ...item }));
  try {
    if (localStorage.getItem(MARKER)) return items;
    for (const id of INTEGRATED_IDS) {
      const builtin = SEED.games.find((game) => game.id === id);
      const existing = result.find((game) => game.id === id);
      if (!existing) result.push(structuredClone(builtin));
      else if (id === 'game-robolab-arduino' && existing.description === LEGACY_DESCRIPTION) {
        existing.description = builtin.description;
      }
    }
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}games`, JSON.stringify(result));
    localStorage.setItem(MARKER, '1');
  } catch {
    // Si el navegador bloquea el almacenamiento, mostrar igualmente los juegos.
    for (const id of INTEGRATED_IDS) {
      if (!result.some((game) => game.id === id)) {
        result.push(structuredClone(SEED.games.find((game) => game.id === id)));
      }
    }
  }
  return result;
}
