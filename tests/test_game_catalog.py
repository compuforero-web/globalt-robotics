"""Exercise the real catalog migration with existing browser storage."""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

class CatalogIntegrationTests(unittest.TestCase):
    def test_existing_catalog_and_progress_are_preserved(self):
        subprocess.run(['node', '--input-type=module', '-e', '''
import assert from 'node:assert/strict';
import { CONFIG } from './src/config.js';
import { SEED } from './src/data/seed.js';
import { migrateLocalGames } from './src/data/game-catalog-migration.js';
const storage = new Map([['robolab.progress.v1', '{"unlocked":3}'],
                         ['codicamp_stars_v2', '{"1":3}']]);
globalThis.localStorage = {
 getItem: (key) => storage.get(key) ?? null,
 setItem: (key, value) => storage.set(key, value),
};
const customized = { id: 'custom', title: 'Mi juego', url: 'games/custom/index.html' };
const robolab = { ...SEED.games[0], title: 'Título personalizado',
 description: 'Programa un robot con bloques de movimiento, llega a la meta esquivando obstáculos y mira el código C++ de Arduino que se genera en tiempo real. 6 niveles progresivos.' };
const result = migrateLocalGames([customized, robolab]);
assert.deepEqual(result.find(x => x.id === 'custom'), customized);
assert.equal(result.find(x => x.id === robolab.id).title, 'Título personalizado');
assert.match(result.find(x => x.id === robolab.id).description, /5 niveles/);
assert.equal(result.filter(x => x.id === 'game-codicamp-agrotech').length, 1);
assert.equal(storage.get('robolab.progress.v1'), '{"unlocked":3}');
assert.equal(storage.get('codicamp_stars_v2'), '{"1":3}');
assert.deepEqual(migrateLocalGames(result), result);
// An intentional admin removal after migration must not be undone.
assert.deepEqual(migrateLocalGames([customized]), [customized]);
// A fresh browser also gets exactly the two playable games.
storage.clear();
const fresh = migrateLocalGames(SEED.games);
assert.equal(fresh.filter(x => x.url).length, 2);
'''], cwd=ROOT, check=True)
