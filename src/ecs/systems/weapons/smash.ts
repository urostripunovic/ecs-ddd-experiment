// The warhammer coming down where its throw stops: a hit all round, lodged
// weapons knocked loose, nearby orbiting pillars pushed away.
import { C, Collider, Shake, Team, Thrown, Transform } from '../../components';
import { solidBuf, targetBuf } from '../../core/buffers';
import { entityAt, handleAt, has, type EntityId } from '../../core/world';
import { SMASH_RADIUS } from '../../weapons/defs';
import { hurt } from '../damage';
import { pushPillar } from '../pillars';
import { releaseStuck } from './follow';
import { SMASH_SHAKE, defOf, putOnGround, wear } from './items';

// The warhammer coming down: everything of the other side within the radius is
// hit once, and loses whatever was lodged in it. Reads the targets flightSystem
// already gathered in targetBuf.
export function smash(hammer: EntityId, targets: number, solids: number): void {
  const x = Transform.x[hammer];
  const z = Transform.z[hammer];
  const by = handleAt(Thrown.by, hammer);
  let hit = false;
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[hammer]) continue;
    const r = SMASH_RADIUS + Collider.radius[t];
    const dx = Transform.x[t] - x;
    const dz = Transform.z[t] - z;
    if (dx * dx + dz * dz > r * r) continue;
    hurt(t, Thrown.dmg[hammer], by);
    releaseStuck(t);
    hit = true;
  }
  if (hit) wear(hammer, defOf(hammer).throwWear * Thrown.wearMul[hammer]);
  // Pillars within reach are knocked away from where it came down.
  for (let j = 0; j < solids; j++) {
    const pillar = entityAt(solidBuf, j);
    if (has(pillar, C.Health)) continue;
    const dx = Transform.x[pillar] - x;
    const dz = Transform.z[pillar] - z;
    const d = Math.hypot(dx, dz);
    if (d > SMASH_RADIUS + Collider.radius[pillar] || d < 1e-6) continue;
    pushPillar(pillar, dx / d, dz / d);
  }
  // Shake has several writers on purpose: each only raises it (see finalShot).
  Shake.trauma = Math.max(Shake.trauma, SMASH_SHAKE);
  putOnGround(hammer, x, z, defOf(hammer).throwLockTicks);
}
