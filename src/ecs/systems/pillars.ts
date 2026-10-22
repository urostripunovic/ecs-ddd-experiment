// Moving cover and its phase 2 hazard. Pillars are pure simulation: nothing
// outside the fight reacts to where they are or whether their spikes are out.
import { Arena, BossPhase, C, Collider, Knockback, Orbit, RunStatus, RunView, SpikeHit, Spikes, Stagger, Transform } from '../components';
import { buf, helperBuf, itemBuf } from '../core/buffers';
import { after, hp, inTicks, meters, seconds, ticks, type Seconds } from '../core/units';
import { add, entityAt, has, mask, query, remove, toHandle, world, type EntityId } from '../core/world';
import { controlsLocked } from './cutscene';
import { hurt } from './damage';

const ORBITING = mask(C.Transform, C.Orbiting);
const SPIKED = mask(C.Transform, C.Collider, C.Spiked);
const LIVE_BOSSES = mask(C.Boss, C.Health);
const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health, C.Collider);
const GROUNDED_ITEMS = mask(C.Item, C.Grounded, C.Transform);
const BOSS_BODIES = mask(C.Boss, C.Transform, C.Collider);

// A push sends a pillar this fast along its circle, in m/s, fading to nothing
// over PUSH_TICKS. Experimental numbers, decided with the user as a mechanic.
const PUSH_SPEED = 8;
const PUSH_TICKS = ticks(36);
// A pillar moving at least this fast from a push hurts and staggers the boss it hits.
const PUSHED_HITS_FROM = 2;
export const PILLAR_HIT_DMG = hp(80);
export const STAGGER_TICKS = inTicks(seconds(1.2));

// While spiked, a pillar goes round this many times faster.
export const SPIKED_SPEED = 1.6;
export const SPIKE_DMG = hp(15);
// How close to the surface still counts as touching the spikes: push-out keeps
// you exactly at the surface, so contact is a band, not an overlap.
const SPIKE_REACH = meters(0.35);
export const SPIKE_COOLDOWN = inTicks(seconds(0.6));
// m/s; there's no speed brand yet, like the bullet and boss speeds.
const SPIKE_SHOVE_SPEED = 10;
const SPIKE_SHOVE = ticks(10);

// reads Orbit, Spiked, Cutscene, grounded items, bosses | writes Orbit.angle, Orbit.kickUntil, Transform of
// orbiting pillars and of grounded items in their way; a pushed pillar hitting a boss writes Health (via hurt), Stagger
// Frozen during cutscenes, so nothing sweeps into you while your controls are locked.
export function orbitSystem(dt: Seconds): void {
  if (controlsLocked()) return;
  const n = query(buf, ORBITING);
  for (let i = 0; i < n; i++) {
    const pillar = entityAt(buf, i);
    const kick = kickNow(pillar);
    const speed = Orbit.speed[pillar] * (has(pillar, C.Spiked) ? SPIKED_SPEED : 1) + kick;
    Orbit.angle[pillar] += speed * dt;
    Transform.x[pillar] = Orbit.cx[pillar] + Math.cos(Orbit.angle[pillar]) * Orbit.radius[pillar];
    Transform.z[pillar] = Orbit.cz[pillar] + Math.sin(Orbit.angle[pillar]) * Orbit.radius[pillar];
    shoveItems(pillar);
    if (Math.abs(kick) * Orbit.radius[pillar] >= PUSHED_HITS_FROM) ramBoss(pillar);
  }
}

// What's left of a push this tick, fading linearly to nothing.
function kickNow(pillar: EntityId): number {
  if (world.tick >= Orbit.kickUntil[pillar]) return 0;
  return Orbit.kick[pillar] * ((Orbit.kickUntil[pillar] - world.tick) / PUSH_TICKS);
}

// Decided with the user: a pillar shoves weapons on the ground out of its way,
// like it does the player, so it never covers one.
function shoveItems(pillar: EntityId): void {
  const reach = Collider.radius[pillar];
  const limit = Arena.half - 0.6;
  const n = query(itemBuf, GROUNDED_ITEMS);
  for (let i = 0; i < n; i++) {
    const item = entityAt(itemBuf, i);
    const dx = Transform.x[item] - Transform.x[pillar];
    const dz = Transform.z[item] - Transform.z[pillar];
    const d = Math.hypot(dx, dz);
    if (d >= reach) continue;
    // Straight out from the centre; dead centre goes out along the pillar's own way round.
    const ux = d > 1e-6 ? dx / d : -Math.sin(Orbit.angle[pillar]);
    const uz = d > 1e-6 ? dz / d : Math.cos(Orbit.angle[pillar]);
    Transform.x[item] = Math.max(-limit, Math.min(limit, Transform.x[pillar] + ux * reach));
    Transform.z[item] = Math.max(-limit, Math.min(limit, Transform.z[pillar] + uz * reach));
  }
}

// A pushed pillar running into a boss: one hit and a stagger, and the push is spent.
function ramBoss(pillar: EntityId): void {
  const n = query(helperBuf, BOSS_BODIES, mask(C.Dead, C.Airborne));
  for (let i = 0; i < n; i++) {
    const boss = entityAt(helperBuf, i);
    const reach = Collider.radius[pillar] + Collider.radius[boss];
    const dx = Transform.x[boss] - Transform.x[pillar];
    const dz = Transform.z[boss] - Transform.z[pillar];
    if (dx * dx + dz * dz > reach * reach) continue;
    hurt(boss, PILLAR_HIT_DMG, toHandle(pillar));
    Stagger.until[boss] = after(STAGGER_TICKS);
    Orbit.kickUntil[pillar] = world.tick;
    return;
  }
}

// Decided with the user: a hammer's smash or a railgun's beam knocks an
// orbiting pillar along its circle, by the part of the push that lies along
// it. Fixed pillars are too heavy to move. dx, dz: the push's direction, unit length.
export function pushPillar(pillar: EntityId, dx: number, dz: number): void {
  if (!has(pillar, C.Orbiting)) return;
  const along = -Math.sin(Orbit.angle[pillar]) * dx + Math.cos(Orbit.angle[pillar]) * dz;
  Orbit.kick[pillar] = (along * PUSH_SPEED) / Orbit.radius[pillar];
  Orbit.kickUntil[pillar] = after(PUSH_TICKS);
}

// reads BossPhase, Dead, RunView | writes Spiked tag, Spikes.since
// Out from phase 2 on: a boss with a third phase keeps them out.
// Derived from the boss every tick rather than set by the roar, so a world built
// straight into phase 2 (a load, a dev jump) has its spikes out too.
export function spikeGrowthSystem(): void {
  let out = false;
  if (RunView.status === RunStatus.Fighting) {
    const bosses = query(helperBuf, LIVE_BOSSES, C.Dead);
    for (let i = 0; i < bosses && !out; i++) out = BossPhase.phase[entityAt(helperBuf, i)] >= 2;
  }
  const n = query(buf, ORBITING);
  for (let i = 0; i < n; i++) {
    const pillar = entityAt(buf, i);
    if (out && !has(pillar, C.Spiked)) {
      add(pillar, C.Spiked);
      Spikes.since[pillar] = world.tick;
    } else if (!out && has(pillar, C.Spiked)) {
      remove(pillar, C.Spiked);
    }
  }
}

// reads Spiked, Transform, Collider, SpikeHit, Cutscene | writes Health (via hurt), SpikeHit, Knockback
export function spikeSystem(): void {
  if (controlsLocked()) return;
  const pillars = query(buf, SPIKED);
  if (pillars === 0) return;
  const players = query(helperBuf, LIVE_PLAYERS, C.Dead);
  for (let j = 0; j < players; j++) {
    const player = entityAt(helperBuf, j);
    if (world.tick < SpikeHit.readyAt[player]) continue;
    for (let i = 0; i < pillars; i++) {
      const pillar = entityAt(buf, i);
      const dx = Transform.x[player] - Transform.x[pillar];
      const dz = Transform.z[player] - Transform.z[pillar];
      const d = Math.hypot(dx, dz);
      if (d > Collider.radius[pillar] + Collider.radius[player] + SPIKE_REACH) continue;
      // A dodge or a clear shrugs it off; only a hit that lands starts the cooldown.
      if (!hurt(player, SPIKE_DMG, toHandle(pillar))) break;
      SpikeHit.readyAt[player] = after(SPIKE_COOLDOWN);
      // Knockback is also written by the roar's shove: the latest shove wins, which
      // is what a second shove should do, so it stays one field.
      Knockback.x[player] = (d === 0 ? 0 : dx / d) * SPIKE_SHOVE_SPEED;
      Knockback.z[player] = (d === 0 ? 1 : dz / d) * SPIKE_SHOVE_SPEED;
      Knockback.until[player] = after(SPIKE_SHOVE);
      break;
    }
  }
}
