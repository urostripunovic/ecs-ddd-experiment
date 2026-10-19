import { BossPhase, C, Health, MatchStatus, MatchView, Slam, Transform } from '../components';
import { buf, scriptBuf } from '../core/buffers';
import { send } from '../core/outbox';
import type { Script } from '../core/script';
import { add, entityAt, mask, MAX, NO_HANDLE, query, remove, toHandle, type EntityId } from '../core/world';
import { hurt } from './damage';
import { phaseOne, phaseTwo } from './boss-scripts';

// Sensor config, not a rule: the domain decides what crossing it means.
export const PHASE_TWO_AT = 0.5; // share of max hp

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

// reads BossPhase, MatchView | writes BossPhase.running, Velocity, Slam (via the phase's script)
export function bossPhaseSystem(): void {
  if (MatchView.status !== MatchStatus.Fighting) return;
  const n = query(buf, BOSSES, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    const phase = BossPhase.phase[e];
    if (phase !== BossPhase.running[e]) {
      const start = PHASE_SCRIPTS[phase] ?? null;
      runningScript[e] = start ? start(e) : null;
      BossPhase.running[e] = phase;
    }
    runningScript[e]?.next();
  }
}

// reads Slam, Transform | writes Slam, Health of players in range
export function slamSystem(): void {
  const n = query(buf, SLAMMERS, C.Dead);
  for (let i = 0; i < n; i++) {
    const e = entityAt(buf, i);
    if (Slam.timer[e] > 0) Slam.timer[e]--;
    if (Slam.timer[e] > 0) continue;

    remove(e, C.Slam);
    const players = query(scriptBuf, LIVE_PLAYERS, C.Dead);
    for (let j = 0; j < players; j++) {
      const p = entityAt(scriptBuf, j);
      const dx = Transform.x[p] - Transform.x[e];
      const dz = Transform.z[p] - Transform.z[e];
      const r = Slam.radius[e];
      if (dx * dx + dz * dz <= r * r) hurt(p, Slam.dmg[e], toHandle(e));
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
