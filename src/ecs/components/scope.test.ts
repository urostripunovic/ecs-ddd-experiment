import { describe, expect, it } from 'vitest';
import { RunViewWritable } from './run-view';
import * as components from './index';
import {
  ARENA_STATE, CONSTANTS, Cutscene, PlayerInput, resetArenaState, RUN_STATE, RunView, Shake, Stock, Transform,
} from './index';

const lists = [ARENA_STATE, RUN_STATE, CONSTANTS] as const;

describe('component lifetimes', () => {
  it('every component and singleton declares exactly one lifetime', () => {
    const declared = lists.flatMap((l) => Object.values(l) as unknown[]);
    for (const [name, value] of Object.entries(components)) {
      if (typeof value !== 'object' || (lists as readonly unknown[]).includes(value)) continue;
      expect(declared.filter((v) => v === value).length, name).toBe(1);
    }
  });

  it('a new arena wipes arena state and keeps run state', () => {
    Transform.x[3] = 7;
    Cutscene.until = 500;
    Shake.trauma = 1;
    Stock.respawnAt[1] = 900;
    PlayerInput.throwReleases = 4;
    RunViewWritable.arena = 2;

    resetArenaState();

    expect(Transform.x[3]).toBe(0);
    expect(Cutscene.until).toBe(0);
    expect(Shake.trauma).toBe(0);
    expect(Stock.respawnAt[1]).toBe(0);
    expect(PlayerInput.throwReleases).toBe(4);
    expect(RunView.arena).toBe(2);
  });
});
