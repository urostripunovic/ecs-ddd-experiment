import { type BossState } from '../domain/boss/boss';
import { initialRun, type RunState } from '../domain/run/run';
import type { BossId } from '../domain/shared/types';
import { ARENAS } from '../ecs/arenas';

// Current domain state per rules unit. In-memory for now; it is also what a
// save would write.
export const store = {
  bosses: new Map<BossId, BossState>(),
  run: initialRun(ARENAS.length) as RunState,
  reset(): void {
    this.bosses.clear();
    this.run = initialRun(ARENAS.length);
  },
};
