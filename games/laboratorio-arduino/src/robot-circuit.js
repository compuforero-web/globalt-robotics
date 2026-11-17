// La pose procede del Worker: no hay animación independiente de la emulación.
import {createEvasorCircuit} from './evasor-circuit.js';
import {TRACKS,RobotWorld} from './robot-world.js';
const names={adelante:'adelante',atras:'atrás',freno:'freno',libre:'libre'};
const number=(v,n=2)=>Number(v).toFixed(n).replace('.',',');
export function createRobotCircuit(root,{onTrack=()=>{}}={}){
 root.innerHTML='<div class="robot-track"><label class="robot-track__label" for="robot-track-select">Pista de práctica</label>'
  +'<select id="robot-track-select" class="robot-track__select">'+TRACKS.map(t=>'<option value="'+t.id+'">'+t.name+'</option>').join('')+'</select>'
  +'<p class="muted small">Cambiar de pista reinicia la simulación con el mismo programa. Comprobar reto siempre prueba las tres.</p><div class="robot-track__scene"></div>'
  +'<dl class="robot-track__stats">'+[['path','Recorrido','0,00 m'],['hits','Colisiones','0'],['idle','Mayor pausa','0,00 s'],['distance','Distancia geométrica','—'],['echo','Último ECHO en D8','sin medidas'],['left','Motor izquierdo','parado'],['right','Motor derecho','parado']].map(([id,label,value])=>'<div><dt>'+label+'</dt><dd data-world="'+id+'">'+value+'</dd></div>').join('')+'</dl>'
  +'<p class="muted small">Vista superior · robot circular de 20 cm de diámetro · cono ideal de 15°. La distancia geométrica es la del mundo; tu programa solo la recibe si dispara TRIG y mide ECHO.</p>'
  +'<details class="robot-track__connections"><summary>Ver conexiones y señales eléctricas</summary><div data-world="connections"></div></details></div>';
 const select=root.querySelector('select'),scene=root.querySelector('.robot-track__scene');
 const connectionsRoot=root.querySelector('[data-world="connections"]'),connections=createEvasorCircuit(connectionsRoot);
 connectionsRoot.querySelector('p').textContent='Dos vistas del mismo Nano. Sensor en D7/D8 y motores con el mapa del evasor.';
 connectionsRoot.querySelector('.sonar-ctl').hidden=true;
 const read=(key,text)=>{root.querySelector('[data-world="'+key+'"]').textContent=text;};
 let trail=[],trailMs=-Infinity,height=0;
 function pose(s){
  const x=s.x*100,y=height-s.y*100;
  scene.querySelector('.robot-pose').setAttribute('transform','translate('+x+' '+y+') rotate('+(-s.heading*180/Math.PI)+')');
  scene.querySelector('.robot-pose').classList.toggle('is-contact',s.contact);
  if(s.timeMs-trailMs>=100||!trail.length){trailMs=s.timeMs;trail.push(x.toFixed(2)+','+y.toFixed(2));if(trail.length>1200)trail.shift();scene.querySelector('.robot-trail').setAttribute('points',trail.join(' '));}
  read('path',number(s.pathM)+' m');read('hits',String(s.collisions));read('idle',number(s.maxIdleMs/1000)+' s');read('distance',s.cm===null?'fuera de alcance':number(s.cm,1)+' cm');
 }
 function resetScene(){
  const initial=new RobotWorld({track:select.value}),t=initial.track; height=t.height*100;trail=[];trailMs=-Infinity;
  scene.innerHTML='<svg class="robot-track__svg" viewBox="0 0 '+(t.width*100)+' '+height+'" role="img" aria-labelledby="robot-world-title robot-world-description">'
   +'<title id="robot-world-title">Pista '+t.name+', robot y obstáculos</title><desc id="robot-world-description">Vista superior en metros. El robot responde a sus dos motores emulados. Las paredes y los bloques son sólidos; la línea verde es el recorrido real.</desc>'
   +'<defs><pattern id="robot-world-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0 H0 V25" fill="none" stroke="#223249" stroke-width="0.5"/></pattern></defs>'
   +'<rect width="100%" height="100%" fill="#0a1220"/><rect width="100%" height="100%" fill="url(#robot-world-grid)"/>'
   +'<rect x="1" y="1" width="'+(t.width*100-2)+'" height="'+(height-2)+'" fill="none" stroke="#8294ae" stroke-width="2"/>'
   +t.obstacles.map(o=>'<rect x="'+o.x*100+'" y="'+(height-(o.y+o.h)*100)+'" width="'+o.w*100+'" height="'+o.h*100+'" fill="#354359" stroke="#91a2b8"/>').join('')
   +'<polyline class="robot-trail" fill="none" stroke="#20c997" stroke-width="1.5" opacity="0.8"/>'
   +'<g class="robot-pose"><circle r="10" fill="#172b3b" stroke="#36c2e8" stroke-width="1.5"/><path d="M10 0 L72 -8 L72 8 Z" fill="#36c2e8" opacity="0.12"/>'
   +'<rect x="-4" y="-9" width="8" height="3" rx="1" fill="#111820" stroke="#e6aa4c"/><rect x="-4" y="6" width="8" height="3" rx="1" fill="#111820" stroke="#e6aa4c"/>'
   +'<rect x="-5" y="-5" width="11" height="10" rx="2" fill="#c4cdd2"/><path d="M-1 -3 L5 0 L-1 3" fill="none" stroke="#17333f" stroke-width="2"/><rect x="8" y="-2" width="1" height="4" fill="#2f84b1"/></g></svg>';
  pose(initial.state());read('echo','sin medidas');read('left','parado');read('right','parado');
 }
 select.addEventListener('change',()=>{resetScene();onTrack(select.value);});resetScene();
 return{
  update:w=>connections.update(w),worldTrack:()=>select.value,setBusy(value){select.disabled=value;},
  worldState(s){if(s.track===select.value)pose(s);},
  sonarState(s){connections.sonarState(s);if(s.echo)read('echo',Math.round(s.echo.us)+' µs'+(s.echo.cm===null?' · sin eco':''));},
  motorState(s){connections.motorState(s);for(const[i,key]of['left','right'].entries()){const c=s.channels[i];read(key,names[c.order]+' · '+Math.round(Math.abs(c.rpm))+' rpm'+(c.speed< -0.01?' atrás':c.speed>0.01?' adelante':''));}},
  reset(){connections.reset();resetScene();},stopped(){connections.stopped();}
 };
}
