import { DOORS } from '../arenas';
import { Arena, C, Collider, RunView, Transform } from '../components';
import { buf, solidBuf } from '../core/buffers';
import { despawn, entityAt, has, mask, query } from '../core/world';
import { dodging } from './status';

const BODIES = mask(C.Transform, C.Velocity, C.Collider);
// Mid-jump the boss passes over pillars and the player, instead of being shoved by them.
const BODY_EXCLUDE = mask(C.Projectile, C.Dead, C.Airborne);
const SOLID_EXCLUDE = mask(C.Dead, C.Airborne);
const SOLIDS = mask(C.Transform, C.Collider, C.Solid);
const PROJECTILES = mask(C.Transform, C.Projectile);

// reads Collider, Solid, Arena, RunView.tunnelOpen, RunView.finalDoorOpen, Dodge | writes Transform
// Circles only: the arena is a greybox, and circle push-out never snags on corners.
export function bodyCollisionSystem(): void {
  const solids = query(solidBuf, SOLIDS, SOLID_EXCLUDE);
  const n = query(buf, BODIES, BODY_EXCLUDE);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    const r = Collider.radius[e];

    for (let j = 0; j < solids; j++) {
      const s = entityAt(solidBuf, j);
      // A dodge rolls through the boss, so its body can't pin you under a stamp. Pillars still stop it.
      if (s === e || (has(s, C.Boss) && dodging(e))) continue;
      const dx = Transform.x[e] - Transform.x[s];
      const dz = Transform.z[e] - Transform.z[s];
      const min = r + Collider.radius[s];
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      // Exactly overlapping centres have no direction, so push along +z.
      const d = Math.sqrt(d2) || 1;
      const nx = d2 === 0 ? 0 : dx / d;
      const nz = d2 === 0 ? 1 : dz / d;
      Transform.x[e] = Transform.x[s] + nx * min;
      Transform.z[e] = Transform.z[s] + nz * min;
    }

    const limit = Arena.half - r;
    Transform.x[e] = Math.max(-limit, Math.min(limit, Transform.x[e]));
    // An open door lets a body inside its width walk past the north wall; once
    // past the wall line, that corridor's sides are the walls. The doors sit far
    // enough apart that a body is never inside both, and a body already past the
    // wall line is in the corridor nearest it, whatever it did this tick.
    const corridor = DOORS.halfWidth - r;
    const x = Transform.x[e];
    const past = Transform.z[e] < -limit;
    const door = inDoor(DOORS.onward.x, RunView.tunnelOpen, x, corridor, past)
      ? DOORS.onward.x
      : inDoor(DOORS.final.x, RunView.finalDoorOpen, x, corridor, past) ? DOORS.final.x : Number.NaN;
    const inCorridor = !Number.isNaN(door);
    const minZ = inCorridor ? -(Arena.half + DOORS.depth - r) : -limit;
    Transform.z[e] = Math.max(minZ, Math.min(limit, Transform.z[e]));
    if (inCorridor && Transform.z[e] < -limit) Transform.x[e] = Math.max(door - corridor, Math.min(door + corridor, x));
  }
}

// Inside the width of an open door, or past the wall line and nearer it than
// any other door: half the gap between the doors is plenty, a tick moves far less.
function inDoor(doorX: number, open: boolean, x: number, corridor: number, past: boolean): boolean {
  if (!open) return false;
  const reach = past ? Math.abs(DOORS.final.x - DOORS.onward.x) / 2 : corridor;
  return Math.abs(x - doorX) <= reach;
}

// reads Projectile, Collider, Solid, Arena | despawns Projectile
// Only obstacles without Health stop shots here; damage is projectileSystem's job.
export function projectileCollisionSystem(): void {
  const solids = query(solidBuf, SOLIDS, C.Dead);
  const n = query(buf, PROJECTILES);
  for (let i = 0; i < n; i++) {
    const p = entityAt(buf, i);
    const x = Transform.x[p];
    const z = Transform.z[p];
    if (Math.abs(x) > Arena.half || Math.abs(z) > Arena.half) { despawn(p); continue; }

    for (let j = 0; j < solids; j++) {
      const s = entityAt(solidBuf, j);
      if (has(s, C.Health)) continue;
      const dx = x - Transform.x[s];
      const dz = z - Transform.z[s];
      const r = Collider.radius[s];
      if (dx * dx + dz * dz > r * r) continue;
      despawn(p);
      break;
    }
  }
}
