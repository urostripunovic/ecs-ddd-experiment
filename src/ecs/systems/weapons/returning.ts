// A thrown weapon that comes back (the chakram): out along the throw, through
// whatever it hits, then home to the thrower's hand. Chosen by the Returning
// tag, which a throw puts on a weapon whose definition says it returns.
import { Arena, Buffs, C, Collider, Knockback, Team, Thrown, Transform, Velocity } from '../../components';
import { buf, solidBuf, targetBuf } from '../../core/buffers';
import { after, ticks } from '../../core/units';
import { NOBODY, entityAt, handleAt, has, indexOf, isLive, mask, query, toHandle, type EntityId } from '../../core/world';
import { CATCH_HASTE_TICKS, RETURN_TICKS } from '../../weapons/defs';
import { hurt } from '../damage';
import { CATCH_RADIUS, DROP_LOCK_TICKS, SOLIDS, TARGETS, THROWN_RADIUS, UNHITTABLE, defOf, equip, heldItem, putOnGround, wear } from './items';

const RETURNING = mask(C.Item, C.Flying, C.Returning, C.Transform);

// The chakram: out along the throw, through whatever it hits, then home. Each
// leg hits a target once. It turns at the end of its flight or on stone, and
// on the way home it flies over everything to the thrower's hand, or lands
// at their feet if their hands are full by then.
// reads Thrown, Transform, Team, Collider, pillars, the thrower | writes Thrown.leg/lastHit/ticksLeft, Velocity, Health
// (via hurt), Durability; caught, Buffs (haste); home to full hands, Knockback
export function returnSystem(): void {
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  const solids = query(solidBuf, SOLIDS, C.Dead);
  const n = query(buf, RETURNING);
  for (let i = 0; i < n; i++) fly(entityAt(buf, i), targets, solids);
}

function fly(f: EntityId, targets: number, solids: number): void {
  const x = Transform.x[f];
  const z = Transform.z[f];
  for (let j = 0; j < targets; j++) {
    const t = entityAt(targetBuf, j);
    if (Team.id[t] === Team.id[f] || Thrown.lastHit[f] === toHandle(t)) continue;
    const r = Collider.radius[t] + THROWN_RADIUS;
    const dx = Transform.x[t] - x;
    const dz = Transform.z[t] - z;
    if (dx * dx + dz * dz > r * r) continue;
    hurt(t, Thrown.dmg[f], handleAt(Thrown.by, f));
    wear(f, defOf(f).throwWear * Thrown.wearMul[f]);
    Thrown.lastHit[f] = toHandle(t);
  }
  if (Thrown.ticksLeft[f] > 0) Thrown.ticksLeft[f]--;

  if (Thrown.leg[f] === 0) {
    let turn = Thrown.ticksLeft[f] === 0;
    for (let j = 0; j < solids && !turn; j++) {
      const s = entityAt(solidBuf, j);
      if (has(s, C.Health)) continue;
      const r = Collider.radius[s] + 0.2;
      const dx = x - Transform.x[s];
      const dz = z - Transform.z[s];
      if (dx * dx + dz * dz <= r * r) turn = true;
    }
    const edge = Arena.half - 0.3;
    if (Math.abs(x) > edge || Math.abs(z) > edge) turn = true;
    if (!turn) return;
    Thrown.leg[f] = 1;
    Thrown.lastHit[f] = NOBODY;
    Thrown.ticksLeft[f] = RETURN_TICKS;
  }

  const thrower = handleAt(Thrown.by, f);
  if (!isLive(thrower) || has(indexOf(thrower), C.Dead) || Thrown.ticksLeft[f] === 0) {
    putOnGround(f, x, z, defOf(f).throwLockTicks);
    return;
  }
  const w = indexOf(thrower);
  const dx = Transform.x[w] - x;
  const dz = Transform.z[w] - z;
  const d = Math.hypot(dx, dz);
  if (d <= CATCH_RADIUS) {
    if (heldItem(w) !== -1) { hitHome(f, w); return; }
    Thrown.lastHit[f] = NOBODY;
    equip(w, f);
    // Haste has two writers, pickups and this; each only pushes the deadline
    // later, so neither can cut the other short.
    Buffs.hasteUntil[w] = Math.max(Buffs.hasteUntil[w], after(CATCH_HASTE_TICKS));
    return;
  }
  const speed = defOf(f).throwSpeed;
  Velocity.x[f] = (dx / d) * speed;
  Velocity.z[f] = (dz / d) * speed;
}

// Decided with the user: come home to full hands and it hits you instead of
// your hand. It shoves you along its flight and drops where it hit you.
function hitHome(chakram: EntityId, wielder: EntityId): void {
  const speed = Math.hypot(Velocity.x[chakram], Velocity.z[chakram]) || 1;
  Knockback.x[wielder] = (Velocity.x[chakram] / speed) * CHAKRAM_SHOVE_SPEED;
  Knockback.z[wielder] = (Velocity.z[chakram] / speed) * CHAKRAM_SHOVE_SPEED;
  Knockback.until[wielder] = after(CHAKRAM_SHOVE_TICKS);
  putOnGround(chakram, Transform.x[wielder], Transform.z[wielder], DROP_LOCK_TICKS);
}

// m/s and how long: a stumble, not a launch.
const CHAKRAM_SHOVE_SPEED = 7;
const CHAKRAM_SHOVE_TICKS = ticks(12);
