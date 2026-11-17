import {TRACKS} from '../robot-world.js';
import {PIN_MAPS} from '../motor.js';
export const PISTA={durationMs:60000,minPathM:6,maxIdleMs:3000};
export const pistaStimulus=track=>({world:{track},sonar:{trig:7,echo:8,cm:null},motors:{channels:PIN_MAPS.robot}});
export const PISTA_RUNS=TRACKS.map(t=>({title:t.name,stimulus:pistaStimulus(t.id)}));
export function evaluatePista(traces){
 const checks=[],add=(id,ok,label,detail)=>checks.push({id,ok:Boolean(ok),label,detail});
 for(const track of TRACKS){
  const list=(Array.isArray(traces)?traces:[]).filter(t=>t.world?.track===track.id);
  const trace=list.length===1?list[0]:null,w=trace?.world;
  const complete=trace?.durationMs===PISTA.durationMs&&Number.isFinite(w?.timeMs)&&Math.abs(w.timeMs-PISTA.durationMs)<2;
  add(track.id+'-duracion',complete,track.name+': 60 segundos completos',complete?'Programa ejecutado de principio a fin en esta pista.':'Falta una ejecución completa y única de esta pista.');
  add(track.id+'-colisiones',complete&&w.collisions===0,track.name+': sin colisiones',w?w.collisions+' contacto(s) con paredes u obstáculos.':'Sin datos del mundo.');
  add(track.id+'-recorrido',complete&&Number.isFinite(w.pathM)&&w.pathM>=6,track.name+': al menos 6 metros',w?w.pathM.toFixed(2)+' m recorridos realmente; girar sobre sí mismo no suma distancia.':'Sin recorrido medido.');
  add(track.id+'-bloqueo',complete&&Number.isFinite(w.maxIdleMs)&&w.maxIdleMs<=3001,track.name+': sin quedar inmóvil más de 3 s',w?'Mayor pausa sin desplazamiento: '+(w.maxIdleMs/1000).toFixed(2)+' s. Se considera inmóvil a menos de 1 cm/s, aunque gire sobre sí mismo.':'Sin tiempos medidos.');
  const triggers=trace?.sonar?.triggers?.filter(x=>x.accepted)||[],echoes=trace?.sonar?.echoes||[];
  const gaps=triggers.slice(1).map((x,i)=>x.rise-triggers[i].rise);
  const sensor=triggers.length>=100&&echoes.length>=100&&gaps.every(g=>g>=60&&g<=500)&&triggers[0]?.rise<=500&&60000-triggers.at(-1)?.rise<=500;
  add(track.id+'-sensor',complete&&sensor,track.name+': sensor activo durante el recorrido',triggers.length+' disparos válidos y '+echoes.length+' ecos. Mantén 60–500 ms entre medidas, también al maniobrar.');
  const outputs=trace?.motor?.outputs||[],motors=outputs.length===2&&outputs.every(ch=>ch.in1&&ch.in2&&ch.en);
  add(track.id+'-pines',complete&&motors,track.name+': ambos canales del L298N configurados',motors?'Pines de ambos motores configurados con el mapa del evasor.':'Usa IN1 D2, IN2 D4, IN3 D10, IN4 D11 y PWM en ENA D5/ENB D6.');
 }
 return{passed:checks.every(c=>c.ok),checks};
}
