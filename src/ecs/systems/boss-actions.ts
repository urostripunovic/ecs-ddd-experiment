// Every boss attack is an action, and a boss does one action at a time: the
// phase coroutine runs them in sequence through begin()/finish(), so two can
// never overlap. When the next action may start is data (CHAIN_GAPS), not
// waits scattered through the scripts.
import { BossAction, BossPhase } from '../components';
import type { Script } from '../core/script';
import { world, type EntityId } from '../core/world';

export const Action = { Idle: 0, Slam: 1, Cone: 2, Burst: 3, Jump: 4, Roar: 5 } as const;
export type ActionKind = (typeof Action)[keyof typeof Action];
const NAMES = ['idle', 'slam', 'cone', 'burst', 'jump', 'roar'] as const;
type Name = (typeof NAMES)[number];

// Ticks from the end of one action to the start of the next. Anything not
// listed waits DEFAULT_GAP, so nothing chains unless a phase says so.
export const DEFAULT_GAP = 10;
export const CHAIN_GAPS: Record<number, Partial<Record<`${Name}->${Name}`, number>>> = {
  1: {},
  // Phase 2: a shot can roll straight into loading a jump. Landing never rolls into a shot.
  2: { 'cone->jump': 1, 'burst->jump': 1 },
};

export function chainGap(phase: number, from: ActionKind, to: ActionKind): number {
  if (from === Action.Idle) return 0;
  return CHAIN_GAPS[phase]?.[`${NAMES[from]}->${NAMES[to]}`] ?? DEFAULT_GAP;
}

// Waits out the chain gap, then marks the action as running.
export function* begin(boss: EntityId, kind: ActionKind): Script {
  const gap = chainGap(BossPhase.phase[boss], BossAction.lastKind[boss] as ActionKind, kind);
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
export const CONE_WINDUP = 14;
export const CONE_VOLLEY_GAP = 12;
export const BURST_WINDUP = 8;
export const JUMP_CROUCH = 18;
export const JUMP_AIR = 34;
export const JUMP_RECOVER = 12;
export const ROAR_REAR = 20;
export const ROAR_HOLD = 55;
