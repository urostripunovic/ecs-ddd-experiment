import { beforeEach, describe, expect, it } from 'vitest';
import { BossPhase, C, RunStatus, RunView } from '../../ecs/components';
import { send } from '../../ecs/core/outbox';
import { add, has, indexOf, NO_HANDLE } from '../../ecs/core/world';
import { domainStep } from '../dispatch';
import { BOSS_ID, startRun, type RunHandles } from '../spawn';
import { store } from '../store';
import { readTickLog } from '../tick-log';

// Seam tests: push a command into the bridge, assert the component values that come out.
describe('boss flow', () => {
  let h: RunHandles;
  beforeEach(() => { h = startRun(); });

  it('a threshold crossing projects phase 2 and releases the latch', () => {
    const b = indexOf(h.boss);
    add(b, C.PhasePending);
    send('BossThresholdCrossed', h.boss, NO_HANDLE, 0.5);
    domainStep();

    expect(BossPhase.phase[b]).toBe(2);
    expect(has(b, C.PhasePending)).toBe(false);
    expect(store.bosses.get(BOSS_ID)?.phase).toBe(2);
    expect(readTickLog()).toEqual(['tick 0: BossThresholdCrossed(warden) -> BossPhaseReached -> BossPhase(warden)=2']);
  });

  it('downing the boss clears the arena through the cascade', () => {
    send('EntityDowned', h.boss, h.player, 0);
    domainStep();

    expect(RunView.status).toBe(RunStatus.Cleared);
    expect(readTickLog()).toEqual([
      'tick 0: BossDowned(warden) -> BossDefeated -> no component change',
      'tick 0: BossCleared -> ArenaCleared -> RunView=Cleared, tunnel open',
    ]);
  });

  it('a stale handle from the previous match is ignored', () => {
    const old = h.boss;
    h = startRun();
    send('BossThresholdCrossed', old, NO_HANDLE, 0.5);
    domainStep();
    expect(BossPhase.phase[indexOf(h.boss)]).toBe(1);
  });
});
