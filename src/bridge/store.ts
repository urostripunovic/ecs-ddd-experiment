import { type BossState } from '../domain/boss/boss';
import { initialRun, type RunState } from '../domain/run/run';
import type { BossId } from '../domain/shared/types';

// Current domain state per rules unit. In-memory for now; it is also what a
// save would write.
export const store = {
  bosses: new Map<BossId, BossState>(),
  run: initialRun() as RunState,
  reset(seed = 1): void {
    this.bosses.clear();
    this.run = initialRun(seed);
  },
};
