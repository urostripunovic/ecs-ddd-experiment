import { describe, expect, it } from 'vitest';
import type { BossId, PlayerId, Tick, WeaponId } from '../shared/types';
import { decide, evolve, initialRun, STARTING_LOADOUT, type Loadout, type RunCommand, type RunState } from './run';

const BOSS = 'warden' as BossId;
const PLAYER = 'player-1' as PlayerId;
const t = (n: number) => n as Tick;
const run = (s: RunState, cmd: RunCommand) => decide(cmd, s).reduce(evolve, s);

const CARRIED: Loadout = {
  hp: 64,
  weapon: { id: 'w-7' as WeaponId, kind: 'spear', durability: 41, ammo: 0 },
};

describe('run', () => {
  it('starts in arena 1, fighting, with the gun', () => {
    expect(initialRun(2)).toMatchObject({ arena: 1, status: 'Fighting', loadout: STARTING_LOADOUT });
    expect(STARTING_LOADOUT.weapon?.kind).toBe('gun');
  });

  it('clearing a boss before the last arena clears the arena, not the run', () => {
    const s = run(initialRun(2), { kind: 'BossCleared', boss: BOSS, tick: t(300) });
    expect(s).toMatchObject({ arena: 1, status: 'Cleared', endedAt: null });
  });

  it('entering the tunnel after a clear enters the next arena with what you carried', () => {
    let s = run(initialRun(2), { kind: 'BossCleared', boss: BOSS, tick: t(300) });
    const events = decide({ kind: 'TunnelEntered', player: PLAYER, loadout: CARRIED, tick: t(420) }, s);
    expect(events).toEqual([{ kind: 'ArenaEntered', arena: 2, loadout: CARRIED, tick: t(420) }]);
    s = events.reduce(evolve, s);
    expect(s).toMatchObject({ arena: 2, status: 'Fighting', loadout: CARRIED });
  });

  it('refuses the tunnel before the arena is cleared, with an answer rather than silence', () => {
    const events = decide({ kind: 'TunnelEntered', player: PLAYER, loadout: CARRIED, tick: t(10) }, initialRun(2));
    expect(events).toEqual([{ kind: 'TunnelRefused', reason: 'NotCleared', tick: t(10) }]);
  });

  it('clearing the last arena wins the run', () => {
    const last: RunState = { ...initialRun(2), arena: 2 };
    expect(run(last, { kind: 'BossCleared', boss: BOSS, tick: t(900) })).toMatchObject({ status: 'Won', endedAt: t(900) });
  });

  it('going down loses the run, and a trade on the same tick keeps the first outcome', () => {
    const lost = run(initialRun(2), { kind: 'PlayerDowned', player: PLAYER, tick: t(42) });
    expect(lost).toMatchObject({ status: 'Lost', endedAt: t(42) });
    expect(decide({ kind: 'BossCleared', boss: BOSS, tick: t(42) }, lost)).toHaveLength(0);
  });

  // R8: the title card has shown, so the clear stands.
  it('going down after the clear changes nothing: the clear stands', () => {
    const cleared = run(initialRun(2), { kind: 'BossCleared', boss: BOSS, tick: t(500) });
    expect(decide({ kind: 'PlayerDowned', player: PLAYER, tick: t(530) }, cleared)).toHaveLength(0);
  });
});
