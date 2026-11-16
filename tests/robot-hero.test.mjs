import test from 'node:test';
import assert from 'node:assert/strict';
import { Geometry } from '../src/public/robot-hero/geometry.js';
import { drawRobot } from '../src/public/robot-hero/model.js';
import { setupRobotHero } from '../src/public/robot-hero/index.js';

const context = () => new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, {
  get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => (target[key] = value, true),
});

test('robot, mecanismo expuesto y dron se dibujan sin coordenadas inválidas', () => {
  for (const width of [280, 390, 640]) {
    for (const morph of [0,.15,.35,.5,.75,1]) {
      assert.doesNotThrow(() => drawRobot(context(), width, width/1.12, 5, morph));
      const g = new Geometry(context(), width, width/1.12, 5, morph);
      g.housing([0,0,0],[1,1,.4],'shell');
      g.link([0,0,0],[0,1,0],.2,.2,'dark');
      g.link([0,0,0],[0,0,1],.2,.2,'steel');
      g.cylinder([0,0,0],.5,.1,'steel','y',20,.45);
      assert.ok(g.faces.every(face => Number.isFinite(face.depth) && face.points.every(point => point.every(Number.isFinite))));
    }
  }
});

function fixture(reduced = false) {
  const ctx = context();
  const node = () => ({ textContent:'', style:{}, dataset:{}, events:{}, hidden:false,
    addEventListener(name, fn) { this.events[name] = fn; },
    setAttribute(name, value) { this[name] = value; } });
  const selectors = ['canvas','[data-robot-mode]','[data-robot-step]','[data-robot-code]',
    '[data-robot-hint]','[data-robot-meter]','[data-robot-pause]','[data-robot-transform]'];
  const elements = Object.fromEntries(selectors.map(selector => [selector,node()]));
  elements.canvas.getContext = () => ctx;
  const root = { dataset:{}, querySelector: selector => elements[selector] };
  const frames = new Map(); let id = 0;
  globalThis.document = { hidden:false, querySelector:() => root, addEventListener() {} };
  globalThis.matchMedia = () => ({ matches:reduced, addEventListener() {} });
  globalThis.devicePixelRatio = 2;
  globalThis.requestAnimationFrame = fn => { frames.set(++id,fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.ResizeObserver = class { constructor(fn) { this.fn=fn; } observe() { this.fn([{contentRect:{width:390,height:348}}]); } };
  globalThis.IntersectionObserver = class { constructor(fn) { this.fn=fn; } observe() { this.fn([{isIntersecting:true}]); } };
  setupRobotHero();
  return {elements,frames};
}

test('pausa, reanudación y conversión manual controlan la misma animación', () => {
  const {elements:e,frames} = fixture();
  assert.equal(frames.size,1);
  e['[data-robot-pause]'].events.click();
  assert.equal(frames.size,0);
  assert.equal(e['[data-robot-pause]']['aria-pressed'],'true');
  e['[data-robot-transform]'].events.click();
  assert.equal(frames.size,1);
  assert.match(e['[data-robot-code]'].textContent,/limbs.fold/);
  assert.equal(e['[data-robot-pause]']['aria-pressed'],'false');
});

test('movimiento reducido ofrece estados estáticos y permite cambiar de forma', () => {
  const {elements:e,frames} = fixture(true);
  assert.equal(frames.size,0);
  assert.equal(e['[data-robot-pause]'].hidden,true);
  e['[data-robot-transform]'].events.click();
  assert.equal(e['[data-robot-mode]'].textContent,'DRON');
  assert.equal(frames.size,0);
  e['[data-robot-transform]'].events.click();
  assert.equal(e['[data-robot-mode]'].textContent,'ROBOT');
});
