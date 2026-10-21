// Every boss attack is an action, and a boss does one action at a time: the
// phase coroutine runs them in sequence through begin()/finish(), so two can
// never overlap. When the next action may start is data (CHAIN_GAPS), not
// waits scattered through the scripts.
import { BossAction, BossPace, BossPhase, BossStyle } from '../components';
import type { Script } from '../core/script';
import { ticks, type Ticks } from '../core/units';
import { world, type EntityId } from '../core/world';

export const Action = { Idle: 0, Slam: 1, Cone: 2, Burst: 3, Jump: 4, Roar: 5, Ring: 6, Spiral: 7, Storm: 8 } as const;
export type ActionKind = (typeof Action)[keyof typeof Action];
const NAMES = ['idle', 'slam', 'cone', 'burst', 'jump', 'roar', 'ring', 'spiral', 'storm'] as const;
type Name = (typeof NAMES)[number];

// Ticks from the end of one action to the start of the next, per boss style
// (BossStyleKind) and phase. Anything not listed waits that style's default
// gap, so nothing chains unless a phase says so.
export const DEFAULT_GAP = ticks(10);
type Gaps = { readonly default: Ticks; readonly phases: Record<number, Partial<Record<`${Name}->${Name}`, Ticks>>> };
export const CHAIN_GAPS: readonly Gaps[] = [
  {
    // The Warden.
    default: DEFAULT_GAP,
    phases: {
      1: {},
      // Phase 2: a shot can roll straight into loading a jump. Landing never rolls into a shot.
      2: { 'cone->jump': ticks(1), 'burst->jump': ticks(1) },
    },
  },
  {
    // The Unchained: a shorter breath between everything. Its rings and spiral
    // roll into a jump like the Warden's shots; a landing still never rolls into a shot.
    default: ticks(6),
    phases: {
      1: { 'ring->jump': ticks(1) },
      2: { 'cone->jump': ticks(1), 'ring->jump': ticks(1), 'spiral->jump': ticks(1) },
    },
  },
  {
    // The Keeper: the Warden's breath in phase 1, then the Unchained's chains,
    // then the storm rolling straight into a jump.
    default: ticks(8),
    phases: {
      1: {},
      2: { 'cone->jump': ticks(1), 'ring->jump': ticks(1), 'spiral->jump': ticks(1) },
      3: { 'cone->jump': ticks(1), 'ring->jump': ticks(1), 'storm->jump': ticks(1) },
    },
  },
];

export function chainGap(phase: number, from: ActionKind, to: ActionKind, style = 0): Ticks {
  if (from === Action.Idle) return ticks(0);
  const gaps = CHAIN_GAPS[style] ?? CHAIN_GAPS[0];
  return gaps.phases[phase]?.[`${NAMES[from]}->${NAMES[to]}`] ?? gaps.default;
}

// A deeper boss's pace shortens every gap, but a gap is never under one tick:
// that would let two actions start on the same tick.
export function paceGap(boss: EntityId, gap: Ticks): Ticks {
  const pace = BossPace.pace[boss] > 0 ? BossPace.pace[boss] : 1;
  return gap === 0 ? gap : ticks(Math.max(1, Math.round(gap / pace)));
}

// Waits out the chain gap, then marks the action as running.
export function* begin(boss: EntityId, kind: ActionKind): Script {
  const gap = paceGap(boss, chainGap(BossPhase.phase[boss], BossAction.lastKind[boss] as ActionKind, kind, BossStyle.kind[boss]));
  while (world.tick < BossAction.lastEnd[boss] + gap) yield;
  BossAction.kind[boss] = kind;
  BossAction.startedAt[boss] = world.tick;
}

export function finish(boss: EntityId): void {
  BossAction.lastKind[boss] = BossAction.kind[boss];
  BossAction.lastEnd[boss] = world.tick;
  BossAction.kind[boss] = Action.Idle;
}

// Durations the renderer also needs, to pose the boss without guessing.
export const CONE_WINDUP = ticks(14);
export const CONE_VOLLEY_GAP = ticks(12);
export const BURST_WINDUP = ticks(8);
export const JUMP_CROUCH = ticks(18);
export const JUMP_AIR = ticks(34);
export const JUMP_RECOVER = ticks(12);
export const ROAR_REAR = ticks(20);
export const ROAR_HOLD = ticks(55);
// The ring's floor telegraph shows its gaps for this long before the first wave.
export const RING_WINDUP = ticks(30);
export const RING_WAVE_GAP = ticks(26);
export const SPIRAL_WINDUP = ticks(18);
export const SPIRAL_LENGTH = ticks(120);
export const STORM_WINDUP = ticks(24);
export const STORM_LENGTH = ticks(156);
