import type { BossEvent } from '../../domain/boss/boss';
import { assertNever } from '../../domain/shared/types';
import { BossPhase, C } from '../../ecs/components';
import { indexOf, isLive, remove } from '../../ecs/core/world';
import { idMap } from '../id-map';

// Writes domain truth into components; never sends commands.
// Returns what it did, for the tick log.
export function projectBoss(e: BossEvent): string {
  switch (e.kind) {
    case 'BossPhaseReached': {
      const h = idMap.handleOfBoss(e.boss);
      if (h === undefined || !isLive(h)) return 'boss gone, skipped';
      const b = indexOf(h);
      BossPhase.phase[b] = e.phase;
      remove(b, C.PhasePending);
      return `BossPhase[${b}]=${e.phase}`;
    }
    case 'BossDefeated':
      // The ECS already tagged it Dead; the rule consequence is the match's.
      return 'no component change';
    default:
      return assertNever(e);
  }
}
