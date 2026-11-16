import { ease, pointMix } from './geometry.js';

// Una sola cinemática reversible. Piernas recogidas y propulsión dorsal separada.
export function robotPose(morph, time = 0) {
  const tuck = ease(morph / .65);
  const foldArms = ease((morph-.08)/.65);
  const deployment = ease((morph-.30)/.70);
  const limbs = [-1,1].map(side => ({
    side,
    armRoot: pointMix([side*.66,.65,0],[side*.49,.40,.02],foldArms),
    armJoint: pointMix([side*1.12,.03,.02],[side*.64,.04,.30],foldArms),
    hand: pointMix([side*1.13,-.76,.06],[side*.28,.12,.63],foldArms),
    hip: [side*.28,-.48,0],
    knee: pointMix([side*.37,-1.34,.02],[side*.23,-.74,.05],tuck),
    foot: pointMix([side*.42,-2.12,.17],[side*.23,-.62,-.44],tuck),
  }));
  limbs.forEach(limb => { limb.armJoint[1] += Math.sin(time*1.6)*.025*(1-foldArms); });
  const rotors = [];
  for (const side of [-1,1]) for (const direction of [-1,1]) {
    const root = [side*.32,.66,-.38+direction*.1];
    const end = pointMix([side*.40,.87,-.42+direction*.18],[side*1.82,.63,direction*1.30],deployment);
    const joint = pointMix([side*.37,.78,-.42+direction*.13],[side*1.08,.65,direction*.69],deployment);
    rotors.push({side,direction,root,joint,end,deployment});
  }
  return {limbs,rotors};
}
