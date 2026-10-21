import { describe, expect, it } from 'vitest';

import { arenaFor, FINAL_ARENA, POOL, WARDEN_ARENA } from './arenas';
import { BossStyleKind } from './bosses/defs';

// A run that goes through the final door at arena `length`.
const RUN_LENGTH = 6;
const plan = (seed: number, length = RUN_LENGTH) => Array.from({ length }, (_, i) => arenaFor(seed, i + 1, i + 1 === length));

describe('a run\'s arenas', () => {
  it('are the Warden, bosses drawn from the pool, and the final boss', () => {
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
      expect(now.hp).toBeGreaterThan(arenaFor(3, i, false, arenas[i].layout).boss.hp);
      expect(now.pace).toBeGreaterThan(before.pace - 1e-9);
    }
    expect(arenas[0].boss.pace).toBe(1);
  });

  it('end on the final boss, in its own hall', () => {
    const last = arenaFor(5, RUN_LENGTH, true);
    expect(last.boss.style).toBe(BossStyleKind.Final);
    expect(POOL).not.toContain(FINAL_ARENA);
  });

  it('draw the same bosses whichever door you take: the fork never changes the draw', () => {
    const short = plan(11, 5).slice(1, -1).map((a) => a.layout);
    const long = plan(11, 9).slice(1, 4).map((a) => a.layout);
    expect(long).toEqual(short);
  });

  it('make the final tougher the later you take it', () => {
    expect(arenaFor(5, 9, true).boss.hp).toBeGreaterThan(arenaFor(5, 5, true).boss.hp);
    expect(arenaFor(5, 9, true).boss.pace).toBeGreaterThan(arenaFor(5, 5, true).boss.pace);
  });

  it('keep the Warden as it is in arena 1, the tutorial', () => {
    const first = arenaFor(5, 1, false);
    expect(first.boss.style).toBe(BossStyleKind.Warden);
    expect(first.boss.hp).toBe(WARDEN_ARENA.boss.hp);
  });
});
