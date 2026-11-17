// Mundo determinista en metros y segundos. Solo recibe las velocidades de los motores emulados.
export const WORLD = Object.freeze({ radius: 0.10, sensorOffset: 0.10, wheelRadius: 0.0325,
  wheelBase: 0.16, rpmMax: 200, tickMs: 5, idleSpeed: 0.01, coneDeg: 15, maxEchoM: 4 });
export const TRACKS = [
  { id: 'patio', name: 'Patio', width: 4.5, height: 3.5, start: { x: 0.6, y: 0.65, heading: 0 },
    obstacles: [{ x: 1.9, y: 0.35, w: 0.35, h: 1.5 }, { x: 3.1, y: 2.2, w: 0.6, h: 0.5 }] },
  { id: 'columnas', name: 'Columnas', width: 4.5, height: 3.5, start: { x: 0.55, y: 2.8, heading: 0 },
    obstacles: [{ x: 1.5, y: 2.25, w: 0.45, h: 0.9 }, { x: 2.6, y: 0.45, w: 0.55, h: 1.0 }, { x: 3.3, y: 2.4, w: 0.45, h: 0.5 }] },
  { id: 'pasillos', name: 'Pasillos', width: 4.5, height: 3.5, start: { x: 0.6, y: 0.55, heading: 0.25 },
    obstacles: [{ x: 1.5, y: 0.2, w: 0.3, h: 1.4 }, { x: 2.65, y: 1.9, w: 0.3, h: 1.35 }] },
];
export function trackById(id = TRACKS[0].id) {
  const t = TRACKS.find(x => x.id === id);
  if (!t) throw new Error('Pista desconocida. Elige una de las tres pistas del reto.');
  return { ...t, start: { ...t.start }, obstacles: t.obstacles.map(r => ({ ...r })) };
}
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export const circleRect = (x,y,radius,r) => Math.hypot(x-clamp(x,r.x,r.x+r.w), y-clamp(y,r.y,r.y+r.h)) < radius;
export function rayRect(x,y,dx,dy,r) {
  let lo=-Infinity, hi=Infinity;
  for (const [p,d,a,b] of [[x,dx,r.x,r.x+r.w],[y,dy,r.y,r.y+r.h]]) {
    if (Math.abs(d)<1e-12) { if (p<a || p>b) return Infinity; continue; }
    const u=(a-p)/d, v=(b-p)/d;
    lo=Math.max(lo,Math.min(u,v)); hi=Math.min(hi,Math.max(u,v));
  }
  return hi<Math.max(lo,0) ? Infinity : Math.max(0,lo);
}
const normalizeAngle = a => Math.atan2(Math.sin(a),Math.cos(a));
export class RobotWorld {
  constructor({track=TRACKS[0].id,params={}}={}) {
    this.track=trackById(track); this.P={...WORLD,...params};
    this.x=this.track.start.x; this.y=this.track.start.y; this.heading=this.track.start.heading;
    this.timeMs=0;this.pathM=0;this.collisions=0;this.contact=false;this.idleMs=0;this.maxIdleMs=0;
    this.trail=[{x:this.x,y:this.y}];this.lastTrail=0;
  }
  blocked(x,y) {
    const {radius:r}=this.P,t=this.track;
    return x<r||y<r||x>t.width-r||y>t.height-r||t.obstacles.some(o=>circleRect(x,y,r,o));
  }
  advance(toMs,left,right) {
    if(!Number.isFinite(toMs)||!Number.isFinite(left)||!Number.isFinite(right)||toMs<this.timeMs) throw new Error('Paso del mundo inválido');
    const maxV=this.P.rpmMax*2*Math.PI*this.P.wheelRadius/60;
    const vl=clamp(left,-1,1)*maxV,vr=clamp(right,-1,1)*maxV;
    const v=(vl+vr)/2,omega=(vr-vl)/this.P.wheelBase;
    while(this.timeMs<toMs) {
      const dtMs=Math.min(this.P.tickMs,toMs-this.timeMs),dt=dtMs/1000,angle=this.heading+omega*dt;
      const dx=Math.abs(omega)<1e-10?v*dt*Math.cos(this.heading):v/omega*(Math.sin(angle)-Math.sin(this.heading));
      const dy=Math.abs(omega)<1e-10?v*dt*Math.sin(this.heading):-v/omega*(Math.cos(angle)-Math.cos(this.heading));
      const blocked=this.blocked(this.x+dx,this.y+dy);
      if(blocked&&!this.contact)this.collisions++;
      this.contact=blocked;
      const travel=blocked?0:Math.hypot(dx,dy);
      if(!blocked){this.x+=dx;this.y+=dy;this.pathM+=travel;}
      this.heading=normalizeAngle(angle);
      this.idleMs=travel/dt<this.P.idleSpeed?this.idleMs+dtMs:0;
      this.maxIdleMs=Math.max(this.maxIdleMs,this.idleMs);this.timeMs+=dtMs;
      if(this.timeMs-this.lastTrail>=100){this.lastTrail=this.timeMs;this.trail.push({x:this.x,y:this.y});if(this.trail.length>1200)this.trail.shift();}
    }
  }
  senseCm() {
    const {x,y,heading:a,P,track:t}=this;
    const sx=x+P.sensorOffset*Math.cos(a),sy=y+P.sensorOffset*Math.sin(a);
    let best=Infinity;
    for(let i=0;i<=8;i++){
      const angle=a+(i/8-0.5)*P.coneDeg*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
      const hits=[dx>1e-12?(t.width-sx)/dx:dx< -1e-12?-sx/dx:Infinity,
        dy>1e-12?(t.height-sy)/dy:dy< -1e-12?-sy/dy:Infinity,...t.obstacles.map(o=>rayRect(sx,sy,dx,dy,o))];
      best=Math.min(best,...hits.filter(d=>d>=0));
    }
    return best>P.maxEchoM?null:Math.max(2,best*100);
  }
  state(){return{track:this.track.id,x:this.x,y:this.y,heading:this.heading,pathM:this.pathM,
    collisions:this.collisions,maxIdleMs:this.maxIdleMs,timeMs:this.timeMs,cm:this.senseCm(),contact:this.contact};}
}
