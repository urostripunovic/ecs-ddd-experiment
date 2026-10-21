import { beforeEach, describe, expect, it } from 'vitest';

import { add, despawn, NOBODY, remove, resetWorld, spawn, toHandle } from '../core/world';
import { C, LastHit, Wielder } from '.';

describe('freeing a row that a note still points at', () => {
  beforeEach(() => {
    resetWorld();
    Wielder.held.fill(NOBODY);
    LastHit.by.fill(NOBODY);
  });

  it('fails in dev and tests, naming the row and the note', () => {
    const player = spawn();
    add(player, C.Wielder);
    const sword = spawn();
    Wielder.held[player] = toHandle(sword);
    // The Warden swallowing your sword with a bare despawn: the player would
    // still hold a note to whatever takes the row next.
    expect(() => despawn(sword)).toThrow(`row ${sword} freed while Wielder.held[${player}] still points at it`);
  });

  it('allows it once the note is cleared, as breakItem does', () => {
    const player = spawn();
    add(player, C.Wielder);
    const sword = spawn();
    Wielder.held[player] = toHandle(sword);
    Wielder.held[player] = NOBODY;
    expect(() => despawn(sword)).not.toThrow();
  });

  it('ignores a note in a row the column no longer counts for', () => {
    // A leftover from an earlier occupant: the row's Wielder checkbox is off,
    // so no system reads that cell.
    const row = spawn();
    const sword = spawn();
    Wielder.held[row] = toHandle(sword);
    add(row, C.Wielder);
    remove(row, C.Wielder);
    expect(() => despawn(sword)).not.toThrow();
  });

  it('ignores notes in rows that are already free', () => {
    const player = spawn();
    add(player, C.Wielder);
    const sword = spawn();
    Wielder.held[player] = toHandle(sword);
    despawn(player);
    expect(() => despawn(sword)).not.toThrow();
  });

  it('ignores a note to an earlier occupant of the row', () => {
    const player = spawn();
    add(player, C.Health);
    const bullet = spawn();
    const old = toHandle(bullet);
    despawn(bullet);
    const next = spawn();
    expect(next).toBe(bullet);
    // Same row, older version: already stale, so isLive catches it and it can't
    // be mistaken for the new occupant.
    LastHit.by[player] = old;
    expect(() => despawn(next)).not.toThrow();
  });
});
