import type { BossEvent } from '../../domain/boss/boss';
import { assertNever } from '../../domain/shared/types';

// Writes domain truth into components; never sends commands.
// Returns what it did, for the tick log.
export function projectBoss(e: BossEvent): string {
  switch (e.kind) {
    case 'BossDefeated':
      // The ECS already tagged it Dead; the rule consequence is the run's.
      return 'no component change';
    default:
      return assertNever(e.kind);
  }
}
