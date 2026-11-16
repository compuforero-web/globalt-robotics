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
// A browser already migrated for RoboLab/CodiCamp must receive Radar too.
storage.delete(`${CONFIG.STORAGE_PREFIX}games_radar_20261116`);
const pending = { id:'game-sensor-ultrasonico', title:'Mi radar', url:'', preview:'',
 description:'Calibra un sensor HC-SR04 y programa la reacción del robot según la distancia medida. Próximamente.' };
const upgraded = migrateLocalGames([customized, pending]);
assert.equal(upgraded.length, 2);
assert.equal(upgraded[1].title, 'Mi radar');
assert.equal(upgraded[1].url, 'games/radar-ultrasonico/index.html');
assert.match(upgraded[1].description, /5 retos/);
assert.deepEqual(upgraded[0], customized);
storage.delete(`${CONFIG.STORAGE_PREFIX}games_radar_20261116`);
const external = { ...pending, url:'https://example.invalid/mi-radar' };
assert.deepEqual(migrateLocalGames([external]), [external]);
// A previously updated browser receives Sumo without restoring deleted games.
storage.delete(`${CONFIG.STORAGE_PREFIX}games_sumo_20261116`);
storage.set('sumoBotChallenge.v1', '{"done":[1]}');
const pendingSumo = {id:'game-sumo-bot',title:'Mi Sumo',url:'',preview:'',description:'Descripción propia'};
const sumo = migrateLocalGames([customized,pendingSumo]);
assert.equal(sumo.length,2);
assert.equal(sumo[1].url,'games/sumo-bot-challenge/index.html');
assert.equal(sumo[1].title,'Mi Sumo');
assert.equal(sumo[1].description,'Descripción propia');
assert.equal(storage.get('sumoBotChallenge.v1'),'{"done":[1]}');
assert.deepEqual(migrateLocalGames([customized]),[customized]);
// A fresh browser also gets exactly the four playable games.
storage.clear();
const fresh = migrateLocalGames(SEED.games);
assert.equal(fresh.filter(x => x.url).length, 4);
'''], cwd=ROOT, check=True)
