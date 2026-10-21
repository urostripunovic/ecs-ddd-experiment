import { BossPhase, BossStyle, C, GodMode, Health, RunStatus, RunView, Pressure, Slam, Slowed, Transform, Velocity } from '../components';
import { buf, scriptBuf } from '../core/buffers';
import type { Script } from '../core/script';
import { after, inTicks, seconds, share, shareOf, ticks } from '../core/units';
import { entityAt, mask, MAX_ENTITIES, query, remove, toHandle, world, type EntityId } from '../core/world';
import { hurt } from './damage';
import { phaseOne, phaseTwo, unchainedOne, unchainedTwo } from './boss-scripts';
import { releaseStuck } from './weapons';

export const PHASE_TWO_AT = share(0.5);
// Damage is sampled over this window, so a burst of hits reads as pressure but chip damage doesn't.
const PRESSURE_WINDOW = inTicks(seconds(1));
const SLAM_SLOW_FACTOR = 0.5;

// Indexed by BossStyleKind, then phase.
const PHASE_SCRIPTS = [
  [null, phaseOne, phaseTwo],
  [null, unchainedOne, unchainedTwo],
] as const;
const runningScript: (Script | null)[] = new Array(MAX_ENTITIES).fill(null);

const BOSSES = mask(C.Boss, C.Health);
const SLAMMERS = mask(C.Slam, C.Transform);
const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health, C.Collider);

export function stopScript(entity: EntityId): void {
  runningScript[entity] = null;
}

export function resetScripts(): void {
  runningScript.fill(null);
}

// reads BossPhase, RunView, Health, GodMode | writes Pressure, BossPhase.running, and via the
// phase's script: Velocity, Slam, BossAction, Jump, Airborne
export function bossPhaseSystem(): void {
  if (RunView.status !== RunStatus.Fighting) return;
  const n = query(buf, BOSSES, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    // Frozen by the dev menu: stands still and starts nothing new.
    if (import.meta.env.DEV && GodMode.freezeBoss) { Velocity.x[e] = Velocity.z[e] = 0; continue; }
    if (world.tick - Pressure.markedAt[e] >= PRESSURE_WINDOW) {
      Pressure.recentLoss[e] = Pressure.hpMark[e] - Health.hp[e];
      Pressure.hpMark[e] = Health.hp[e];
      Pressure.markedAt[e] = world.tick;
    }
    const phase = BossPhase.phase[e];
    if (phase !== BossPhase.running[e]) {
      const start = PHASE_SCRIPTS[BossStyle.kind[e]]?.[phase] ?? null;
      runningScript[e] = start ? start(e) : null;
      BossPhase.running[e] = phase;
    }
    runningScript[e]?.next();
  }
}

// reads Slam, Transform | writes Slam, Health and (if the slam slows) Slowed of players in range; shakes loose stuck items
export function slamSystem(): void {
  const n = query(buf, SLAMMERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    if (Slam.timer[e] > 0) Slam.timer[e]--;
    if (Slam.timer[e] > 0) continue;

    remove(e, C.Slam);
    // The impact knocks out whatever is lodged in the boss, which is how you get a thrown weapon back.
    releaseStuck(e);
    const players = query(scriptBuf, LIVE_PLAYERS, C.Dead);
    for (let j = 0; j < players; j++) {
      const p = entityAt(scriptBuf, j);
      const dx = Transform.x[p] - Slam.x[e];
      const dz = Transform.z[p] - Slam.z[e];
      const r = Slam.radius[e];
      if (dx * dx + dz * dz > r * r) continue;
      if (!hurt(p, Slam.dmg[e], toHandle(e)) || Slam.slowFor[e] === 0) continue;
      // The only writer of Slowed: a buff can change speed too, but through its own field.
      Slowed.until[p] = after(ticks(Slam.slowFor[e]));
      Slowed.factor[p] = SLAM_SLOW_FACTOR;
    }
  }
}

// reads Health, BossPhase | writes BossPhase.phase
// The only writer of the phase. Phase 1 only moves forward, so healing never
// takes a boss back. Nothing outside the fight reacts to the phase, so the
// rules never hear of it.
export function bossThresholdSystem(): void {
  const n = query(buf, BOSSES, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    if (BossPhase.phase[e] === 1 && shareOf(Health.hp[e], Health.max[e]) <= PHASE_TWO_AT) BossPhase.phase[e] = 2;
  }
}
