// Where something new may appear: clear of solids (the boss most of all) and
// of the player. Used by the weapon stock, the buff drops and the perk drops.
import { Arena, C, Collider, Transform } from '../components';
import { helperBuf } from '../core/buffers';
import { randomRange } from '../core/rng';
import { entityAt, has, mask, query } from '../core/world';

const SOLIDS = mask(C.Transform, C.Collider, C.Solid);
const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform);

function clearSpot(x: number, z: number): boolean {
  const solids = query(helperBuf, SOLIDS, C.Dead);
  for (let i = 0; i < solids; i++) {
    const s = entityAt(helperBuf, i);
    const keepOut = Collider.radius[s] + (has(s, C.Boss) ? 3 : 1.2);
    if (Math.hypot(x - Transform.x[s], z - Transform.z[s]) < keepOut) return false;
  }
  const players = query(helperBuf, LIVE_PLAYERS);
  for (let i = 0; i < players; i++) {
    const p = entityAt(helperBuf, i);
    if (Math.hypot(x - Transform.x[p], z - Transform.z[p]) < 2.5) return false;
  }
  return true;
}

// Draws from the seeded RNG only, so the same seed gives the same spots.
export function randomClearSpot(out: { x: number; z: number }): boolean {
  const limit = Arena.half - 2;
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = randomRange(-limit, limit);
    const z = randomRange(-limit, limit);
    if (!clearSpot(x, z)) continue;
    out.x = x;
    out.z = z;
    return true;
  }
  return false;
}
