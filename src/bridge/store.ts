import { type BossState } from '../domain/boss/boss';
import { initialMatch, type MatchState } from '../domain/match/match';
import type { BossId } from '../domain/shared/types';

// Current domain state per aggregate. In-memory for now; it is also what a
// save would write.
export const store = {
  bosses: new Map<BossId, BossState>(),
  match: initialMatch() as MatchState,
  reset(): void {
    this.bosses.clear();
    this.match = initialMatch();
  },
};
