from pathlib import Path
import subprocess
import unittest

class SolarLabTests(unittest.TestCase):
    def test_five_levels_accept_working_designs_and_reject_overvoltage(self):
        subprocess.run(['node','--input-type=module','-e','''
import assert from 'node:assert/strict';
import { LEVELS } from './games/solar-lab/levels.js';
const designs=[{tilt:55},{cfg:'2S2P',g:1000},{v:'12',chem:'LFP',ah:150,dod:70,ctl:'MPPT'},
 {gL:1,gR:1,hy:50,st:4},{n:3,b:2,m:'60',inv:'2000'}];
assert.equal(LEVELS.length,5);
for(const [i,level] of LEVELS.entries()) {
 const defaults=Object.fromEntries(level.controls.map(c=>[c.id,c.v]));
 const result=level.simulate({...defaults,...designs[i]});
 assert.equal(result.ok,true,level.title+': '+result.msg);
 assert.ok(result.fr.length>0);
}
assert.equal(LEVELS[1].simulate({cfg:'4S1P',g:1000}).ok,false);
assert.equal(LEVELS[0].simulate({tilt:35}).ok,false);
'''],cwd=Path(__file__).resolve().parents[1],check=True)
