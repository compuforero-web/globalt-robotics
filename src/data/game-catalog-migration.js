// Actualización única del catálogo local; conserva contenidos y cambios del usuario.
import { CONFIG } from '../config.js';
import { SEED } from './seed.js';

const MARKER = `${CONFIG.STORAGE_PREFIX}games_catalog_20261116`;
const LEGACY_DESCRIPTION = 'Programa un robot con bloques de movimiento, llega a la meta esquivando obstáculos y mira el código C++ de Arduino que se genera en tiempo real. 6 niveles progresivos.';
const INTEGRATED_IDS = ['game-robolab-arduino', 'game-codicamp-agrotech'];

function migrateInitialGames(items) {
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


// Migración independiente: no vuelve a agregar juegos borrados en entregas previas.
function migrateRadarGames(items) {
  const initial = migrateInitialGames(items);
  const marker = `${CONFIG.STORAGE_PREFIX}games_radar_20261116`;
  const result = initial.map((item) => ({ ...item }));
  try {
    if (localStorage.getItem(marker)) return initial;
    const builtin = SEED.games.find((game) => game.id === 'game-sensor-ultrasonico');
    const existing = result.find((game) => game.id === builtin.id);
    if (!existing) result.push(structuredClone(builtin));
    else if (!existing.url) {
      existing.url = builtin.url;
      if (!existing.preview) existing.preview = builtin.preview;
      if (existing.description === 'Calibra un sensor HC-SR04 y programa la reacción del robot según la distancia medida. Próximamente.') {
        existing.description = builtin.description;
      }
    }
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}games`, JSON.stringify(result));
    localStorage.setItem(marker, '1');
  } catch { /* Si el navegador no puede guardar, se usa el catálogo actualizado en memoria. */ }
  return result;
}


// Activa Sumo una vez sin reinsertar juegos eliminados en migraciones previas.
function migrateSumoGames(items) {
  const initial = migrateRadarGames(items);
  const marker = `${CONFIG.STORAGE_PREFIX}games_sumo_20261116`;
  const result = initial.map((item) => ({ ...item }));
  try {
    if (localStorage.getItem(marker)) return initial;
    const builtin = SEED.games.find((game) => game.id === 'game-sumo-bot');
    const existing = result.find((game) => game.id === builtin.id);
    if (!existing) result.push(structuredClone(builtin));
    else if (!existing.url) {
      existing.url = builtin.url;
      if (!existing.preview) existing.preview = builtin.preview;
      if (existing.description === 'Proyecto final: diseña la estrategia de un robot de sumo con puente H, sensores de línea y lógica de ataque. Próximamente.') {
        existing.description = builtin.description;
      }
    }
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}games`, JSON.stringify(result));
    localStorage.setItem(marker, '1');
  } catch { /* El catálogo se mantiene en memoria si el navegador no permite guardarlo. */ }
  return result;
}


// SolarLab se agrega una sola vez, manteniendo los juegos y preferencias existentes.
function migrateSolarGames(items) {
  const initial = migrateSumoGames(items);
  const marker = `${CONFIG.STORAGE_PREFIX}games_solar_20261116`;
  const result = initial.map((item) => ({ ...item }));
  try {
    if (localStorage.getItem(marker)) return initial;
    if (!result.some((game) => game.id === 'game-solarlab')) {
      result.push(structuredClone(SEED.games.find((game) => game.id === 'game-solarlab')));
    }
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}games`, JSON.stringify(result));
    localStorage.setItem(marker, '1');
  } catch { /* La incorporación también funciona en memoria si no se permite guardar. */ }
  return result;
}

// Actualiza solo las portadas predeterminadas; conserva imágenes y datos personalizados.
const LEGACY_COVERS = {
  "game-robolab-arduino": "assets/img/robolab-preview.svg",
  "game-codicamp-agrotech": "assets/img/codicamp-preview.svg",
  "game-sensor-ultrasonico": "games/radar-ultrasonico/preview.svg",
  "game-sumo-bot": "games/sumo-bot-challenge/preview.svg",
  "game-solarlab": "games/solar-lab/preview.svg"
};

export function migrateLocalGames(items) {
  const initial = migrateSolarGames(items);
  let changed = false;
  const result = initial.map((game) => {
    if (!Object.hasOwn(LEGACY_COVERS, game.id) || game.preview !== LEGACY_COVERS[game.id]) return game;
    const builtin = SEED.games.find((item) => item.id === game.id);
    if (!builtin) return game;
    changed = true;
    return { ...game, preview: builtin.preview };
  });
  if (changed) {
    try { localStorage.setItem(`${CONFIG.STORAGE_PREFIX}games`, JSON.stringify(result)); }
    catch { /* Las portadas se actualizan en memoria si el almacenamiento está bloqueado. */ }
  }
  return changed ? result : initial;
}
