import { Arena, C, Collider, Transform } from '../components';
import { buf, solidBuf } from '../core/buffers';
import { despawn, entityAt, has, mask, query } from '../core/world';

const BODIES = mask(C.Transform, C.Velocity, C.Collider);
// Mid-jump the boss passes over pillars and the player, instead of being shoved by them.
const BODY_EXCLUDE = mask(C.Projectile, C.Dead, C.Airborne);
const SOLID_EXCLUDE = mask(C.Dead, C.Airborne);
const SOLIDS = mask(C.Transform, C.Collider, C.Solid);
const PROJECTILES = mask(C.Transform, C.Projectile);

// reads Collider, Solid, Arena | writes Transform
// Circles only: the arena is a greybox, and circle push-out never snags on corners.
export function bodyCollisionSystem(): void {
  const solids = query(solidBuf, SOLIDS, SOLID_EXCLUDE);
  const n = query(buf, BODIES, BODY_EXCLUDE);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    const r = Collider.radius[e];

    for (let j = 0; j < solids; j++) {
      const s = entityAt(solidBuf, j);
      if (s === e) continue;
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
    Transform.z[e] = Math.max(-limit, Math.min(limit, Transform.z[e]));
  }
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
