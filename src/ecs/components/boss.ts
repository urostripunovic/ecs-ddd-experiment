// Boss components: what a boss is doing, how it fights, and the attacks it
// leaves in the world. Data only, like every component.
import { MAX_ENTITIES } from '../core/world';

// phase: which stage of the fight, written only by bossThresholdSystem.
// running: which phase's coroutine has been started, so a new phase starts its
// choreography from the beginning.
export const BossPhase = { phase: new Uint8Array(MAX_ENTITIES), running: new Uint8Array(MAX_ENTITIES) };
// timer counts down in ticks; the hit lands at x/z when it reaches 0. The
// centre is stored rather than read from the boss, so a jump can telegraph
// where it will land while the boss is still in the air.
export const Slam = {
  timer: new Uint16Array(MAX_ENTITIES), windup: new Uint16Array(MAX_ENTITIES),
  radius: new Float32Array(MAX_ENTITIES), dmg: new Float32Array(MAX_ENTITIES),
  x: new Float32Array(MAX_ENTITIES), z: new Float32Array(MAX_ENTITIES),
  // Ticks the hit slows whoever it lands on; 0 = no slow.
  slowFor: new Uint16Array(MAX_ENTITIES),
};
// The one action a boss is doing (see begin() and finish()). last* is what
// it did before, so the chain-gap table can decide when the next may start.
// windup: the current action's telegraph in ticks, written by its script, so
// the renderer times a generated boss's telegraphs as the script does.
export const BossAction = {
  kind: new Uint8Array(MAX_ENTITIES), startedAt: new Uint32Array(MAX_ENTITIES),
  lastKind: new Uint8Array(MAX_ENTITIES), lastEnd: new Uint32Array(MAX_ENTITIES), windup: new Uint16Array(MAX_ENTITIES),
};
// A procedural boss (Stage C): the kit its moves are generated from, its depth
// and body, and how many phases its plan has. Written once, at spawn; the
// phase scripts regenerate the plan from these (planFor), so a load needs nothing else.
export const BossGen = {
  kit: new Uint32Array(MAX_ENTITIES), depth: new Uint8Array(MAX_ENTITIES), body: new Uint8Array(MAX_ENTITIES),
  phases: new Uint8Array(MAX_ENTITIES),
};
// A boss's line attack: the Lancer's charge or the Sentinel's beam sweep.
// angle in radians (the beam's, as it turns); arc: how far a sweep turns,
// signed by its direction, 0 for a charge; state: LineState. The script writes
// these; hazardSystem writes only reach, how far the beam gets before stone.
export const Line = {
  angle: new Float32Array(MAX_ENTITIES), length: new Float32Array(MAX_ENTITIES), width: new Float32Array(MAX_ENTITIES),
  arc: new Float32Array(MAX_ENTITIES), dmg: new Float32Array(MAX_ENTITIES), state: new Uint8Array(MAX_ENTITIES),
  reach: new Float32Array(MAX_ENTITIES),
};
export const LineState = { Idle: 0, Telegraph: 1, Live: 2, Stunned: 3 } as const;
// The first tick a charge or beam may hit this player again: once per pass.
export const LineHit = { readyAt: new Uint32Array(MAX_ENTITIES) };
// Radians a second a homing orb may turn toward the player.
export const Homing = { turn: new Float32Array(MAX_ENTITIES) };
// Ticks of the current jump, for the renderer's arc. fromHeight is non-zero
// when it leaves from up high, like the Warden dropping off its perch.
export const Jump = { airStart: new Uint32Array(MAX_ENTITIES), landAt: new Uint32Array(MAX_ENTITIES), fromHeight: new Float32Array(MAX_ENTITIES) };
// How much hp the boss lost over the last second, and when it may evade again.
export const Pressure = {
  hpMark: new Float32Array(MAX_ENTITIES), markedAt: new Uint32Array(MAX_ENTITIES),
  recentLoss: new Float32Array(MAX_ENTITIES), evadeReadyAt: new Uint32Array(MAX_ENTITIES),
};


// Which script set a boss runs: 0 is the Warden, 1 the Unchained (see BossDef.style).
export const BossStyle = { kind: new Uint8Array(MAX_ENTITIES) };
// BossDef.pace, scaled by depth: higher waits less between attacks.
export const BossPace = { pace: new Float32Array(MAX_ENTITIES) };
// Where the next ring's gaps are, in radians around the boss, so the floor
// telegraph and the bullets can never disagree. Written by the ring script only.
// gaps and arms: how many, for generated rings and spirals.
export const Pattern = {
  gapAt: new Float32Array(MAX_ENTITIES), gapHalf: new Float32Array(MAX_ENTITIES),
  gaps: new Uint8Array(MAX_ENTITIES), arms: new Uint8Array(MAX_ENTITIES),
};

// Staggered until a tick: stops and starts nothing new (a pillar you pushed
// into it, decided with the user). Telegraphs already shown still land.
export const Stagger = { until: new Uint32Array(MAX_ENTITIES) };
