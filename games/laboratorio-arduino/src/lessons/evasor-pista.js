// Lección 15: motores, movimiento y sensor en lazo cerrado.
import {question,exampleHtml,challengeBox,goTo,renderLesson,SCOPE_COMMON} from './view.js';
import {EXAMPLE_CODE as BANK_EXAMPLE} from './evasor-decision.js';
import {PISTA,PISTA_RUNS,evaluatePista} from './pista-eval.js';
import {createRobotCircuit} from '../robot-circuit.js';
import {PIN_MAPS} from '../motor.js';
import {COMPILE_TOPIC,makeHintText,createPreparedHelp} from '../guide.js';
export const ID='arduino-evasor-pista';
export const EXAMPLE_CODE=BANK_EXAMPLE.replace('Evasor en banco: primero comprueba el sensor.','Evasor en pista: primero comprueba el sensor.');
export const EXAMPLES={umbral:{title:'Distinguir cerca y lejos por serie',code:'// Ejemplo de lectura: no mueve los motores ni resuelve el reto.\nvoid setup() { Serial.begin(9600); pinMode(7, OUTPUT); pinMode(8, INPUT); }\nvoid loop() {\n  digitalWrite(7, LOW); delayMicroseconds(2);\n  digitalWrite(7, HIGH); delayMicroseconds(10); digitalWrite(7, LOW);\n  unsigned long eco = pulseIn(8, HIGH, 30000);\n  if (!eco) Serial.println("Sin eco");\n  else if (eco / 58 < 30) Serial.println("Cerca");\n  else Serial.println("Lejos");\n  delay(70);\n}\n'}};
export const CHALLENGE={title:'Reto final: evasor en tres pistas',summary:'Recorre las tres pistas durante 60 segundos simulados cada una evitando paredes y obstáculos. Puedes elegir umbrales, velocidades y estrategia.',criteria:[
 'En cada pista: 60 s completos, ninguna colisión y al menos 6 m de desplazamiento acumulado.',
 'Nunca más de 3 s seguidos sin desplazamiento (menos de 1 cm/s). Girar sobre sí mismo no suma distancia y cuenta como pausa.',
 'HC-SR04 activo con medidas reales cada 60–500 ms durante todo el recorrido: al menos 100 disparos y ecos por pista.',
 'TRIG D7, ECHO D8; IN1 D2, IN2 D4, IN3 D10, IN4 D11; ENA D5 y ENB D6.',
 'El mismo programa se reinicia en Patio, Columnas y Pasillos. La pista seleccionada solo afecta a la práctica.'
]};
export const STEPS=[
 {id:'lazo',short:'Lazo cerrado',title:'Tus ruedas cambian lo que mide el sensor',html:'<p>El programa mueve los motores, los motores desplazan el robot y su nueva posición cambia el eco. Esta realimentación forma un <strong>lazo cerrado</strong>.</p><p>Usas el mapa del banco y el modelo L298N con inercia y zona muerta. El robot circular mide 20 cm de diámetro.</p>'+question('¿Se acerca a la pared si ENA y ENB están en cero?','No. Sin una orden de movimiento el robot permanece en su posición; no hay un recorrido preparado.')+goTo('#sim-panel','Ver la pista')},
 {id:'sensor',short:'Leer',title:'Mira delante y entiende la ausencia de eco',html:'<p>El sensor mira hacia delante: cono ideal de 15°, nueve rayos y alcance de 4 m. La distancia geométrica describe el mundo; el Arduino solo la recibe como ECHO si produce un TRIG válido.</p><p>Usa pulseIn con timeout y decide qué hacer sin eco. El sensor no observa detrás del robot.</p>'+exampleHtml(EXAMPLES,'umbral')},
 {id:'inercia',short:'Ajustar',title:'Deja espacio para frenar y girar',html:'<p>Una orden de parada no detiene físicamente el robot al instante. Con más PWM recorre más distancia mientras mide y responde el motor.</p><p>Parte de tu programa del banco y prueba una velocidad moderada. Puedes cambiar los umbrales: aquí se comprueba el resultado del recorrido.</p>'+question('¿Es seguro retroceder hasta tocar la pared de atrás?','No. El sensor solo mira delante: un retroceso largo puede chocar por detrás aunque la lectura frontal aumente.')},
 {id:'practica',short:'Practicar',title:'Prueba las tres pistas',html:'<p>Elige Patio, Columnas o Pasillos, ejecuta tu programa y observa recorrido, colisiones y mayor pausa. Cambiar de pista reinicia el programa y conserva tu borrador.</p><p>Las pistas son fijas. Solo suma la distancia recorrida por el centro del robot. No se exige una meta o ruta concreta; debes mantenerte circulando de forma segura.</p>'+goTo('#btn-run','Probar mi programa')},
 {id:'reto',short:'Reto final',title:'Comprueba el recorrido completo',html:challengeBox(CHALLENGE)+'<p>Son tres pruebas consecutivas. Verás la pista evaluada; cada una tiene un límite de 90 s de reloj para proteger el navegador.</p><p>El ejemplo mantiene los motores parados y no aprueba. Leer pasos, pedir pistas o guardar tampoco aprueba.</p>'+goTo('#btn-check','Comprobar las tres pistas')}
];
const HINTS={
 colisiones:['Observa dónde toca el robot una pared o un bloque.','Reduce velocidad, deja margen y limita el retroceso: el sensor solo mira delante.'],
 recorrido:['El robot debe desplazarse, además de girar.','Con EN bajo no vence la zona muerta; con ruedas siempre opuestas no suma metros.'],
 bloqueo:['Girar sin trasladarse también cuenta como pausa.','Revisa cuándo sales del giro y retomas la marcha; la nueva medida debe permitirlo antes de 3 s.'],
 sensor:['Comprueba TRIG y ECHO durante las maniobras.','Usa timeout y evita esperas largas: deja 60–500 ms entre disparos.'],
 pines:['No reutilices D7/D8 del sensor para motores.','IN en D2/D4/D10/D11; PWM de ENA y ENB en D5/D6.'],
 duracion:['Hacen falta las tres ejecuciones completas.','Si se agotó el tiempo, cierra otras tareas pesadas y reintenta; tus borradores no se borran.'],
 comprobar:['Prueba primero una pista con tu estrategia del banco.','Ajusta velocidad y umbrales mirando recorrido y colisiones antes de comprobar las tres.'],
 superado:['Ya integraste sensor, decisiones, motores y movimiento.','Prueba otras velocidades. Un simulador no sustituye comprobar conexiones y alimentación en un robot físico.']
};
const TOPICS=Object.fromEntries(Object.entries(HINTS).map(([k,hints])=>[k,{label:k,hints}]));
TOPICS.compilar=COMPILE_TOPIC;
export const hintText=makeHintText(TOPICS);
export function chooseTopic(ctx={}){
 if(ctx.compileError)return{topic:'compilar',facts:ctx.compileError};
 const fail=ctx.lastChecks?.find(c=>!c.ok),key=fail?.id.split('-').at(-1);
 return{topic:key&&key in TOPICS?key:ctx.completed?'superado':'comprobar',facts:{}};
}
const help=createPreparedHelp({hintText,checkHints:Object.fromEntries(PISTA_RUNS.flatMap(({stimulus})=>Object.entries(HINTS).map(([k,v])=>[stimulus.world.track+'-'+k,v]))),texts:{
 welcome:'Hola, soy Chispa. Tu programa controlará el robot en una pista. Comprueba primero el sensor con motores parados y después adapta tu estrategia del banco.',
 otherPins:pins=>'Hay actividad en '+pins+'. Verifica el mapa de conexiones.',
 evalPass:'¡Reto superado! Completaste las tres pistas con recorrido suficiente, sin colisiones ni bloqueos largos. El resultado se guarda en este navegador.'
}});
export default{
 id:ID,numero:15,tema:'Robot evasor',titulo:'Evasor: recorrer tres pistas',corto:'Evasor en pista',kicker:'Lección 15 · Proyecto final',
 previas:['arduino-evasor-decision'],baud:9600,exampleCode:EXAMPLE_CODE,examples:EXAMPLES,steps:STEPS,challenge:CHALLENGE,
 html:()=>renderLesson({goal:'programar un evasor que se mantenga circulando sin chocar usando medidas del sensor.',steps:STEPS,scope:[...SCOPE_COMMON,
 'El L298N obtiene órdenes de los pines del HEX y calcula velocidad con inercia y zona muerta; esas velocidades mueven el robot.',
 'ECHO depende de paredes y bloques desde la posición actual. Cono ideal de 15° con nueve rayos, sin ruido ni ecos múltiples.',
 'Robot circular rígido, ruedas de radio 3,25 cm separadas 16 cm; sin derrape, carga, corriente o caída de tensión.',
 'Los contactos bloquean traslación y cuentan como colisiones; aún se puede girar. Modelo determinista y didáctico.',
 'La cuenta guarda el código. Aprobar se registra solo en este navegador; no es una certificación guardada en el servidor.']}),
 circuit:createRobotCircuit,pins:[2,4,5,6,7,10,11],sonar:{trig:7,echo:8},motors:{channels:PIN_MAPS.robot},world:{track:'patio'},
 evaluation:{durationMs:PISTA.durationMs,runs:PISTA_RUNS,evaluate:evaluatePista,note:'Tres ejecuciones independientes de 60 s simulados; cada pista debe cumplir todos los criterios.'},
 guide:{chooseTopic,hintText,help}
};
