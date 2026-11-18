import { lessons } from './lessons.js';
import { criteria, documentFor } from './preview.js';

const el = id => document.getElementById(id);
const files = {html:'HTML',css:'CSS',js:'JavaScript'};
const prefix = 'globalt.taller-web.v1.';
let lesson, draft, activeFile, activeFrame, revision = 0;
const memory = new Map();
function read(item) {
  if (memory.has(item.id)) return memory.get(item.id);
  let saved;
  try { saved = JSON.parse(localStorage.getItem(prefix + item.id)); } catch {}
  const result = {done:saved?.done === true};
  for (const key of Object.keys(files)) result[key] = typeof saved?.[key] === 'string' ? saved[key] : item[key];
  memory.set(item.id,result);
  return result;
}
function save() {
  try { localStorage.setItem(prefix + lesson.id, JSON.stringify(draft)); }
  catch { el('guardado').textContent = 'El navegador no pudo guardar. Descarga tu página para conservarla.'; }
}
function button(text, action) {
  const node = document.createElement('button');
  node.textContent = text;
  node.onclick = action;
  return node;
}
function route() {
  el('ruta').replaceChildren(...lessons.map(item => {
    const node = button((read(item).done ? '✓ ' : '') + item.name, () => {location.hash=item.id;});
    if (item === lesson) node.setAttribute('aria-current','step');
    return node;
  }));
  el('avance').textContent = lessons.filter(item=>read(item).done).length + ' de 5 retos completados.';
  el('siguiente').hidden = !draft.done || lesson === lessons.at(-1);
}
function selectFile(key) {
  activeFile = key;
  el('codigo').value = draft[key];
  el('archivo').textContent = 'Editar ' + files[key];
  for (const node of el('archivos').children) node.setAttribute('aria-pressed',String(node.dataset.file === key));
}
function frame(width,mode) {
  const node=document.createElement('iframe');
  node.setAttribute('sandbox','allow-scripts');
  node.referrerPolicy='no-referrer';
  node.title='Página del estudiante';
  node.style.width=width+'px';
  node.style.height='380px';
  node.srcdoc=documentFor(draft,mode);
  return node;
}
function resize() {
  if (!activeFrame) return;
  const scale=Math.min(1,el('pantalla').clientWidth / parseInt(activeFrame.style.width,10));
  activeFrame.style.transform='scale('+scale+')';
  el('pantalla').style.height=380*scale+'px';
}
new ResizeObserver(resize).observe(el('pantalla'));
function preview() {
  revision++;
  el('resultados').replaceChildren();
  el('estado').textContent='Preparando vista previa…';
  activeFrame=frame(Number(el('ancho').value),'preview');
  el('pantalla').replaceChildren(activeFrame);
  resize();
}
let previewError=false;
window.addEventListener('message', e=>{
  if (!activeFrame || e.source !== activeFrame.contentWindow || e.origin !== 'null') return;
  if (e.data?.labWeb==='error') {
    previewError=true;
    el('estado').textContent='Revisa JavaScript: '+String(e.data.message).slice(0,260);
  } else if(e.data?.labWeb==='ready' && !previewError && !el('resultados').childElementCount) el('estado').textContent='Vista previa actualizada.';
});
function run() { previewError=false; preview(); }
function measure(width) {
  return new Promise((resolve,reject)=>{
    const node=frame(width,'grade');
    node.style.position='fixed';
    node.style.left='-10000px';
    node.setAttribute('aria-hidden','true');
    node.tabIndex=-1;
    const done=(value,error)=>{
      clearTimeout(timer);
      window.removeEventListener('message',receive);
      node.remove();
      error ? reject(new Error(error)) : resolve(value);
    };
    function receive(e) {
      if (e.source!==node.contentWindow || e.origin!=='null') return;
      if (e.data?.labWeb==='error') done(null,'Revisa JavaScript: '+String(e.data.message).slice(0,260));
      if (e.data?.labWeb==='ready' && e.data.result) done(e.data.result);
    }
    const timer=setTimeout(()=>done(null,'La página tardó demasiado. Revisa el código y vuelve a probar.'),6000);
    window.addEventListener('message',receive);
    document.body.append(node);
  });
}
async function grade() {
  run();
  const attempt=revision;
  el('evaluar').disabled=true;
  try {
    const desktop=await measure(640);
    const mobile=['adaptable','publicacion'].includes(lesson.id) ? await measure(360) : null;
    if (revision!==attempt) return;
    const checks=criteria(lesson.id,desktop,mobile);
    const passed=checks.every(([ok])=>ok);
    el('resultados').replaceChildren(...checks.map(([ok,text])=>{
      const li=document.createElement('li');
      li.textContent=(ok?'✓ Cumplido · ':'Por revisar · ')+text;
      return li;
    }));
    el('estado').textContent=passed?'Reto completado.':'Todavía queda algo por ajustar.';
    if(passed){draft.done=true;save();route();}
  } catch(error){if(revision===attempt) el('estado').textContent=error.message;}
  finally{el('evaluar').disabled=false;}
}
function openLesson() {
  lesson=lessons.find(item=>item.id===location.hash.slice(1)) || lessons[0];
  draft=read(lesson);
  el('tema').textContent='Práctica '+(lessons.indexOf(lesson)+1)+' / 5';
  el('titulo').textContent=lesson.title;
  el('objetivo').textContent=lesson.goal;
  el('pasos').replaceChildren(...lesson.steps.map(step=>{
    const li=document.createElement('li');li.textContent=step;return li;
  }));
  el('pista').textContent=lesson.hint;
  el('muestra').textContent=lesson.sample;
  el('guia').open=true;
  el('guia').querySelector('details').open=false;
  selectFile(lesson.file || 'html');
  route();
  if (Object.keys(files).some(key => draft[key] !== lesson[key])) {
    revision++;
    activeFrame = null;
    el('pantalla').replaceChildren();
    el('pantalla').style.height='0px';
    el('resultados').replaceChildren();
    el('estado').textContent='Borrador recuperado. Pulsa Ver resultado para ejecutarlo.';
  } else run();
}
for(const [key,name] of Object.entries(files)){
  const node=button(name,()=>selectFile(key));node.dataset.file=key;el('archivos').append(node);
}
el('codigo').oninput=()=>{revision++;draft[activeFile]=el('codigo').value;save();el('resultados').replaceChildren();el('estado').textContent='Cambios en el editor. Pulsa Ver resultado.';};
el('ancho').onchange=run;
el('ejecutar').onclick=run;
el('evaluar').onclick=grade;
el('siguiente').onclick=()=>{location.hash=lessons[lessons.indexOf(lesson)+1].id;};
el('descarga').onclick=()=>{
  const url=URL.createObjectURL(new Blob([documentFor(draft)],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='index.html';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('hashchange',openLesson);
openLesson();
