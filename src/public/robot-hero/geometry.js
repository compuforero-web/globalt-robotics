// Geometría propia: sólidos articulados, iluminación y proyección ortográfica.
export const mix = (a, b, t) => a + (b - a) * t;
export const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const pointMix = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const palette = {
  shell: '#c3c8c9', dark: '#333a40', black: '#12191e', steel: '#7c898e',
  copper: '#b67c48', amber: '#dca445', cyan: '#70d0e0', board: '#315c52',
};
const rotate = ([x, y, z], [rx = 0, ry = 0, rz = 0]) => {
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const minus = (a, b) => a.map((v, i) => v - b[i]);
const shade = (hex, brightness) => {
  const values = hex.match(/\w\w/g).map(v => Math.min(255, Math.round(parseInt(v, 16) * brightness)));
  return `rgb(${values.join(',')})`;
};

export class Geometry {
  constructor(ctx, width, height, time, morph) {
    this.ctx = ctx; this.width = width; this.height = height; this.faces = [];
    this.scale = Math.min(width / 6.6, height / 5.7);
    this.rotation = [-.31, -.47 + Math.sin(time * .17) * .05, Math.sin(time * .9) * .012 * morph];
    this.lift = morph * .22 + Math.sin(time * 1.5) * (.025 + morph * .035);
  }
  world(point) { return rotate([point[0], point[1] + this.lift, point[2]], this.rotation); }
  project([x, y, z]) { return [this.width / 2 + x * this.scale, this.height * .49 - y * this.scale, z]; }
  face(points, material, alpha = 1) {
    const vertices = points.map(p => this.world(p));
    const normal = cross(minus(vertices[1], vertices[0]), minus(vertices[2], vertices[0]));
    const length = Math.hypot(...normal) || 1;
    const light = Math.max(0, (normal[0] * -.35 + normal[1] * .7 + normal[2] * .65) / length);
    this.faces.push({ points: vertices.map(p => this.project(p)), color: shade(palette[material] || material, .57 + light * .57), alpha,
      depth: vertices.reduce((sum, p) => sum + p[2], 0) / vertices.length });
  }
  box(center, size, material, rotation = [0, 0, 0]) {
    const points = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map(p => rotate(p.map((v, i) => v * size[i] / 2), rotation).map((v, i) => v + center[i]));
    for (const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]]) {
      this.face(face.map(i => points[i]), material);
    }
  }
  housing(center, size, material, rotation = [0,0,0]) {
    const [w,h,d] = size.map(v => v/2), cut = Math.min(w,h)*.22;
    const rim = [[-w+cut,-h],[w-cut,-h],[w,-h+cut],[w,h-cut],[w-cut,h],[-w+cut,h],[-w,h-cut],[-w,-h+cut]];
    const points = [-d,d].flatMap(z => rim.map(([x,y]) => rotate([x,y,z],rotation).map((v,i)=>v+center[i])));
    this.face(points.slice(0,8).reverse(),material); this.face(points.slice(8),material);
    for(let i=0;i<8;i++) { const j=(i+1)%8; this.face([points[i],points[j],points[j+8],points[i+8]],material); }
  }
  cylinder(center, radius, length, material, axis = 'y', segments = 14, inner = 0) {
    const ring = (r, h, i) => {
      const a = i / segments * Math.PI * 2;
      const p = [Math.cos(a) * r, h, Math.sin(a) * r];
      const mapped = axis === 'z' ? [p[0], p[2], p[1]] : axis === 'x' ? [p[1], p[0], p[2]] : p;
      return mapped.map((v, k) => v + center[k]);
    };
    for (let i = 0; i < segments; i++) {
      this.face([ring(radius,-length/2,i),ring(radius,-length/2,i+1),ring(radius,length/2,i+1),ring(radius,length/2,i)],material);
      for (const h of [-length/2,length/2]) {
        this.face([ring(inner,h,i),ring(radius,h,i),ring(radius,h,i+1),ring(inner,h,i+1)],material);
      }
    }
  }
  link(a, b, width, depth, material) {
    const delta = minus(b, a), length = Math.hypot(...delta);
    const y = delta.map(v => v / (length || 1));
    let x = cross(y, [0,0,1]);
    if (Math.hypot(...x) < .01) x = cross(y, [1,0,0]);
    x = x.map(v => v / Math.hypot(...x));
    const z = cross(x, y), center = pointMix(a, b, .5);
    const corners = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map(p => center.map((v,i) => v + x[i]*p[0]*width/2 + y[i]*p[1]*length/2 + z[i]*p[2]*depth/2));
    for (const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[1,2,6,5],[0,4,7,3]]) this.face(face.map(i=>corners[i]),material);
  }
  paint() {
    const { ctx } = this;
    this.faces.sort((a, b) => a.depth - b.depth);
    ctx.lineJoin = 'round';
    for (const f of this.faces) {
      ctx.globalAlpha = f.alpha; ctx.beginPath();
      f.points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath(); ctx.fillStyle = f.color; ctx.fill();
      ctx.strokeStyle = 'rgba(4,12,16,.25)'; ctx.lineWidth = .55; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
