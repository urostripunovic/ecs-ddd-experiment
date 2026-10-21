import { beforeEach, describe, expect, it } from 'vitest';
import { RunStatus, RunView } from '../../ecs/components';
import { send } from '../../ecs/core/outbox';
import { NOBODY } from '../../ecs/core/world';
import { domainStep } from '../dispatch';
import { BOSS_ID, startRun, type RunHandles } from '../spawn';
import { store } from '../store';
import { readTickLog } from '../tick-log';

// Seam tests: push a command into the bridge, assert the component values that come out.
describe('boss flow', () => {
  let h: RunHandles;
  beforeEach(() => { h = startRun(); });

  it('downing the boss clears the arena through the cascade', () => {
    send('EntityDowned', h.boss, h.player, 0);
    domainStep();

    expect(RunView.status).toBe(RunStatus.Cleared);
    expect(readTickLog()).toEqual([
      'tick 0: BossDowned(warden) -> BossDefeated -> no component change',
      'tick 0: BossCleared -> ArenaCleared -> RunView=Cleared, tunnel open',
      // The same clear offers three rewards, drawn from the run's seed (R12).
      expect.stringMatching(/^tick 0: BossCleared -> RewardsOffered -> pedestals for \w+ and \w+ and \w+$/),
    ]);
  });

  it('a stale handle from the previous run is ignored', () => {
    const old = h.boss;
    h = startRun();
    send('EntityDowned', old, NOBODY, 0);
    domainStep();
    expect(store.bosses.get(BOSS_ID)?.defeated).toBe(false);
    expect(RunView.status).toBe(RunStatus.Fighting);
  });
});
