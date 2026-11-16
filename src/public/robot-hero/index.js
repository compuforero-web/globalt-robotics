import { drawRobot } from './model.js';
import { ease } from './geometry.js';

export function setupRobotHero() {
  const root = document.querySelector('[data-robot-lab]');
  if (!root) return;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) { root.dataset.unavailable = 'true'; return; }
  const code = root.querySelector('[data-robot-code]');
  const secondary = root.querySelector('[data-robot-code-secondary]');
  const pause = root.querySelector('[data-robot-pause]');
  const transform = root.querySelector('[data-robot-transform]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let clock = 0, previous = 0, raf = 0, width = 0, height = 0;
  let paused = false, visible = true, stage = -1, staticDrone = false;

  function status(index) {
    if (index === stage) return;
    stage = index;
    const converting = index === 1 || index === 3;
    root.dataset.mode = index === 2 ? 'drone' : 'robot';
    root.dataset.converting = String(converting);
    code.textContent = converting ? (index === 1 ? 'legs.retract();\ncore.reconfigure();' : 'rotors.disarm();\nlegs.extend();') : '';
    secondary.textContent = converting ? (index === 1 ? 'backpack.deployRotors();\nflight.stabilize();' : 'backpack.foldRotors();\nhumanoid.restore();') : '';
  }
  function render() {
    const t = clock % 18;
    let morph = t < 3 ? 0 : t < 7 ? ease((t-3)/4) : t < 11 ? 1 : t < 15 ? 1-ease((t-11)/4) : 0;
    const index = t < 3 || t >= 15 ? 0 : t < 7 ? 1 : t < 11 ? 2 : 3;
    if (media.matches) morph = staticDrone ? 1 : 0;
    status(media.matches ? (staticDrone ? 2 : 0) : index);
    drawRobot(ctx, width, height, media.matches ? 0 : clock, morph);
  }
  function running() { return visible && !document.hidden && !paused && !media.matches; }
  function animate(timestamp) {
    raf = 0;
    if (!running()) { previous = 0; return; }
    if (previous && timestamp-previous < 1000/30) { raf = requestAnimationFrame(animate); return; }
    if (previous) clock += Math.min((timestamp-previous)/1000, .06);
    previous = timestamp; render(); raf = requestAnimationFrame(animate);
  }
  function resume() {
    cancelAnimationFrame(raf); raf = 0; previous = 0;
    if (running()) raf = requestAnimationFrame(animate);
  }
  const resize = new ResizeObserver(entries => {
    width = entries[0].contentRect.width; height = entries[0].contentRect.height;
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); render();
  });
  resize.observe(canvas);
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; resume(); }, { threshold:.05 });
  observer.observe(root);
  document.addEventListener('visibilitychange', resume);
  pause.addEventListener('click', () => {
    paused = !paused; pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Reanudar animación' : 'Pausar animación'; resume();
  });
  transform.addEventListener('click', () => {
    staticDrone = !staticDrone;
    transform.textContent = staticDrone ? 'Ver robot' : 'Ver dron'; render();
  });
  function motionPreference() {
    pause.hidden = media.matches; transform.hidden = !media.matches;
    render(); resume();
  }
  media.addEventListener('change', motionPreference);
  motionPreference();
}
