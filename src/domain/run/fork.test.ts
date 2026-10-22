// The fork (R17-R19): when a clear opens the door to the final, judged on hidden power.
import { describe, expect, it } from 'vitest';
import type { BossId, PlayerId, Tick, WeaponId } from '../shared/types';
import {
  carriedWeapon, decide, evolve, FINAL_POWER, initialRun, loadoutOf, MAX_ARENAS, MAX_DRAWN, MIN_DRAWN,
  powerOf, STARTING_LOADOUT, STARTING_REVIVES,
  type Door, type Loadout, type RunCommand, type RunState,
} from './run';

const BOSS = 'warden' as BossId;
const PLAYER = 'player-1' as PlayerId;
const t = (n: number) => n as Tick;
const run = (s: RunState, cmd: RunCommand) => decide(cmd, s).reduce(evolve, s);

const CARRIED: Loadout = {
  hp: 64,
  weapon: { id: 'w-7' as WeaponId, kind: 'spear', durability: 41, ammo: 0, level: 2 },
  perks: ['adrenaline'],
  armor: 1,
};

// Hades-style: once you're strong enough, a clear opens a second door, to the
// final boss. How strong is the run's business and never shown.
describe('the fork', () => {
  const STRONG = loadoutOf(100, carriedWeapon('w-9' as WeaponId, 'gun', 0, 10, 1), ['lastStand', 'adrenaline', 'ricochet'], 3);
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

  // A weapon counts what it adds to your damage: a level-1 one counts one, each
  // level after it as much as it adds to the damage (R17).
  it('counts a weapon by its level', () => {
    const at = (level: number) => powerOf({ ...WEAK, weapon: carriedWeapon('w-3' as WeaponId, 'sword', 50, 0, level) }, 0);
    expect(at(1)).toBeCloseTo(powerOf(WEAK, 0) + 1, 9);
    expect(at(3)).toBeCloseTo(powerOf(WEAK, 0) + 1.3, 9);
    expect(at(4)).toBeGreaterThan(at(3));
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
