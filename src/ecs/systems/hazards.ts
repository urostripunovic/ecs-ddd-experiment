// What a procedural boss's line attacks and orbs do once they're out: the
// charge's body and the sweep's beam hurting whoever they reach, and orbs
// turning after the player. The scripts that start them are in boss-scripts.ts.
import { Arena, BossAction, C, Collider, Homing, Knockback, Line, LineHit, LineState, Transform, Velocity } from '../components';
import { buf, helperBuf, scriptBuf } from '../core/buffers';
import { after, inSeconds, ticks } from '../core/units';
import { entityAt, has, mask, query, toHandle, world, type EntityId } from '../core/world';
import { Action } from './boss-actions';
import { hurt } from './damage';
import { rayToCircle } from './specials';

const BOSSES = mask(C.Boss, C.Transform);
const PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health, C.Collider);
const PILLARS = mask(C.Transform, C.Collider, C.Solid);
const ORBS = mask(C.Homing, C.Projectile, C.Transform, C.Velocity);
// Long enough that one pass of a charge or a beam is one hit, never a hit a tick.
const LINE_HIT_LOCKOUT = ticks(40);
const CHARGE_SHOVE = 10;
const CHARGE_SHOVE_TICKS = ticks(12);
const DT = inSeconds(ticks(1));

// reads BossAction, Line, Transform, Collider, pillars | writes Line.reach, Health (via hurt), LineHit, Knockback
export function hazardSystem(): void {
  const bosses = query(buf, BOSSES, C.Dead);
  for (let i = 0; i < bosses; i++) {
    const boss = entityAt(buf, i);
    if (Line.state[boss] !== LineState.Live) continue;
    const kind = BossAction.kind[boss];
    if (kind === Action.Sweep) beam(boss);
    else if (kind === Action.Charge) ram(boss);
  }
}

// The beam runs from the boss to the first pillar or the wall: cover blocks it.
function beam(boss: EntityId): void {
  const x = Transform.x[boss];
  const z = Transform.z[boss];
  const dx = Math.cos(Line.angle[boss]);
  const dz = Math.sin(Line.angle[boss]);
  let reach = Arena.half * 3;
  const pillars = query(helperBuf, PILLARS, C.Dead);
  for (let j = 0; j < pillars; j++) {
    const s = entityAt(helperBuf, j);
    if (s === boss || has(s, C.Health)) continue;
    reach = Math.min(reach, rayToCircle(x, z, dx, dz, Transform.x[s], Transform.z[s], Collider.radius[s]));
  }
  Line.reach[boss] = reach;
  const players = query(scriptBuf, PLAYERS, C.Dead);
  for (let j = 0; j < players; j++) {
    const p = entityAt(scriptBuf, j);
    if (world.tick < LineHit.readyAt[p]) continue;
    const px = Transform.x[p] - x;
    const pz = Transform.z[p] - z;
    const along = px * dx + pz * dz;
    if (along < 0 || along > reach) continue;
    const across = Math.abs(px * dz - pz * dx);
    if (across > Line.width[boss] / 2 + Collider.radius[p]) continue;
    if (hurt(p, Line.dmg[boss], toHandle(boss))) LineHit.readyAt[p] = after(LINE_HIT_LOCKOUT);
  }
}

// A charging boss hurts and shoves whoever it runs into, once a charge.
function ram(boss: EntityId): void {
  const players = query(scriptBuf, PLAYERS, C.Dead);
  for (let j = 0; j < players; j++) {
    const p = entityAt(scriptBuf, j);
    if (world.tick < LineHit.readyAt[p]) continue;
    const dx = Transform.x[p] - Transform.x[boss];
    const dz = Transform.z[p] - Transform.z[boss];
    const reach = Collider.radius[boss] + Collider.radius[p] + 0.15;
    if (dx * dx + dz * dz > reach * reach) continue;
    if (!hurt(p, Line.dmg[boss], toHandle(boss))) continue;
    LineHit.readyAt[p] = after(LINE_HIT_LOCKOUT);
    // Thrown aside, across the charge, so it doesn't carry you along.
    const side = dx * Math.sin(Line.angle[boss]) - dz * Math.cos(Line.angle[boss]) >= 0 ? 1 : -1;
    Knockback.x[p] = Math.sin(Line.angle[boss]) * CHARGE_SHOVE * side;
    Knockback.z[p] = -Math.cos(Line.angle[boss]) * CHARGE_SHOVE * side;
    Knockback.until[p] = after(CHARGE_SHOVE_TICKS);
  }
}

// reads Homing, Velocity, Transform, players | writes Velocity of orbs
// An orb turns toward the nearest player, no faster than its turn rate, and
// keeps its speed, so it can always be outrun.
export function homingSystem(): void {
  const players = query(scriptBuf, PLAYERS, C.Dead);
  if (players === 0) return;
  const n = query(buf, ORBS);
  for (let i = 0; i < n; i++) {
    const orb = entityAt(buf, i);
    let target: EntityId | -1 = -1;
    let best = Infinity;
    for (let j = 0; j < players; j++) {
      const p = entityAt(scriptBuf, j);
      const d = Math.hypot(Transform.x[p] - Transform.x[orb], Transform.z[p] - Transform.z[orb]);
      if (d < best) { best = d; target = p; }
    }
    if (target === -1) continue;
    const speed = Math.hypot(Velocity.x[orb], Velocity.z[orb]);
    const heading = Math.atan2(Velocity.z[orb], Velocity.x[orb]);
    const want = Math.atan2(Transform.z[target] - Transform.z[orb], Transform.x[target] - Transform.x[orb]);
    const off = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
    const most = Homing.turn[orb] * DT;
    const turned = heading + Math.max(-most, Math.min(most, off));
    Velocity.x[orb] = Math.cos(turned) * speed;
    Velocity.z[orb] = Math.sin(turned) * speed;
  }
}
