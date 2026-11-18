import { lessons } from './lessons.js';
import { criteria, documentFor } from './preview.js';

const el = id => document.getElementById(id);
const files = {html:'HTML',css:'CSS',js:'JavaScript'};
const CURSO = 'course-web';
let lesson, draft, activeFile, activeFrame, revision = 0;
const apiId = item => 'web-' + item.id;   // espacio de nombres de la API (ver progreso-cuenta.js)
// Cuenta del aula (si existe en este sitio). Sin ella, o si falla, el taller sigue en modo invitado como siempre.
const cuenta = await import('./progreso-cuenta.js')
  .then(m => m.conectarLaboratorio(CURSO, {alCambiar: () => { if (lesson) { route(); pintarCuenta(); } }}))
  .catch(() => null);
const conCuenta = () => Boolean(cuenta && cuenta.modo !== 'invitado');
// Borradores SOLO en este navegador: invitado en 'globalt.taller-web.v1.<id>' (como antes); con cuenta, en un
// espacio propio de la cuenta. El historial de invitado nunca se atribuye a la cuenta.
const guestPrefix = 'globalt.taller-web.v1.';
const prefix = 'globalt.taller-web.v1' + (cuenta?.espacio || '') + '.';
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
  catch { el('guardado').hidden = false; el('guardado').textContent = 'El navegador no pudo guardar. Descarga tu página para conservarla.'; }
}
function button(text, action) {
  const node = document.createElement('button');
  node.textContent = text;
  node.onclick = action;
  return node;
}
// Guest: reto marcado en el borrador local. Con cuenta: estado de la cuenta (servidor + pendiente de enviar).
const isDone = item => conCuenta() ? cuenta.estado(apiId(item)) === 'completada' : read(item).done;
function route() {
  el('ruta').replaceChildren(...lessons.map(item => {
    const node = button((isDone(item) ? '✓ ' : '') + item.name, () => {location.hash=item.id;});
    if (item === lesson) node.setAttribute('aria-current','step');
    node.dataset.estado = conCuenta() ? cuenta.estado(apiId(item)) : (isDone(item) ? 'completada' : 'sin-comenzar');
    return node;
  }));
  el('avance').textContent = lessons.filter(isDone).length + ' de 5 retos completados' + (conCuenta() ? ' en tu cuenta.' : '.');
  el('siguiente').hidden = !isDone(lesson) || lesson === lessons.at(-1);
}
function pintarCuenta() {
  if (!cuenta || cuenta.inicio === 'sin-aula') return;
  const a = cuenta.aviso();
  el('cuenta').hidden = false;
  el('cuenta').dataset.tipo = a.tipo;
  el('cuenta-borrador').textContent = a.borrador;
  el('cuenta-avance').textContent = a.avance;
  el('cuenta-reintentar').hidden = !a.reintentar || a.recargar;
  el('cuenta-recargar').hidden = !a.recargar;
  el('guardado').hidden = true;
}
// Con cuenta y sin borrador propio de esta práctica: ofrecer copiar (solo el código) el borrador de invitado.
function guestDraft(item) {
  if (!conCuenta()) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(guestPrefix + item.id));
    if (!saved || localStorage.getItem(prefix + item.id) !== null) return null;
    const code = {};
    for (const key of Object.keys(files)) code[key] = typeof saved[key] === 'string' ? saved[key] : item[key];
    return Object.keys(files).some(key => code[key] !== item[key]) ? code : null;
  } catch { return null; }
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
    if(passed && !conCuenta()){draft.done=true;save();route();}
    else if(passed){
      // Con cuenta: solo ahora (evaluador aprobado) se registra la finalización, comprobando antes la sesión.
      const r=await cuenta.completar(apiId(lesson));
      if(revision===attempt) el('estado').textContent={registrado:'Reto completado y guardado en tu cuenta.',
        pendiente:'Reto completado. Sin conexión: queda pendiente en este navegador, solo para tu cuenta.',
        'no-registrado':'Reto completado, pero no se guardó en ninguna cuenta (la sesión cambió).'}[r]||'Reto completado.';
      route();pintarCuenta();
    }
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
  cuenta?.visitar(apiId(lesson));   // con cuenta: registra la visita (sin completar)
  el('copiar-invitado').hidden = !guestDraft(lesson);
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
el('copiar-invitado').onclick=()=>{
  const code=guestDraft(lesson);
  if(!code || !confirm('¿Copiar al espacio de tu cuenta el código que se escribió en este navegador sin cuenta? Solo se copia el código: los retos de invitado no se suman a tu cuenta.')) return;
  Object.assign(draft,code);save();openLesson();
};
el('cuenta-reintentar').onclick=()=>cuenta?.sincronizar();
el('cuenta-recargar').onclick=()=>location.reload();
window.addEventListener('hashchange',openLesson);
openLesson();
pintarCuenta();
