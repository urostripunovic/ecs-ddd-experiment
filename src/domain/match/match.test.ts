import { describe, expect, it } from 'vitest';
import type { BossId, PlayerId, Tick } from '../shared/types';
import { decide, evolve, initialMatch } from './match';

const BOSS = 'warden' as BossId;
const PLAYER = 'player-1' as PlayerId;
const t = (n: number) => n as Tick;

describe('match', () => {
  it('is won when the boss is cleared', () => {
    const events = decide({ kind: 'BossCleared', boss: BOSS, tick: t(300) }, initialMatch());
    expect(events.reduce(evolve, initialMatch())).toEqual({ status: 'Won', endedAt: t(300) });
  });

  it('is lost when the player goes down', () => {
    const events = decide({ kind: 'PlayerDowned', player: PLAYER, tick: t(42) }, initialMatch());
    expect(events.reduce(evolve, initialMatch())).toEqual({ status: 'Lost', endedAt: t(42) });
  });

  it('keeps the first outcome when both happen', () => {
    const lost = { status: 'Lost', endedAt: t(42) } as const;
    expect(decide({ kind: 'BossCleared', boss: BOSS, tick: t(42) }, lost)).toHaveLength(0);
  });
});
