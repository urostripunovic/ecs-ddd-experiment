import { BossPhase, C, Health, RunStatus, RunView, Pressure, Slam, Slowed, Transform } from '../components';
import { buf, scriptBuf } from '../core/buffers';
import { send } from '../core/outbox';
import type { Script } from '../core/script';
import { add, entityAt, mask, MAX, NO_HANDLE, query, remove, toHandle, world, type EntityId } from '../core/world';
import { hurt } from './damage';
import { phaseOne, phaseTwo } from './boss-scripts';
import { releaseStuck } from './weapons';

// Sensor config, not a rule: the domain decides what crossing it means.
export const PHASE_TWO_AT = 0.5; // share of max hp
const SLAM_SLOW_TICKS = 60;
const SLAM_SLOW_FACTOR = 0.5;

const PHASE_SCRIPTS = [null, phaseOne, phaseTwo] as const;
const runningScript: (Script | null)[] = new Array(MAX).fill(null);

const BOSSES = mask(C.Boss, C.Health);
const GONE_OR_WAITING = mask(C.Dead, C.PhasePending);
const SLAMMERS = mask(C.Slam, C.Transform);
const LIVE_PLAYERS = mask(C.PlayerControlled, C.Transform, C.Health, C.Collider);

export function stopScript(e: EntityId): void {
  runningScript[e] = null;
}

export function resetScripts(): void {
  runningScript.fill(null);
}

// reads BossPhase, RunView, Health | writes Pressure, BossPhase.running, and via the
// phase's script: Velocity, Slam, BossAction, Jump, Airborne
export function bossPhaseSystem(): void {
  if (RunView.status !== RunStatus.Fighting) return;
  const n = query(buf, BOSSES, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    // Sampled once a second, so a burst of hits reads as pressure but chip damage doesn't.
    if (world.tick - Pressure.markedAt[e] >= 60) {
      Pressure.recentLoss[e] = Pressure.hpMark[e] - Health.hp[e];
      Pressure.hpMark[e] = Health.hp[e];
      Pressure.markedAt[e] = world.tick;
    }
    const phase = BossPhase.phase[e];
    if (phase !== BossPhase.running[e]) {
      const start = PHASE_SCRIPTS[phase] ?? null;
      runningScript[e] = start ? start(e) : null;
      BossPhase.running[e] = phase;
    }
    runningScript[e]?.next();
  }
}

// reads Slam, Transform | writes Slam, Health and Slowed of players in range; shakes loose stuck items
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
      hurt(p, Slam.dmg[e], toHandle(e));
      // The only writer of Slowed: a buff can change speed too, but through its own field.
      Slowed.until[p] = world.tick + SLAM_SLOW_TICKS;
      Slowed.factor[p] = SLAM_SLOW_FACTOR;
    }
  }
}

// reads Health, BossPhase | writes PhasePending tag, sends BossThresholdCrossed
// The latch tag stops the command repeating every tick until the domain answers.
export function bossThresholdSystem(): void {
  const n = query(buf, BOSSES, GONE_OR_WAITING);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    if (BossPhase.phase[e] !== 1 || Health.hp[e] > Health.max[e] * PHASE_TWO_AT) continue;
    add(e, C.PhasePending);
    send('BossThresholdCrossed', toHandle(e), NO_HANDLE, PHASE_TWO_AT);
  }
}
