import assert from 'node:assert/strict';
import test from 'node:test';
import {RobotWorld,TRACKS,WORLD,rayRect,circleRect,trackById} from '../games/laboratorio-arduino/src/robot-world.js';
import {evaluatePista} from '../games/laboratorio-arduino/src/lessons/pista-eval.js';
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,a+' != '+b);
test('rayos paralelos, detrás, dentro y tangentes',()=>{
 const r={x:2,y:1,w:1,h:1};
 close(rayRect(0,1.5,1,0,r),2);assert.equal(rayRect(0,0,1,0,r),Infinity);
 assert.equal(rayRect(4,1.5,1,0,r),Infinity);close(rayRect(2.5,0,0,1,r),1);
 close(rayRect(2.5,1.5,0,1,r),0);close(rayRect(0,1,1,0,r),2);
 assert.equal(circleRect(1,1,0.5,r),false);assert.equal(circleRect(1.6,1.5,0.5,r),true);
});
test('avance, retroceso y giro en unidades físicas',()=>{
 const w=new RobotWorld(),speed=200*2*Math.PI*WORLD.wheelRadius/60;
 w.advance(1000,0.25,0.25);close(w.x,0.6+speed*0.25);close(w.y,0.65);close(w.pathM,speed*0.25);
 w.advance(1500,-0.25,-0.25);close(w.x,0.6+speed*0.125);close(w.pathM,speed*0.375);
 const pos=[w.x,w.y],path=w.pathM;w.advance(2500,0.25,-0.25);
 close(w.x,pos[0]);close(w.y,pos[1]);close(w.pathM,path);close(w.heading,-speed*0.5/WORLD.wheelBase);assert.ok(w.maxIdleMs>=1000);
});
test('contacto sin atravesar bloques ni sumar distancia bloqueada',()=>{
 const w=new RobotWorld();w.advance(8000,1,1);
 assert.ok(w.collisions>0);assert.ok(w.x<=1.9-WORLD.radius+1e-8);assert.ok(w.maxIdleMs>3000);
 const x=w.x,path=w.pathM;w.advance(9000,1,1);close(w.x,x);close(w.pathM,path);
 w.advance(9200,-0.5,-0.5);assert.ok(w.x<x);assert.equal(w.contact,false);
 const wall=new RobotWorld();wall.heading=Math.PI;wall.advance(10000,1,1);assert.ok(wall.x>=WORLD.radius);assert.ok(wall.collisions>0);
});
test('eco según pose, orientación, cono y alcance; pistas independientes',()=>{
 const w=new RobotWorld();close(w.senseCm(),120);w.advance(1000,0.25,0.25);assert.ok(w.senseCm()<110);
 w.heading=Math.PI;close(w.senseCm(),(w.x-WORLD.sensorOffset)*100);
 w.x=0.15;w.y=0.15;w.heading=Math.atan2(3.35,4.35);w.track.obstacles=[];assert.equal(w.senseCm(),null);
 const copy=trackById('patio');copy.obstacles[0].x=999;assert.equal(trackById('patio').obstacles[0].x,1.9);assert.throws(()=>trackById('otra'));
});
test('giro perpetuo y datos incompletos nunca aprueban',()=>{
 const traces=TRACKS.map(t=>{const w=new RobotWorld({track:t.id});w.advance(60000,0.3,-0.3);return{durationMs:60000,world:w.state(),motor:{outputs:[]},sonar:{triggers:[],echoes:[]}};});
 const r=evaluatePista(traces);assert.equal(r.passed,false);assert.equal(r.checks.length,18);
 for(const t of TRACKS){assert.equal(r.checks.find(c=>c.id===t.id+'-recorrido').ok,false);assert.equal(r.checks.find(c=>c.id===t.id+'-bloqueo').ok,false);}
 assert.equal(evaluatePista([]).passed,false);assert.equal(evaluatePista([traces[0],traces[0],traces[2]]).passed,false);
});
test('determinismo y límites de memoria',()=>{
 const a=new RobotWorld(),b=new RobotWorld();
 for(let t=5;t<=60000;t+=5){const l=t%1000<500?0.1:0.2,r=t%1500<750?0.2:0.1;a.advance(t,l,r);b.advance(t,l,r);}
 assert.deepEqual(a.state(),b.state());assert.ok(a.trail.length<=1200);
 const before=a.state();a.senseCm();a.senseCm();assert.deepEqual(a.state(),before);
 assert.throws(()=>a.advance(-1,0,0));assert.throws(()=>a.advance(60001,NaN,0));
});
