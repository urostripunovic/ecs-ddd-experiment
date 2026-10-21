// Moving cover and its phase 2 hazard. Pillars are pure simulation: nothing
// outside the fight reacts to where they are or whether their spikes are out.
import { BossPhase, C, Collider, Knockback, Orbit, RunStatus, RunView, SpikeHit, Spikes, Transform } from '../components';
import { buf, helperBuf } from '../core/buffers';
import { after, hp, inTicks, meters, seconds, ticks, type Seconds } from '../core/units';
import { add, entityAt, has, mask, query, remove, toHandle, world } from '../core/world';
import { controlsLocked } from './cutscene';
import { hurt } from './damage';

const ORBITING = mask(C.Transform, C.Orbiting);
const SPIKED = mask(C.Transform, C.Collider, C.Spiked);
const LIVE_BOSSES = mask(C.Boss, C.Health);
const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health, C.Collider);

// While spiked, a pillar goes round this many times faster.
export const SPIKED_SPEED = 1.6;
export const SPIKE_DMG = hp(15);
// How close to the surface still counts as touching the spikes: push-out keeps
// you exactly at the surface, so contact is a band, not an overlap.
const SPIKE_REACH = meters(0.35);
export const SPIKE_COOLDOWN = inTicks(seconds(0.6));
// m/s; units.ts has no speed brand yet, like the bullet and boss speeds.
const SPIKE_SHOVE_SPEED = 10;
const SPIKE_SHOVE = ticks(10);

// reads Orbit, Spiked, Cutscene | writes Orbit.angle, Transform of orbiting pillars
// Frozen during cutscenes, so nothing sweeps into you while your controls are locked.
export function orbitSystem(dt: Seconds): void {
  if (controlsLocked()) return;
  const n = query(buf, ORBITING);
  for (let i = 0; i < n; i++) {
    const pillar = entityAt(buf, i);
    const speed = Orbit.speed[pillar] * (has(pillar, C.Spiked) ? SPIKED_SPEED : 1);
    Orbit.angle[pillar] += speed * dt;
    Transform.x[pillar] = Orbit.cx[pillar] + Math.cos(Orbit.angle[pillar]) * Orbit.radius[pillar];
    Transform.z[pillar] = Orbit.cz[pillar] + Math.sin(Orbit.angle[pillar]) * Orbit.radius[pillar];
  }
}

// reads BossPhase, Dead, RunView | writes Spiked tag, Spikes.since
// Derived from the boss every tick rather than set by the roar, so a world built
// straight into phase 2 (a load, a dev jump) has its spikes out too.
export function spikeGrowthSystem(): void {
  let out = false;
  if (RunView.status === RunStatus.Fighting) {
    const bosses = query(helperBuf, LIVE_BOSSES, C.Dead);
    for (let i = 0; i < bosses && !out; i++) out = BossPhase.phase[entityAt(helperBuf, i)] === 2;
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
