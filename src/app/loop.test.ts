import { describe, expect, it } from 'vitest';
import { idMap } from '../bridge/id-map';
import { BOSS_ID, startMatch } from '../bridge/spawn';
import { readTickLog } from '../bridge/tick-log';
import { BossPhase, MatchStatus, MatchView, PlayerInput } from '../ecs/components';
import { indexOf, world } from '../ecs/core/world';
import { createFrameDriver, tick } from './loop';

// The whole stack headless: player holds fire at the boss straight ahead.
function fight(bossHp: number, maxTicks = 1800): string[] {
  startMatch({ bossHp });
  PlayerInput.aimX = 0;
  PlayerInput.aimZ = -1;
  PlayerInput.fire = true;
  while (MatchView.status === MatchStatus.Fighting && world.tick < maxTicks) tick();
  return readTickLog();
}

describe('arena loop', () => {
  it('shooting the boss reaches phase 2 and then wins', () => {
    const log = fight(300);
    const boss = indexOf(idMap.handleOfBoss(BOSS_ID)!);
    const kinds = log.map((l) => l.split(': ')[1]);

    expect(kinds).toEqual([
      'BossThresholdCrossed(warden) -> BossPhaseReached -> BossPhase[5]=2',
      'BossDowned(warden) -> BossDefeated -> no component change',
      'BossCleared -> MatchWon -> MatchView=Won',
    ]);
    expect(BossPhase.phase[boss]).toBe(2);
  });

  it('is deterministic: the same inputs give the same tick log', () => {
    expect(fight(600)).toEqual(fight(600));
  });

  it('uneven frame times give the same result as a steady 60 Hz', () => {
    const steady = fight(300);

    startMatch({ bossHp: 300 });
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    const frame = createFrameDriver(() => {});
    const pattern = [1 / 144, 1 / 144, 1 / 30, 1 / 144, 0.12, 1 / 30];
    for (let i = 0; MatchView.status === MatchStatus.Fighting && world.tick < 1800; i++) {
      frame(pattern[i % pattern.length]);
    }
    // A frame may run a few ticks past the deciding one, but the log stops there.
    expect(readTickLog()).toEqual(steady);
  });
});
