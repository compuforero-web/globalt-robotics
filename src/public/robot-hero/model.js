import { Geometry, mix, ease, pointMix } from './geometry.js';

export function drawRobot(ctx, width, height, time, morph) {
  ctx.clearRect(0, 0, width, height);
  const g = new Geometry(ctx, width, height, time, morph);
  const open = Math.sin(morph * Math.PI);
  const compact = ease((morph - .3) / .7);
  // Plataforma de referencia y sombra; no se desplazan con el mecanismo.
  ctx.save(); ctx.translate(width / 2, height * .91);
  ctx.scale(1, .24); ctx.beginPath(); ctx.arc(0, 0, width * .32, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(134,160,166,.17)'; ctx.lineWidth = 2; ctx.stroke();
  const shadow = ctx.createRadialGradient(0, 0, 5, 0, 0, width * .29);
  shadow.addColorStop(0, 'rgba(0,0,0,.65)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow; ctx.fill(); ctx.restore();
  // Bastidor, batería, placa de control y cableado de cobre.
  g.housing([0,.25,0], [1.04,1.3-.4*compact,.62], 'dark');
  g.box([0,.17,-.22], [.68,.86,.2], 'black');
  g.box([0,.26,.36], [.64,.79,.055], 'board');
  g.box([0,.27,.405], [.28,.31,.075], 'black');
  for (const side of [-1,1]) {
    for (let i=0; i<5; i++) g.box([side*.21,.04+i*.11,.405],[.075,.025,.025],'copper');
    g.link([side*.37,.68,.25],[side*.37,-.16,.27],.035,.035,'copper');
    // Carcasas se separan durante la conversión y dejan ver el controlador.
    g.housing([side*(.275+open*.43),.25,.48-open*.08],[.51,1.15-.35*compact,.14],'shell',[0,side*open*.8,0]);
    for (const y of [-.16,.68]) g.cylinder([side*(.38+open*.43),y,.565-open*.08],.035,.025,'dark','z',8);
    g.box([side*(.27+open*.43),.16,.57-open*.08],[.035,.39,.02],'dark');
  }
  g.box([0,.59,.57],[.31,.055,.045],'amber');
  // Cuello telescópico y cabeza: la óptica se repliega en el fuselaje.
  const headY = mix(1.51,.46,compact), headZ = mix(.02,.48,compact);
  g.cylinder([0,1.04-.6*compact,0],.18,.38,'steel');
  g.housing([0,headY,headZ],[.85,.57-.25*compact,.66],'shell');
  g.housing([0,headY-.015,headZ+.35],[.70,.25-.09*compact,.045],'black');
  g.box([-.11,headY+.015,headZ+.38],[.32,.032,.015],'cyan');
  g.cylinder([.21,headY,headZ+.39],.075,.045,'steel','z');
  g.cylinder([.21,headY,headZ+.42],.047,.025,'black','z');
  g.box([0,headY+.31-.13*compact,headZ],[.38,.035,.39],'dark');
  for (let i=0;i<4;i++) {
    g.box([-.24+i*.16,headY+.32-.13*compact,headZ],[.045,.02,.3],'steel');
    g.box([-.25+i*.16,-.14,.342],[.06,.17,.025],'copper');
  }
  for (const side of [-1,1]) {
    // Dos brazos y dos piernas pasan a ser cuatro soportes de motor.
    const armRoot = [side*.66,.65,0];
    const armEnd = pointMix([side*1.13,-.76,.06],[side*1.86,.24,-1.31],morph);
    const armJoint = pointMix([side*1.12,.03,.02],[side*1.25,.26,-.69],morph);
    armJoint[1] += Math.sin(time*1.6)*.025*(1-morph);
    g.cylinder(armRoot,.22,.32,'dark','x');
    g.link(armRoot,armJoint,.27,.28,'shell');
    g.cylinder(armJoint,.18,.32,'steel','x');
    g.link(armJoint,armEnd,.20,.24,'dark');
    g.link([armJoint[0],armJoint[1],armJoint[2]+.14],[armEnd[0],armEnd[1],armEnd[2]+.14],.035,.035,'copper');
    const legRoot=[side*.32,-.48,0];
    const knee=pointMix([side*.37,-1.34,.02],[side*1.18,.15,.69],morph);
    const foot=pointMix([side*.42,-2.12,.17],[side*1.86,.24,1.31],morph);
    g.cylinder(legRoot,.19,.29,'steel','x');
    g.link(legRoot,knee,.30,.33,'shell');
    g.cylinder(knee,.17,.36,'dark','x');
    g.link(knee,foot,.23,.27,'steel');
    g.box([foot[0],foot[1]-.06,foot[2]+.07*(1-morph)],[.38,.17,.49-.19*morph],'dark');
    for (const [i,end] of [armEnd,foot].entries()) {
      const r = mix(.14,.52,ease((morph-.25)/.75));
      g.cylinder(end,.18,.22,'black');
      g.cylinder([end[0],end[1]+.11,end[2]],r,.09,'steel','y',20,Math.max(.04,r-.045));
      g.cylinder([end[0],end[1]+.13,end[2]],.10,.14,'dark');
      const speed = ease((morph-.65)/.35);
      const angle = side * (time*(2+speed*36)) + i*1.4;
      for (const offset of [0,Math.PI/2]) {
        g.box([end[0],end[1]+.2,end[2]],[r*1.67,.027,.078],'black',[0,angle+offset,0]);
      }
      g.cylinder([end[0],end[1]+.23,end[2]],.065,.045,'amber');
    }
  }
  g.paint();
}
