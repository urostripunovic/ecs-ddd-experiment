import { describe, expect, it } from 'vitest';

import { arenaFor, FINAL_ARENA, POOL, RUN_LENGTH, WARDEN_ARENA } from './arenas';
import { BossStyleKind } from './bosses/defs';

const plan = (seed: number) => Array.from({ length: RUN_LENGTH }, (_, i) => arenaFor(seed, i + 1, RUN_LENGTH));

describe('a run\'s arenas', () => {
  it('are six: the Warden, four drawn from the pool, and the final boss', () => {
    expect(RUN_LENGTH).toBe(6);
    for (const seed of [1, 2, 99, 12345]) {
      const arenas = plan(seed);
      expect(arenas[0].layout).toBe(WARDEN_ARENA);
      expect(arenas[RUN_LENGTH - 1].layout).toBe(FINAL_ARENA);
      for (const a of arenas.slice(1, -1)) expect(POOL).toContain(a.layout);
    }
  });

  it('come from the seed: the same seed is the same run', () => {
    expect(plan(7).map((a) => a.layout)).toEqual(plan(7).map((a) => a.layout));
  });

  it('never draw the same boss twice in a row, when the pool has a choice', () => {
    if (POOL.length < 2) return;
    for (let seed = 1; seed < 60; seed++) {
      const drawn = plan(seed).slice(1, -1).map((a) => a.layout);
      for (let i = 1; i < drawn.length; i++) expect(drawn[i]).not.toBe(drawn[i - 1]);
    }
  });

  it('get harder the deeper you are: more hp, and a quicker pace', () => {
    const arenas = plan(3);
    for (let i = 2; i < RUN_LENGTH - 1; i++) {
      const before = arenas[i - 1].boss;
      const now = arenas[i].boss;
      // Compared against the same boss at the earlier depth, so a tougher pool entry can't fake it.
      expect(now.hp).toBeGreaterThan(arenaFor(3, i, RUN_LENGTH, arenas[i].layout).boss.hp);
      expect(now.pace).toBeGreaterThan(before.pace - 1e-9);
    }
    expect(arenas[0].boss.pace).toBe(1);
  });

  it('keep the Warden as it is in arena 1, the tutorial', () => {
    const first = arenaFor(5, 1, RUN_LENGTH);
    expect(first.boss.style).toBe(BossStyleKind.Warden);
    expect(first.boss.hp).toBe(WARDEN_ARENA.boss.hp);
  });
});
