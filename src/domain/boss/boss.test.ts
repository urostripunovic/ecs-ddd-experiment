import { describe, expect, it } from 'vitest';
import type { BossId, PlayerId, Tick } from '../shared/types';
import { decide, evolve, initialBoss, type BossCommand } from './boss';

const BOSS = 'warden' as BossId;
const PLAYER = 'player-1' as PlayerId;
const t = (n: number) => n as Tick;

// The boss's rules are its lifecycle: alive, then defeated, once. Its phases are
// simulation (ecs/systems/boss.ts): nothing outside the fight reacts to them.
describe('boss', () => {
  it('is defeated once', () => {
    const down: BossCommand = { kind: 'BossDowned', boss: BOSS, by: PLAYER, tick: t(99) };
    const events = decide(down, initialBoss(BOSS));
    expect(events).toEqual([{ kind: 'BossDefeated', boss: BOSS, by: PLAYER, tick: t(99) }]);
    const state = events.reduce(evolve, initialBoss(BOSS));
    expect(state).toEqual({ id: BOSS, defeated: true });
    expect(decide(down, state)).toHaveLength(0);
  });
});
