// Dibujo Canvas 2D de la pista, el robot y el haz ultrasónico.
import { W, H, GOAL, ROBOT_R } from './world.js';

const rad = (d) => (d * Math.PI) / 180;

function drawRobot(c, sim) {
  const { x, y, h } = sim.r;
  c.save();
  c.translate(x, y);
  c.rotate(rad(h));
  c.fillStyle = '#222'; c.fillRect(-7, -ROBOT_R - 1.5, 14, 3.5); c.fillRect(-7, ROBOT_R - 2, 14, 3.5);
  c.fillStyle = '#2563eb'; c.fillRect(-ROBOT_R, -7.5, ROBOT_R * 2, 15);
  c.fillStyle = '#e5e7eb'; c.fillRect(-8, -3, 6, 6);
  c.translate(8, 0);
  c.rotate(rad(90 - sim.brain.servo));
  c.fillStyle = '#0e7490'; c.fillRect(-1.5, -5, 3.5, 10);
  c.fillStyle = '#facc15'; c.fillRect(1.5, -3, 1.5, 6);
  c.restore();
}

function drawBeam(c, sim) {
  const [ox, oy] = sim.sensorOrigin();
  const s = sim.brain.servo;
  const a = rad(sim.r.h + (90 - s));
  const len = sim.ray(s);
  c.fillStyle = 'rgba(250, 204, 21, .28)';
  c.beginPath(); c.moveTo(ox, oy); c.arc(ox, oy, len, a - 0.14, a + 0.14); c.closePath(); c.fill();
  c.strokeStyle = '#facc15'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len); c.stroke();
  c.fillStyle = '#facc15';
  c.beginPath(); c.arc(ox + Math.cos(a) * len, oy + Math.sin(a) * len, 1.6, 0, 7); c.fill();
}

export function draw(ctx, canvas, sim, selected) {
  const k = canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = '#0f1b2b'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(30,158,90,.55)'; ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
  ctx.strokeStyle = '#1e9e5a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h); ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('META', GOAL.x + GOAL.w / 2, GOAL.y + GOAL.h / 2 + 3);
  sim.obstacles.forEach((b, i) => {
    ctx.fillStyle = i === selected ? '#fb923c' : '#8b6b4a';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#d6b28a'; ctx.lineWidth = 1; ctx.strokeRect(b.x, b.y, b.w, b.h);
  });
  if (sim.trail.length > 1) {
    ctx.strokeStyle = 'rgba(147,197,253,.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
    sim.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
  drawBeam(ctx, sim);
  drawRobot(ctx, sim);
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Servo ${Math.round(sim.brain.servo)}°`, 6, 12);
}
