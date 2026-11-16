// Máquina de estados: refleja línea a línea el loop() del código C++ mostrado al estudiante.
export const ST = { FWD: 'FWD', STOP: 'STOP', R: 'LOOK_R', L: 'LOOK_L', C: 'CENTER', TURN: 'TURN' };
export const STATE_NAMES = {
  FWD: 'AVANZAR', STOP: 'FRENAR', LOOK_R: 'MIRAR DERECHA (20°)', LOOK_L: 'MIRAR IZQUIERDA (160°)', CENTER: 'CENTRAR (90°)', TURN: 'GIRAR',
};
const SERVO_SPEED = 300; // °/s del SG90 simulado
const SETTLE = 0.3; // delay(300) tras mover el servo

export class Brain {
  constructor(params, onState) {
    this.p = params;
    this.onState = onState || (() => {});
    this.servo = 90;
    this.target = 90;
    this.m = { l: 0, r: 0 };
    this.dist = 0;
    this.dR = 0;
    this.dL = 0;
    this.tick = 0;
    this.go(ST.FWD);
  }

  go(s) { this.state = s; this.t = 0; this.onState(s); }

  /** sense(anguloServo) → cm (entero, como el `long` del código). */
  update(dt, sense) {
    const p = this.p;
    this.t += dt;
    const d = this.target - this.servo;
    const step = SERVO_SPEED * dt;
    const arrived = Math.abs(d) <= step;
    this.servo = arrived ? this.target : this.servo + Math.sign(d) * step;
    if (!arrived) this.t = 0;
    const settled = arrived && this.t >= SETTLE;
    switch (this.state) {
      case ST.FWD:
        this.target = 90;
        this.m = { l: p.vel, r: p.vel };
        this.tick -= dt;
        if (arrived && this.tick <= 0) {
          this.tick = 0.08;
          this.dist = Math.floor(sense(this.servo));
          if (this.dist < p.dmin) this.go(ST.STOP);
        }
        break;
      case ST.STOP:
        this.m = { l: 0, r: 0 };
        if (this.t >= 0.25) this.go(ST.R);
        break;
      case ST.R:
        this.target = 20;
        if (settled) { this.dR = Math.floor(sense(this.servo)); this.go(ST.L); }
        break;
      case ST.L:
        this.target = 160;
        if (settled) { this.dL = Math.floor(sense(this.servo)); this.go(ST.C); }
        break;
      case ST.C:
        this.target = 90;
        if (arrived && this.t >= 0.2) {
          this.dir = this.dL > this.dR ? -1 : 1;
          this.turnT = this.dL < p.dmin && this.dR < p.dmin ? 1.2 : 0.6;
          this.go(ST.TURN);
        }
        break;
      case ST.TURN:
        this.m = { l: this.dir * p.vt, r: -this.dir * p.vt };
        if (this.t >= this.turnT) { this.m = { l: 0, r: 0 }; this.tick = 0; this.go(ST.FWD); }
        break;
      default:
    }
  }
}
