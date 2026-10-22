// A thrown item in the air: it sticks, comes home (the chakram), smashes down
// (the warhammer), bounces (Ricochet) or lands.
import { Arena, Buffs, C, Collider, Shake, StuckIn, Team, Thrown, Transform, Velocity, Knockback } from '../../components';
import { buf, solidBuf, targetBuf } from '../../core/buffers';
import { after, ticks } from '../../core/units';
import { NOBODY, add, entityAt, handleAt, has, indexOf, isLive, query, remove, toHandle } from '../../core/world';
import type { EntityId } from '../../core/world';
import { CATCH_HASTE_TICKS, RETURN_TICKS, SMASH_RADIUS } from '../../weapons/defs';
import { hurt } from '../damage';
import { RICOCHET_DMG_MUL } from '../perks';
import { releaseStuck } from './follow';
import { CATCH_RADIUS, DROP_LOCK_TICKS, FLYING_ITEMS, SMASH_SHAKE, SOLIDS, TARGETS, THROWN_RADIUS, UNHITTABLE, defOf, equip, heldItem, putOnGround, wear } from './items';
import { pushPillar } from '../pillars';

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

// reads Thrown, Transform, Team, Collider, pillars | writes Health, Durability, item state, Shake and Orbit.kick (a smash),
// Knockback (a chakram home to full hands), Buffs (a caught
// chakram); a chakram coming home writes Velocity, Thrown.leg/lastHit; a ricochet writes Velocity,
// Transform, Thrown.dmg/ticksLeft/bounces
// A hit lodges the weapon in the target; a miss lands it, locked for a while.
export function flightSystem(): void {
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  const solids = query(solidBuf, SOLIDS, C.Dead);
  const n = query(buf, FLYING_ITEMS);
  for (let i = 0; i < n; i++) {
    const f = entityAt(buf, i);
    const style = defOf(f).throwStyle;
    if (style === 'return') { flyChakram(f, targets, solids); continue; }
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

// The chakram: out along the throw, through whatever it hits, then home. Each
// leg hits a target once. It turns at the end of its flight or on stone, and
// on the way home it flies over everything to the thrower's hand, or lands
// at their feet if their hands are full by then.
export function flyChakram(f: EntityId, targets: number, solids: number): void {
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
