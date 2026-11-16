// Física 2D de la pista: integra el robot con las órdenes de la máquina de estados.
import { Brain } from './brain.js';
import { START, SENSOR_OFFSET, MAX_RANGE, presetObstacles, rayDist, hits, inGoal } from './world.js';

const MIN_PWM = 70; // por debajo, el motor DC solo zumba
const TIMEOUT = 150; // s
const eff = (v) => (Math.abs(v) < MIN_PWM ? 0 : v);

export class SimCore {
  constructor(getParams, onState) {
    this.getParams = getParams;
    this.onState = onState;
    this.obstacles = presetObstacles();
    this.reset();
  }

  reset() {
    this.r = { ...START };
    this.brain = new Brain({ ...this.getParams() }, this.onState);
    this.status = 'idle'; // idle | run | won | crash | timeout
    this.trail = [];
    this.time = 0;
    this.acc = 0;
  }

  restoreTrack() { this.obstacles = presetObstacles(); this.reset(); }

  sensorOrigin() {
    const a = (this.r.h * Math.PI) / 180;
    return [this.r.x + Math.cos(a) * SENSOR_OFFSET, this.r.y + Math.sin(a) * SENSOR_OFFSET];
  }

  /** Distancia medida con el servo en `servo` grados (90 = frente, 20 = derecha, 160 = izquierda). */
  ray(servo) {
    const [ox, oy] = this.sensorOrigin();
    return Math.min(MAX_RANGE, rayDist(this.obstacles, ox, oy, this.r.h + (90 - servo)));
  }

  step(dt) {
    if (this.status !== 'run') return;
    this.time += dt;
    const b = this.brain;
    b.update(dt, (s) => this.ray(s));
    const l = eff(b.m.l);
    const r = eff(b.m.r);
    this.stalled = (b.m.l !== 0 && l === 0) || (b.m.r !== 0 && r === 0);
    this.r.h += ((l - r) / 2) * dt;
    const lin = ((l + r) / 2) * 0.2 * dt;
    const a = (this.r.h * Math.PI) / 180;
    const nx = this.r.x + Math.cos(a) * lin;
    const ny = this.r.y + Math.sin(a) * lin;
    if (hits(this.obstacles, nx, ny)) this.status = 'crash';
    else { this.r.x = nx; this.r.y = ny; }
    this.acc += dt;
    if (this.acc >= 0.1) { this.acc = 0; this.trail.push([this.r.x, this.r.y]); }
    if (inGoal(this.r.x, this.r.y)) this.status = 'won';
    else if (this.time > TIMEOUT) this.status = 'timeout';
  }
}
