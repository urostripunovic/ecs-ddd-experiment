import type { BossEvent } from '../../domain/boss/boss';
import type { MatchCommand } from '../../domain/match/match';
import { assertNever, type Tick } from '../../domain/shared/types';
import type { OutboxSlot } from '../../ecs/core/outbox';
import { idMap } from '../id-map';

// The match only hears about the player directly from the simulation.
export function toMatchCommand(slot: OutboxSlot): MatchCommand | null {
  const ref = idMap.refOf(slot.subject);
  if (ref?.context !== 'player') return null;
  switch (slot.kind) {
    case 'EntityDowned': return { kind: 'PlayerDowned', player: ref.id, tick: slot.tick as Tick };
    case 'BossThresholdCrossed': return null;
    default: return assertNever(slot.kind);
  }
}

// Process manager: a boss's defeat clears the match. Cross-context, so it is
// a new command for the match rather than the boss reaching into it.
export function matchCommandFromBoss(e: BossEvent): MatchCommand | null {
  switch (e.kind) {
    case 'BossDefeated': return { kind: 'BossCleared', boss: e.boss, tick: e.tick };
    case 'BossPhaseReached': return null;
    default: return assertNever(e);
  }
}
