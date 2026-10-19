import { describe, expect, it } from 'vitest';
import type { BossId, PlayerId, Tick } from '../shared/types';
import { decide, evolve, initialBoss, type BossCommand, type BossState } from './boss';

const BOSS = 'warden' as BossId;
const PLAYER = 'player-1' as PlayerId;
const t = (n: number) => n as Tick;

const run = (s: BossState, cmd: BossCommand) => {
  const events = decide(cmd, s);
  return { events, state: events.reduce(evolve, s) };
};

describe('boss', () => {
  it('enters phase 2 when the threshold is crossed in phase 1', () => {
    const { events, state } = run(initialBoss(BOSS), { kind: 'BossThresholdCrossed', boss: BOSS, share: 0.5, tick: t(10) });
    expect(events).toEqual([{ kind: 'BossPhaseReached', boss: BOSS, phase: 2, tick: t(10) }]);
    expect(state.phase).toBe(2);
  });

  it('ignores a duplicate crossing', () => {
    const cross: BossCommand = { kind: 'BossThresholdCrossed', boss: BOSS, share: 0.5, tick: t(10) };
    const { state } = run(initialBoss(BOSS), cross);
    expect(decide(cross, state)).toHaveLength(0);
  });

  it('is defeated once, and stays in its phase', () => {
    const down: BossCommand = { kind: 'BossDowned', boss: BOSS, by: PLAYER, tick: t(99) };
    const { events, state } = run(initialBoss(BOSS), down);
    expect(events).toEqual([{ kind: 'BossDefeated', boss: BOSS, by: PLAYER, tick: t(99) }]);
    expect(state).toEqual({ id: BOSS, phase: 1, defeated: true });
    expect(decide(down, state)).toHaveLength(0);
  });

  it('does not change phase after defeat', () => {
    const defeated: BossState = { id: BOSS, phase: 1, defeated: true };
    expect(decide({ kind: 'BossThresholdCrossed', boss: BOSS, share: 0.5, tick: t(1) }, defeated)).toHaveLength(0);
  });
});
