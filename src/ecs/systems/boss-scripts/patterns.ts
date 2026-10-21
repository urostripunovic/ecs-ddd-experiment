// Bullet patterns: the gap ring, the spiral, and the two fused into one action
// (the Keeper's storm, a procedural boss's combo). Hand-made and generated
// patterns are the same data, so each runs through one script.
import type { RingDef, SpiralDef } from '../../bosses/generate';
import { Pattern } from '../../components';
import { waitTicks } from '../../core/script';
import type { Script } from '../../core/script';
import { ticks } from '../../core/units';
import type { Ticks } from '../../core/units';
import type { EntityId } from '../../core/world';
import { Action, RING_WAVE_GAP, RING_WINDUP, SPIRAL_LENGTH, SPIRAL_WINDUP, STORM_LENGTH, STORM_WINDUP, begin, finish } from '../boss-actions';
import { shoot, stop } from './moves';

// The gap ring: a dense ring of bullets with RING_GAPS evenly spaced gaps. The
// floor shows the next wave's gaps (Pattern), and each wave turns them by RING_TURN.
// A wave is still flying when the next one fires, so the turn is small enough that
// every wave in the air at once shares a safe spot: you drift with the gaps
// instead of outrunning them.
export const RING_BULLETS = 48;

export const RING_GAPS = 3;

export const RING_GAP_HALF = 0.27;

export const RING_TURN = 0.14;

export const RING_SPEED = 9;

// The hand-made bosses' ring, spiral and storm, as the same data a generated
// boss's are made of, so both run through one script each.
export const RING: RingDef = {
  waves: 3, gaps: RING_GAPS, gapHalf: RING_GAP_HALF, turn: RING_TURN, speed: RING_SPEED,
  waveGap: RING_WAVE_GAP, windup: RING_WINDUP, bullets: RING_BULLETS,
};

export function inGap(angle: number, gapAt: number, half: number, gaps: number): boolean {
  for (let k = 0; k < gaps; k++) {
    const gap = gapAt + (k * 2 * Math.PI) / gaps;
    if (Math.abs(Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap))) < half) return true;
  }
  return false;
}

export function ringWave(boss: EntityId, gapAt: number, def: RingDef): void {
  for (let i = 0; i < def.bullets; i++) {
    const a = gapAt + (i / def.bullets) * Math.PI * 2;
    if (!inGap(a, gapAt, def.gapHalf, def.gaps)) shoot(boss, a, def.speed);
  }
}

// Shows a ring's gaps on the floor: written before the wave, from the same number.
export function showGaps(boss: EntityId, gapAt: number, def: RingDef): void {
  Pattern.gapAt[boss] = gapAt;
  Pattern.gapHalf[boss] = def.gapHalf;
  Pattern.gaps[boss] = def.gaps;
}

export function* ring(boss: EntityId, waves: number, gapAt: number, dir: 1 | -1): Script {
  yield* ringOf(boss, waves === RING.waves ? RING : { ...RING, waves }, gapAt, dir);
}

export function* ringOf(boss: EntityId, def: RingDef, gapAt: number, dir: 1 | -1): Script {
  yield* begin(boss, Action.Ring, def.windup);
  stop(boss);
  showGaps(boss, gapAt, def);
  yield* waitTicks(def.windup);
  for (let w = 0; w < def.waves; w++) {
    ringWave(boss, Pattern.gapAt[boss], def);
    if (w === def.waves - 1) break;
    // Shown at once, so the telegraph always says where the next wave's gaps are.
    Pattern.gapAt[boss] += def.turn * dir;
    yield* waitTicks(def.waveGap);
  }
  finish(boss);
}

// Three arms turning slowly: the lanes between them are safe if you walk round
// with them, and an arm is thin enough to dodge through.
export const SPIRAL_ARMS = 3;

export const SPIRAL: SpiralDef = {
  arms: SPIRAL_ARMS, step: 0.06, every: ticks(4), speed: 10, length: SPIRAL_LENGTH, windup: SPIRAL_WINDUP,
};

export function* spiral(boss: EntityId, startAt: number, dir: 1 | -1): Script {
  yield* spiralOf(boss, SPIRAL, startAt, dir);
}

export function* spiralOf(boss: EntityId, def: SpiralDef, startAt: number, dir: 1 | -1): Script {
  yield* begin(boss, Action.Spiral, def.windup);
  stop(boss);
  Pattern.gapAt[boss] = startAt;
  Pattern.gapHalf[boss] = 0;
  Pattern.arms[boss] = def.arms;
  yield* waitTicks(def.windup);
  let at = startAt;
  for (let t = 0; t < def.length; t += def.every) {
    for (let arm = 0; arm < def.arms; arm++) shoot(boss, at + (arm * 2 * Math.PI) / def.arms, def.speed);
    at += def.step * dir;
    Pattern.gapAt[boss] = at;
    yield* waitTicks(def.every);
  }
  finish(boss);
}

// The storm, the final exam's one new attack: two spiral arms turning while gap
// rings go out through them. One action, so "one attack at a time" still holds;
// the floor shows each ring's gaps, and an arm crossing a gap is dodged through.
// A generated boss's combo is the same action with its own ring and arms.
export const STORM_SPIRAL: SpiralDef = { ...SPIRAL, arms: 2, windup: STORM_WINDUP };

export function* storm(boss: EntityId, gapAt: number, dir: 1 | -1): Script {
  yield* fused(boss, Action.Storm, RING, STORM_SPIRAL, STORM_LENGTH, gapAt, dir);
}

export function* fused(
  boss: EntityId, kind: typeof Action.Storm | typeof Action.Combo, ringDef: RingDef, spiralDef: SpiralDef, length: Ticks,
  gapAt: number, dir: 1 | -1,
): Script {
  const windup = ticks(Math.min(ringDef.windup, spiralDef.windup));
  yield* begin(boss, kind, windup);
  stop(boss);
  showGaps(boss, gapAt, ringDef);
  yield* waitTicks(ticks(windup));
  let arm = gapAt + Math.PI / 2;
  let sinceRing: number = ringDef.waveGap;
  for (let t = 0; t < length; t += spiralDef.every) {
    for (let k = 0; k < spiralDef.arms; k++) shoot(boss, arm + (k * 2 * Math.PI) / spiralDef.arms, spiralDef.speed);
    arm += spiralDef.step * dir;
    sinceRing += spiralDef.every;
    if (sinceRing >= ringDef.waveGap) {
      ringWave(boss, Pattern.gapAt[boss], ringDef);
      Pattern.gapAt[boss] += ringDef.turn * dir;
      sinceRing = 0;
    }
    yield* waitTicks(spiralDef.every);
  }
  finish(boss);
}
