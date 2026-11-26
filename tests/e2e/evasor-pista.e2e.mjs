// LAB_URL=... node tests/e2e/evasor-pista.e2e.mjs; necesita compilación real.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium,devices}=createRequire(import.meta.url)('playwright');
const BASE=process.env.LAB_URL||'http://127.0.0.1:8080/games/laboratorio-arduino/index.html',ID='arduino-evasor-pista',KEY='globalt.laboratorio.arduino.v1';
const fx=n=>readFileSync(new URL('../fixtures/laboratorio/'+n+'.ino',import.meta.url),'utf8');
const launchOptions={...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),
 ...(process.env.LAB_SINGLE_PROCESS==='1'?{args:['--single-process','--no-zygote','--disable-gpu','--in-process-gpu']}:{} )};
const pose=p=>p.locator('.robot-pose').getAttribute('transform');
async function run(p){await p.click('#btn-run');await p.waitForFunction(()=>document.querySelector('#sim-state').textContent==='En ejecución');}
for(const[name,options]of[['desktop',{viewport:{width:1440,height:1000}}],['mobile',devices['Pixel 7']]]){
 const browser=await chromium.launch(launchOptions);
 try{
  const ctx=await browser.newContext(options),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'?leccion='+ID);
  await p.waitForFunction(()=>document.querySelector('#service').dataset.kind!=='');
  assert.equal(await p.locator('.lesson-picker__list a').count(),15);
  assert.equal(await p.locator('#robot-track-select option').count(),3);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.equal(await p.evaluate(()=>new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size===document.querySelectorAll('[id]').length),true);
  const before=await pose(p);await run(p);await p.waitForTimeout(1300);
  assert.equal(await pose(p),before);
  assert.equal(await p.textContent('[data-world="path"]'),'0,00 m');
  assert.match(await p.textContent('[data-world="echo"]'),/µs/);await p.click('#btn-stop');
  console.log(name+': ejemplo inmóvil y sensor activo');
  await p.locator('.code-editor__input').fill(fx('pista-solucion'));await p.click('#btn-save');await run(p);
  await p.waitForFunction(()=>!/^0,00 m$/.test(document.querySelector('[data-world="path"]').textContent));
  assert.notEqual(await pose(p),before);await p.click('#btn-stop');
  const stopped=await pose(p);await p.waitForTimeout(300);assert.equal(await pose(p),stopped);
  await p.selectOption('#robot-track-select','columnas');
  assert.match(await p.textContent('#robot-world-title'),/Columnas/);
  await run(p);await p.waitForTimeout(500);
  await p.selectOption('#robot-track-select','pasillos');
  assert.match(await p.textContent('#robot-world-title'),/Pasillos/);
  await p.waitForFunction(()=>!/^0,00 m$/.test(document.querySelector('[data-world="path"]').textContent));
  console.log(name+': movimiento real, pausa y cambio de pista');
  if(name==='desktop'){
   await p.evaluate(()=>{
    window.pistaStatuses=[];
    new MutationObserver(()=>window.pistaStatuses.push(document.querySelector('#status').textContent))
     .observe(document.querySelector('#status'),{childList:true,subtree:true});
   });
   await p.click('#btn-check');
   assert.equal(await p.textContent('#sim-state'),'Detenida');
   assert.equal(await p.locator('#robot-track-select').isDisabled(),true);
   await p.waitForFunction(()=>/^(Reto superado|Todavía no)/.test(document.querySelector('#eval-result').textContent)||document.querySelector('#status').dataset.kind==='error',null,{timeout:300000});
   console.log('resultado:',await p.textContent('#status'));
   assert.match(await p.textContent('#eval-result'),/^Reto superado/);
   const statuses=await p.evaluate(()=>window.pistaStatuses);
   for(const track of ['Patio','Columnas','Pasillos'])assert.ok(statuses.some(s=>s.includes(track)),track);
   assert.equal(await p.locator('#eval-result li.ok').count(),18);
   assert.equal(await p.locator('#robot-track-select').isEnabled(),true);
   console.log('desktop: las tres pistas aprueban con 18 comprobaciones');
  }else await p.click('#btn-stop');
  await p.reload();
  assert.equal(await p.inputValue('.code-editor__input'),fx('pista-solucion'));
  const saved=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).lessons['arduino-evasor-pista'],KEY);
  await p.selectOption('#robot-track-select','columnas');
  await p.click('#guide [data-act="hint"]');
  const after=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).lessons['arduino-evasor-pista'],KEY);
  assert.equal(after.code,saved.code);assert.equal(after.attempts,saved.attempts);
  await p.locator('.robot-track__connections > summary').click();
  assert.equal(await p.locator('.sonar-ctl').isVisible(),false);
  assert.equal(await p.locator('.motor-read__ch').count(),2);
  await p.locator('.robot-track__connections > summary').click();
  if(process.env.LAB_SHOTS)await p.locator('#circuit').screenshot({path:process.env.LAB_SHOTS+'/pista-'+name+'.png'});
  assert.deepEqual(errors,[]);
  console.log('OK '+name+': interfaz, pistas y borrador local sin errores');
 }finally{await browser.close();}
}

// La ruta escolar utiliza el mismo compilador, guardado y evaluador que el laboratorio general.
const navegador = await chromium.launch(launchOptions);
try {
  const pagina = await navegador.newPage();
  const fase = id => BASE + '?grado=8&leccion=arduino-ultrasonico-' + id;
  await pagina.goto(fase('alerta'));
  await pagina.getByRole('link', { name: 'Abrir mi fase disponible' }).click();
  await pagina.waitForURL(fase('distancia'));
  const segunda = pagina.locator('#lesson-picker a[data-lesson="arduino-ultrasonico-alerta"]');
  assert.equal(await segunda.count(), 0);
  await pagina.locator('.code-editor__input').fill(fx('ultra-fijo'));
  await pagina.click('#btn-check');
  await pagina.getByText('Todavía no: revisa los puntos marcados', {exact:true}).waitFor();
  assert.equal(await segunda.count(), 0);
  await pagina.locator('.code-editor__input').fill(fx('ultra-solucion'));
  await pagina.click('#btn-check');
  await segunda.waitFor({timeout:60000});
  await segunda.click();
  await pagina.waitForURL(fase('alerta'));
  await pagina.reload();
  await pagina.getByText('Octavo · Fase 2 de 5', {exact:true}).waitFor();
  console.log('Octavo: enlace directo bloqueado, programa incorrecto retenido y solución compilada habilita la fase 2.');
} finally {
  await navegador.close();
}
