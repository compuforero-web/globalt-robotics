import { drawRobot } from './model.js';
import { ease } from './geometry.js';

const STAGES = [
  { mode:'ROBOT', step:'01 / EN ESPERA', line:'servo.lock("humanoid");', hint:'Articulaciones bloqueadas · óptica activa', meter:12 },
  { mode:'TRANSFORMACIÓN', step:'02 / RECONFIGURAR', line:'chassis.open(); limbs.fold(90);', hint:'Bastidor expuesto · repliegue de articulaciones', meter:48 },
  { mode:'DRON', step:'03 / VUELO ESTABLE', line:'rotors.arm(); flight.stabilize();', hint:'Cuatro motores activos · fuselaje compacto', meter:100 },
  { mode:'RECONSTRUCCIÓN', step:'04 / DESPLEGAR', line:'rotors.stop(); humanoid.deploy();', hint:'Extensión de extremidades · retorno a posición', meter:60 },
];

export function setupRobotHero() {
  const root = document.querySelector('[data-robot-lab]');
  if (!root) return;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) { root.dataset.unavailable = 'true'; return; }
  const mode = root.querySelector('[data-robot-mode]');
  const step = root.querySelector('[data-robot-step]');
  const code = root.querySelector('[data-robot-code]');
  const hint = root.querySelector('[data-robot-hint]');
  const progress = root.querySelector('[data-robot-meter]');
  const pause = root.querySelector('[data-robot-pause]');
  const transform = root.querySelector('[data-robot-transform]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let clock = 0, previous = 0, raf = 0, width = 0, height = 0;
  let paused = false, visible = true, stage = -1, staticDrone = false;

  function status(index) {
    if (index === stage) return;
    stage = index;
    mode.textContent = STAGES[index].mode; step.textContent = STAGES[index].step;
    code.textContent = STAGES[index].line; hint.textContent = STAGES[index].hint;
    progress.style.width = STAGES[index].meter + '%';
    root.dataset.mode = index === 2 ? 'drone' : 'robot';
    root.dataset.converting = String(index === 1 || index === 3);
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
    pause.textContent = paused ? 'Reanudar' : 'Pausar'; resume();
  });
  transform.addEventListener('click', () => {
    if (media.matches) { staticDrone = !staticDrone; transform.textContent = staticDrone ? 'Ver robot' : 'Ver dron'; }
    else { clock = 3; paused = false; pause.textContent = 'Pausar'; pause.setAttribute('aria-pressed','false'); }
    render(); resume();
  });
  function motionPreference() {
    pause.hidden = media.matches;
    transform.textContent = media.matches ? (staticDrone ? 'Ver robot' : 'Ver dron') : 'Transformar';
    render(); resume();
  }
  media.addEventListener('change', motionPreference);
  motionPreference();
}
