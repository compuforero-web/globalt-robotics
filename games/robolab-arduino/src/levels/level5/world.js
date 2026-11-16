// Pista 300×200 cm vista desde arriba: geometría, rayo ultrasónico y colisiones.
export const W = 300;
export const H = 200;
export const GOAL = { x: 256, y: 128, w: 42, h: 70 };
export const START = { x: 30, y: 130, h: 0 };
export const ROBOT_R = 9;
export const SENSOR_OFFSET = 8;
export const MAX_RANGE = 400;
export const presetObstacles = () => [
  { x: 100, y: 80, w: 14, h: 120 },
  { x: 182, y: 0, w: 14, h: 92 },
];

function rayBox(ox, oy, dx, dy, b) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, b.x, b.x + b.w], [oy, dy, b.y, b.y + b.h]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let a = (lo - o) / d;
    let c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, c);
  }
  return tmax < 0 || tmin > tmax ? Infinity : Math.max(tmin, 0);
}

/** Distancia (cm) que mediría el HC-SR04 desde (ox,oy) hacia angleDeg (y hacia abajo). */
export function rayDist(obstacles, ox, oy, angleDeg) {
  const r = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const tx = dx > 1e-9 ? (W - ox) / dx : dx < -1e-9 ? -ox / dx : Infinity;
  const ty = dy > 1e-9 ? (H - oy) / dy : dy < -1e-9 ? -oy / dy : Infinity;
  let best = Math.min(tx, ty);
  for (const b of obstacles) best = Math.min(best, rayBox(ox, oy, dx, dy, b));
  return Math.min(best, MAX_RANGE);
}

/** ¿El chasis (círculo) toca una pared o un obstáculo en (x,y)? */
export function hits(obstacles, x, y) {
  if (x < ROBOT_R || y < ROBOT_R || x > W - ROBOT_R || y > H - ROBOT_R) return true;
  return obstacles.some((b) => {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    return (x - nx) ** 2 + (y - ny) ** 2 < ROBOT_R * ROBOT_R;
  });
}

export const inGoal = (x, y) => x >= GOAL.x && x <= GOAL.x + GOAL.w && y >= GOAL.y && y <= GOAL.y + GOAL.h;
