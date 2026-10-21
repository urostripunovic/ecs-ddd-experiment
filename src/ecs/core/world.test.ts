import { beforeEach, describe, expect, it } from 'vitest';

import { despawn, GENERATIONS, indexOf, isLive, MAX_ENTITIES, NOBODY, resetWorld, spawn, toHandle, world } from './world';

describe('handles', () => {
  beforeEach(() => {
    resetWorld();
    world.generation.fill(0);
  });

  it('stay stale when one slot is reused exactly as often as a 16-bit generation could count', () => {
    const first = spawn();
    const old = toHandle(first);
    despawn(first);
    // The free list is a stack, so every spawn takes the same slot back,
    // the way bullets cycle through one slot during a long fight. With 16 bits
    // the generation would now be back at the old handle's, and it would look live.
    for (let i = 0; i < 2 ** 16 - 1; i++) despawn(spawn());
    const e = spawn();
    expect(e).toBe(first);
    expect(isLive(old)).toBe(false);
    expect(isLive(toHandle(e))).toBe(true);
  });

  it('round-trip the highest generation, where the packed int32 is negative', () => {
    const e = spawn();
    world.generation[e] = GENERATIONS - 1;
    const h = toHandle(e);
    expect(h).toBeLessThan(0);
    expect(indexOf(h)).toBe(e);
    expect(isLive(h)).toBe(true);
  });

  it('retire a slot that used up its generations instead of wrapping', () => {
    const e = spawn();
    world.generation[e] = GENERATIONS - 1;
    despawn(e);
    expect(spawn()).not.toBe(e);
  });

  it('keep a retired slot retired across an arena reset', () => {
    const e = spawn();
    world.generation[e] = GENERATIONS - 1;
    // The reset's generation bump is what retires it here.
    resetWorld(true);
    expect(spawn()).not.toBe(e);
    resetWorld(true);
    expect(spawn()).not.toBe(e);
  });

  it('never treat NOBODY as live, even with every slot alive', () => {
    for (let i = 0; i < MAX_ENTITIES; i++) spawn();
    expect(indexOf(NOBODY)).toBeGreaterThanOrEqual(MAX_ENTITIES);
    expect(isLive(NOBODY)).toBe(false);
  });
});
