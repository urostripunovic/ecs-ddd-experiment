// A thrown item in the air: it sticks in what it hits, bounces (Ricochet),
// smashes down (smash) or lands. One that comes back is returnSystem's.
import { Arena, C, Collider, StuckIn, Team, Thrown, Transform, Velocity } from '../../components';
import { buf, solidBuf, targetBuf } from '../../core/buffers';
import { add, entityAt, handleAt, has, query, remove, toHandle } from '../../core/world';
import type { EntityId } from '../../core/world';
import { hurt } from '../damage';
import { RICOCHET_DMG_MUL } from '../perks';
import { smash } from './smash';
import { FLYING_ITEMS, SOLIDS, TARGETS, THROWN_RADIUS, UNHITTABLE, defOf, putOnGround, wear } from './items';

// Ricochet: mirror the velocity off the surface, step back off it, and fly on
// harder, with a fresh flight time.
export function bounce(item: EntityId, nx: number, nz: number): void {
  const along = Velocity.x[item] * nx + Velocity.z[item] * nz;
  if (along < 0) {
    Velocity.x[item] -= 2 * along * nx;
    Velocity.z[item] -= 2 * along * nz;
  }
  const edge = Arena.half - 0.3;
  Transform.x[item] = Math.max(-edge, Math.min(edge, Transform.x[item] + nx * 0.3));
  Transform.z[item] = Math.max(-edge, Math.min(edge, Transform.z[item] + nz * 0.3));
  Thrown.bounces[item]--;
  Thrown.dmg[item] *= RICOCHET_DMG_MUL;
  Thrown.ticksLeft[item] = defOf(item).throwTicks;
}

// A thrown weapon that hits lodges in its target and rides along with it.
export function stick(item: EntityId, host: EntityId): void {
  remove(item, C.Flying);
  add(item, C.Stuck);
  Velocity.x[item] = Velocity.z[item] = 0;
  StuckIn.host[item] = toHandle(host);
  StuckIn.angle[item] = Math.atan2(Transform.z[item] - Transform.z[host], Transform.x[item] - Transform.x[host]);
}

// reads Thrown, Transform, Team, Collider, pillars | writes Health (via hurt), Durability, item state;
// a smash writes Shake and Orbit.kick; a ricochet writes Velocity, Transform, Thrown.dmg/ticksLeft/bounces
// A hit lodges the weapon in the target; a miss lands it, locked for a while.
export function flightSystem(): void {
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  const solids = query(solidBuf, SOLIDS, C.Dead);
  const n = query(buf, FLYING_ITEMS, C.Returning);
  for (let i = 0; i < n; i++) {
    const f = entityAt(buf, i);
    const style = defOf(f).throwStyle;
    const x = Transform.x[f];
    const z = Transform.z[f];
    let landed = false;
    let struck: EntityId | -1 = -1;

    for (let j = 0; j < targets && struck === -1; j++) {
      const t = entityAt(targetBuf, j);
      if (Team.id[t] === Team.id[f]) continue;
      const r = Collider.radius[t] + THROWN_RADIUS;
      const dx = Transform.x[t] - x;
      const dz = Transform.z[t] - z;
      if (dx * dx + dz * dz > r * r) continue;
      struck = t;
    }
    // A hammer doesn't hit what it touches: it comes down there, and the smash does the hurting.
    if (struck !== -1 && style === 'smash') { smash(f, targets, solids); continue; }
    if (struck !== -1) {
      hurt(struck, Thrown.dmg[f], handleAt(Thrown.by, f));
      wear(f, defOf(f).throwWear * Thrown.wearMul[f]);
      stick(f, struck);
      continue;
    }
    // The surface it hit, if any, so a ricochet knows which way to bounce.
    let nx = 0;
    let nz = 0;
    for (let j = 0; j < solids && !landed; j++) {
      const s = entityAt(solidBuf, j);
      if (has(s, C.Health)) continue;
      const r = Collider.radius[s] + 0.2;
      const dx = x - Transform.x[s];
      const dz = z - Transform.z[s];
      if (dx * dx + dz * dz > r * r) continue;
      landed = true;
      const d = Math.hypot(dx, dz) || 1;
      nx = dx / d;
      nz = dz / d;
    }
    const edge = Arena.half - 0.3;
    if (Math.abs(x) > edge) { landed = true; nx = -Math.sign(x); }
    if (Math.abs(z) > edge) { landed = true; nz = -Math.sign(z); }
    if (landed && Thrown.bounces[f] > 0) {
      bounce(f, nx, nz);
      landed = false;
    }
    if (Thrown.ticksLeft[f] > 0) Thrown.ticksLeft[f]--;
    if (Thrown.ticksLeft[f] === 0) landed = true;

    if (landed && style === 'smash') smash(f, targets, solids);
    else if (landed) putOnGround(f, x, z, defOf(f).throwLockTicks);
  }
}
