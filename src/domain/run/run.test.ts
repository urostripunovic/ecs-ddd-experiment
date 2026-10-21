import { describe, expect, it } from 'vitest';
import type { BossId, PlayerId, Tick, WeaponId } from '../shared/types';
import {
  carriedWeapon, decide, evolve, FINAL_POWER, initialRun, loadoutOf, MAX_ARENAS, MAX_DRAWN, MAX_REVIVES, MIN_DRAWN,
  powerOf, offerFor, STARTING_LOADOUT, STARTING_REVIVES,
  type Door, type Loadout, type RunCommand, type RunState,
} from './run';

const BOSS = 'warden' as BossId;
const PLAYER = 'player-1' as PlayerId;
const t = (n: number) => n as Tick;
const run = (s: RunState, cmd: RunCommand) => decide(cmd, s).reduce(evolve, s);
// Most loss rules are about the last life: no revives left.
const lastLife = (s: RunState): RunState => ({ ...s, revives: 0 });
const BASE = { seed: 1, revives: 0, offer: null, doors: null, final: false };

const CARRIED: Loadout = {
  hp: 64,
  weapon: { id: 'w-7' as WeaponId, kind: 'spear', durability: 41, ammo: 0 },
  perks: ['adrenaline'],
  armor: 1,
};

describe('run', () => {
  it('starts in arena 1, fighting, with the gun', () => {
    expect(initialRun()).toMatchObject({ arena: 1, status: 'Fighting', loadout: STARTING_LOADOUT });
    expect(STARTING_LOADOUT.weapon?.kind).toBe('gun');
  });

  it('clearing a boss before the last arena clears the arena, not the run', () => {
    const s = run(initialRun(), { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(300) });
    expect(s).toMatchObject({ arena: 1, status: 'Cleared' });
    expect(s).not.toHaveProperty('endedAt');
  });

  it('entering the tunnel after a clear enters the next arena with what you carried', () => {
    let s = run(initialRun(), { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(300) });
    const events = decide({ kind: 'TunnelEntered', player: PLAYER, door: 'onward', loadout: CARRIED, tick: t(420) }, s);
    expect(events).toEqual([{ kind: 'ArenaEntered', arena: 2, final: false, loadout: CARRIED, tick: t(420) }]);
    s = events.reduce(evolve, s);
    expect(s).toMatchObject({ arena: 2, status: 'Fighting', loadout: CARRIED });
  });

  it('refuses the tunnel before the arena is cleared, with an answer rather than silence', () => {
    const events = decide({ kind: 'TunnelEntered', player: PLAYER, door: 'onward', loadout: CARRIED, tick: t(10) }, initialRun());
    expect(events).toEqual([{ kind: 'TunnelRefused', reason: 'NotCleared', tick: t(10) }]);
  });

  it('clearing the last arena wins the run', () => {
    const last: RunState = { ...initialRun(), arena: 2, final: true };
    expect(run(last, { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(900) })).toMatchObject({ status: 'Won', endedAt: t(900) });
  });

  it('going down with no revives left loses the run, and a trade on the same tick keeps the first outcome', () => {
    const lost = run(lastLife(initialRun()), { kind: 'PlayerDowned', player: PLAYER, tick: t(42) });
    expect(lost).toMatchObject({ status: 'Lost', endedAt: t(42) });
    expect(decide({ kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(42) }, lost)).toHaveLength(0);
  });

  // R8: unreachable while the simulation stops damage after a clear, but answered
  // anyway, so that design can change without leaving the run stuck.
  it('going down after the clear with no revives left still loses the run', () => {
    const cleared = run(lastLife(initialRun()), { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(500) });
    expect(run(cleared, { kind: 'PlayerDowned', player: PLAYER, tick: t(530) })).toMatchObject({ status: 'Lost', endedAt: t(530) });
  });

  // R9: if we die, we die. A trade on the tick of the win loses, whichever
  // death the simulation happened to report first.
  it('a trade with the last boss on your last life loses the run, in either order', () => {
    const last: RunState = { ...lastLife(initialRun()), arena: 2, final: true };
    const down = { kind: 'PlayerDowned', player: PLAYER, tick: t(900) } as const;
    const clear = { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(900) } as const;
    expect(run(run(last, clear), down)).toMatchObject({ status: 'Lost', endedAt: t(900) });
    expect(run(run(last, down), clear)).toMatchObject({ status: 'Lost', endedAt: t(900) });
  });

  it('going down after the win, on a later tick, changes nothing', () => {
    const won = run({ ...initialRun(), arena: 2, final: true }, { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(900) });
    expect(decide({ kind: 'PlayerDowned', player: PLAYER, tick: t(901) }, won)).toHaveLength(0);
  });

  describe('shape', () => {
    it('only a finished run has an end tick, and the compiler says so', () => {
      // @ts-expect-error a won run without its end tick can't be written down
      const unended: RunState = { ...BASE, status: 'Won', arena: 2, loadout: STARTING_LOADOUT };
      // @ts-expect-error a run still going has no end tick
      const early: RunState = { ...BASE, status: 'Fighting', arena: 1, loadout: STARTING_LOADOUT, endedAt: t(5) };
      expect([unended, early]).toHaveLength(2);
    });

    it('never enters an arena past the most a run can have', () => {
      const cleared: RunState = { ...BASE, status: 'Cleared', arena: MAX_ARENAS, loadout: STARTING_LOADOUT, doors: 'final' };
      expect(() => evolve(cleared, { kind: 'ArenaEntered', arena: MAX_ARENAS + 1, final: true, loadout: CARRIED, tick: t(1) })).toThrow(RangeError);
    });
  });

  // Numbers from the simulation are checked once, where the loadout is made,
  // not on every field inside the rules.
  describe('loadout', () => {
    it('accepts what a living player can carry', () => {
      expect(loadoutOf(61, carriedWeapon('w-1' as WeaponId, 'gun', 0, 7))).toEqual({
        hp: 61, weapon: { id: 'w-1', kind: 'gun', durability: 0, ammo: 7 }, perks: [], armor: 0,
      });
      expect(loadoutOf(1, null).weapon).toBeNull();
    });

    it('refuses numbers no player could carry', () => {
      expect(() => loadoutOf(0, null)).toThrow(RangeError);
      expect(() => loadoutOf(Number.NaN, null)).toThrow(RangeError);
      expect(() => carriedWeapon('w-1' as WeaponId, 'gun', 0, -1)).toThrow(RangeError);
      expect(() => carriedWeapon('w-1' as WeaponId, 'gun', 0, 2.5)).toThrow(RangeError);
      expect(() => carriedWeapon('w-1' as WeaponId, 'sword', -3, 0)).toThrow(RangeError);
      expect(() => loadoutOf(10, null, [], 4)).toThrow(RangeError);
      expect(() => loadoutOf(10, null, [], -1)).toThrow(RangeError);
    });
  });
});

describe('perks', () => {
  it('starts a run with none', () => {
    expect(STARTING_LOADOUT.perks).toEqual([]);
  });

  it('carry over with the loadout, oldest first', () => {
    const carried = loadoutOf(50, null, ['lastStand', 'finalShot', 'ricochet']);
    let s = run(initialRun(), { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(300) });
    s = run(s, { kind: 'TunnelEntered', player: PLAYER, door: 'onward', loadout: carried, tick: t(400) });
    expect(s.loadout.perks).toEqual(['lastStand', 'finalShot', 'ricochet']);
  });

  it('are never more than three, and never the same one twice', () => {
    expect(() => loadoutOf(50, null, ['lastStand', 'adrenaline', 'finalShot', 'ricochet'])).toThrow(RangeError);
    expect(() => loadoutOf(50, null, ['lastStand', 'lastStand'])).toThrow(RangeError);
  });
});

describe('revives', () => {
  const down = (tick: number) => ({ kind: 'PlayerDowned', player: PLAYER, tick: t(tick) }) as const;

  it('a run starts with three, and holds at most eight', () => {
    expect(initialRun().revives).toBe(STARTING_REVIVES);
    expect(STARTING_REVIVES).toBe(3);
    expect(MAX_REVIVES).toBe(8);
  });

  it('going down with a revive left gets you back up instead of losing', () => {
    const s = initialRun();
    expect(decide(down(40), s)).toEqual([{ kind: 'PlayerRevived', player: PLAYER, revivesLeft: 2, tick: t(40) }]);
    expect(run(s, down(40))).toMatchObject({ status: 'Fighting', revives: 2 });
  });

  it('going down after the clear with a revive left revives too', () => {
    const cleared = run(initialRun(), { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(500) });
    expect(run(cleared, down(530))).toMatchObject({ status: 'Cleared', revives: 2 });
  });

  it('a trade with the last boss with a revive left: the win stands, and the revive is spent, in either order', () => {
    const last: RunState = { ...initialRun(), arena: 2, final: true };
    const clear = { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(900) } as const;
    expect(run(run(last, clear), down(900))).toMatchObject({ status: 'Won', endedAt: t(900), revives: 2 });
    expect(run(run(last, down(900)), clear)).toMatchObject({ status: 'Won', endedAt: t(900), revives: 2 });
  });
});

describe('rewards', () => {
  const clear = (s: RunState) => run(s, { kind: 'BossCleared', boss: BOSS, loadout: null, tick: t(300) });
  const choose = (option: number) => ({ kind: 'RewardChosen', player: PLAYER, option, tick: t(320) }) as const;

  it('clearing a boss before the last arena offers three different rewards, drawn from the seed', () => {
    const s = clear(initialRun(7));
    expect(s.offer).toHaveLength(3);
    expect(new Set(s.offer).size).toBe(3);
    expect(clear(initialRun(7)).offer).toEqual(s.offer);
    expect(offerFor(7, 1, 3)).toEqual(s.offer);
  });

  it('never offers a revive when you already hold eight', () => {
    for (let seed = 1; seed < 40; seed++) expect(offerFor(seed, 1, MAX_REVIVES)).not.toContain('revive');
  });

  it('the last arena wins instead, with no offer', () => {
    expect(clear({ ...initialRun(), arena: 2, final: true }).offer).toBeNull();
  });

  it('choosing one takes it and closes the offer; asking again is refused', () => {
    const s = clear(initialRun(7));
    const reward = s.offer![1];
    const revives = reward === 'revive' ? s.revives + 1 : s.revives;
    expect(decide(choose(1), s)).toEqual([{ kind: 'RewardTaken', reward, revives, tick: t(320) }]);
    const taken = run(s, choose(1));
    expect(taken.offer).toBeNull();
    expect(decide(choose(0), taken)).toEqual([{ kind: 'RewardRefused', reason: 'NoOffer', tick: t(320) }]);
  });

  // Refused rather than ignored, so the pedestal sensor's latch is always released.
  it('refuses a choice with nothing on offer, or one that isn\'t there', () => {
    expect(decide(choose(0), initialRun())).toEqual([{ kind: 'RewardRefused', reason: 'NoOffer', tick: t(320) }]);
    expect(decide(choose(3), clear(initialRun(7)))).toEqual([{ kind: 'RewardRefused', reason: 'NoSuchOption', tick: t(320) }]);
  });

  it('a revive reward adds one, never past eight', () => {
    const offered: RunState = { ...initialRun(), status: 'Cleared', revives: MAX_REVIVES, offer: ['revive', 'armor', 'heal'] };
    expect(decide(choose(0), offered)).toEqual([{ kind: 'RewardTaken', reward: 'revive', revives: MAX_REVIVES, tick: t(320) }]);
    expect(run(offered, choose(0)).revives).toBe(MAX_REVIVES);
    expect(run({ ...offered, revives: 4 }, choose(0)).revives).toBe(5);
  });

  it('walking into the tunnel without choosing forfeits the offer', () => {
    const s = clear(initialRun(7));
    const entered = run(s, { kind: 'TunnelEntered', player: PLAYER, door: 'onward', loadout: CARRIED, tick: t(400) });
    expect(entered).toMatchObject({ arena: 2, offer: null });
  });
});

// Hades-style: once you're strong enough, a clear opens a second door, to the
// final boss. How strong is the run's business and never shown.
describe('the fork', () => {
  const STRONG = loadoutOf(100, carriedWeapon('w-9' as WeaponId, 'gun', 0, 10), ['lastStand', 'adrenaline', 'ricochet'], 3);
  const WEAK = loadoutOf(20, null);
  // A run in a drawn arena, `drawn` bosses after the Warden counting this one.
  const at = (drawn: number, revives = 3): RunState => ({ ...initialRun(), arena: drawn + 1, revives });
  const clearWith = (s: RunState, loadout: Loadout | null) => run(s, { kind: 'BossCleared', boss: BOSS, loadout, tick: t(300) });
  const walk = (s: RunState, door: Door) => decide({ kind: 'TunnelEntered', player: PLAYER, door, loadout: CARRIED, tick: t(400) }, s);

  it('counts what you carry and your revives, and the strong loadout is past the line', () => {
    expect(powerOf(STRONG, 3)).toBeGreaterThanOrEqual(FINAL_POWER);
    expect(powerOf(WEAK, 0)).toBeLessThan(FINAL_POWER);
    expect(powerOf(STARTING_LOADOUT, STARTING_REVIVES)).toBeLessThan(FINAL_POWER);
    // Each thing you can gain adds to it.
    expect(powerOf(STRONG, 4)).toBeGreaterThan(powerOf(STRONG, 3));
    expect(powerOf({ ...WEAK, armor: 1 }, 0)).toBeGreaterThan(powerOf(WEAK, 0));
    expect(powerOf({ ...WEAK, perks: ['ricochet'] }, 0)).toBeGreaterThan(powerOf(WEAK, 0));
    expect(powerOf({ ...WEAK, weapon: STRONG.weapon }, 0)).toBeGreaterThan(powerOf(WEAK, 0));
  });

  it('never shows: no event carries a number for it', () => {
    const events = decide({ kind: 'BossCleared', boss: BOSS, loadout: STRONG, tick: t(300) }, at(MIN_DRAWN));
    expect(JSON.stringify(events)).not.toMatch(/power/i);
  });

  it('opens only the onward door after the Warden, however strong you are', () => {
    expect(clearWith(initialRun(), STRONG).doors).toBe('onward');
  });

  it('opens both doors after enough drawn bosses, once you are strong enough', () => {
    expect(clearWith(at(MIN_DRAWN - 1), STRONG).doors).toBe('onward');
    expect(clearWith(at(MIN_DRAWN), STRONG).doors).toBe('both');
    expect(clearWith(at(MIN_DRAWN), WEAK).doors).toBe('onward');
  });

  it('judges you as you stand at the kill, not as you walked in', () => {
    const s = { ...at(MIN_DRAWN), loadout: WEAK };
    expect(clearWith(s, STRONG).doors).toBe('both');
    // Down at the kill: the run falls back to what you entered with.
    expect(clearWith(s, null).doors).toBe('onward');
  });

  it('leaves only the final door after the most drawn bosses, however weak you are', () => {
    expect(clearWith(at(MAX_DRAWN), WEAK).doors).toBe('final');
    expect(MIN_DRAWN).toBe(3);
    expect(MAX_DRAWN).toBe(7);
    expect(MAX_ARENAS).toBe(MAX_DRAWN + 2);
  });

  it('enters the final through its door, and the onward door goes on drawing', () => {
    const both = clearWith(at(MIN_DRAWN), STRONG);
    expect(walk(both, 'final')).toEqual([{ kind: 'ArenaEntered', arena: MIN_DRAWN + 2, final: true, loadout: CARRIED, tick: t(400) }]);
    expect(walk(both, 'onward')).toEqual([{ kind: 'ArenaEntered', arena: MIN_DRAWN + 2, final: false, loadout: CARRIED, tick: t(400) }]);
    const inFinal = walk(both, 'final').reduce(evolve, both);
    expect(inFinal).toMatchObject({ final: true, doors: null, status: 'Fighting' });
  });

  // Refused rather than ignored, so the tunnel sensor's latch is released.
  it('refuses a door that is closed', () => {
    expect(walk(clearWith(at(1), STRONG), 'final')).toEqual([{ kind: 'TunnelRefused', reason: 'DoorClosed', tick: t(400) }]);
    expect(walk(clearWith(at(MAX_DRAWN), WEAK), 'onward')).toEqual([{ kind: 'TunnelRefused', reason: 'DoorClosed', tick: t(400) }]);
  });

  it('wins the run only by clearing the final', () => {
    const final: RunState = { ...at(MIN_DRAWN + 1), final: true };
    expect(clearWith(final, WEAK)).toMatchObject({ status: 'Won', doors: null, offer: null });
    expect(clearWith(at(MAX_DRAWN), STRONG).status).toBe('Cleared');
  });

  it('always reaches the final, however a run plays: every path through the doors ends there', () => {
    for (const strength of [WEAK, STRONG]) {
      let s = initialRun();
      for (let i = 0; i < MAX_ARENAS && s.status !== 'Won'; i++) {
        s = clearWith(s, strength);
        if (s.status === 'Won') break;
        const door: Door = s.doors === 'onward' ? 'onward' : 'final';
        s = walk(s, door).reduce(evolve, s);
      }
      expect(s.status).toBe('Won');
      expect(s.arena).toBeLessThanOrEqual(MAX_ARENAS);
      expect(s.arena).toBe(strength === STRONG ? MIN_DRAWN + 2 : MAX_ARENAS);
    }
  });
});
