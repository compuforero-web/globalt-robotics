// Serve the repository locally and set WEB_ORIGIN to its HTTP origin.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.WEB_ORIGIN || 'http://127.0.0.1:8080';
const semantic = '<header><h1>Expo</h1></header><main class="proyectos"><article><h2>A</h2><p>Uno</p></article><article><h2>B</h2><p>Dos</p></article></main>';
const styles = '.proyectos{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:480px){.proyectos{grid-template-columns:1fr}}';
const controls = '<button id="programa">Horario</button><p id="horario" hidden>A las nueve</p>';
const interaction = "document.querySelector('#programa').onclick=()=>{const n=document.querySelector('#horario');n.hidden=!n.hidden}";
for (const width of [1280,380]) {
  const browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH || undefined,
    args:process.env.LAB_SINGLE_PROCESS ? ['--single-process','--no-zygote','--disable-gpu','--in-process-gpu'] : []
  });
  try {
    const ctx=await browser.newContext({viewport:{width,height:900},hasTouch:width===380});
    const p=await ctx.newPage();
    await p.goto(origin);
    await p.getByRole('link',{name:'Practicar en el laboratorio web'}).click();
    const input=p.locator('#codigo');
    async function edit(file,source) {
      await p.locator('[data-file="'+file+'"]').click();
      await input.fill(source);
    }
    async function check(pass) {
      await p.click('#evaluar');
      await p.waitForFunction(expected=>document.querySelector('#estado').textContent===expected,
        pass?'Reto completado.':'Todavía queda algo por ajustar.',{timeout:10000});
    }
    for(const [id,changes] of [
      ['estructura',{html:semantic}],['rejilla',{css:styles}],['adaptable',{css:styles}],
      ['eventos',{js:interaction}],['publicacion',{html:semantic+controls,css:styles,js:interaction}]
    ]) {
      await p.waitForURL(u=>id==='estructura' || u.hash==='#'+id);
      await check(false);
      for(const [file,source] of Object.entries(changes)) await edit(file,source);
      await check(true);
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(id!=='publicacion') await p.click('#siguiente');
    }
    await p.reload();
    assert.match(await p.textContent('#avance'),/5 de 5/);
    await p.locator('[data-file="js"]').click();
    assert.equal(await input.inputValue(),interaction);
    await p.selectOption('#ancho','360');
    const frame=p.frameLocator('#pantalla iframe');
    await frame.locator('#programa').click();
    assert.equal(await frame.locator('#horario').isVisible(),true);
    const downloading=p.waitForEvent('download');
    await p.click('#descarga');
    const file=await downloading;
    assert.equal(file.suggestedFilename(),'index.html');
    const exported=await readFile(await file.path(),'utf8');
    assert.ok(!exported.includes('postMessage'));
    const independent=await p.context().newPage();
    await independent.setContent(exported);
    await independent.click('#programa');
    assert.equal(await independent.locator('#horario').isVisible(),true);
    await edit('js','throw new Error("Revisar el evento");');
    await p.click('#ejecutar');
    await p.waitForFunction(()=>document.querySelector('#estado').textContent.includes('Revisar el evento'));
    console.log(width+'px: acceso desde tarjeta, cinco fallos y soluciones, persistencia, interacción, diagnóstico y descarga OK');
  } finally { await browser.close(); }
}
