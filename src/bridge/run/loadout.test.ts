import { describe, expect, it } from 'vitest';
import { Perk } from '../../ecs/systems/perks';
import { RewardKind } from '../../ecs/systems/rewards';
import { DoorNumber } from '../../ecs/systems/tunnel';
import { WeaponKind } from '../../ecs/weapons/defs';
import { DOOR_NUMBER, KIND_NUMBER, PERK_NUMBER, REWARD_KIND, doorNameOf, kindNameOf, perkNameOf } from './loadout';

// The run and the simulation keep separate vocabularies on purpose: the rules may
// not read the simulation, not even its types. So nothing but this test notices
// when the simulation gains a member the run has no word for, and that member
// would reach the rules as something else, or not at all.
const numbers = (table: Record<string, number>, ...nothing: number[]) =>
  Object.values(table).filter((number) => !nothing.includes(number)).sort((a, b) => a - b);

describe('the run and the simulation name the same things', () => {
  it('every weapon the simulation has, the run names; fists are an empty hand', () => {
    expect(numbers(KIND_NUMBER)).toEqual(numbers(WeaponKind, WeaponKind.Fists));
  });

  it('every perk the simulation has, the run names', () => {
    expect(numbers(PERK_NUMBER)).toEqual(numbers(Perk, Perk.None));
  });

  it('every reward the simulation has, the run names', () => {
    expect(numbers(REWARD_KIND)).toEqual(numbers(RewardKind, RewardKind.None));
  });

  it('every door the simulation has, the run names', () => {
    expect(numbers(DOOR_NUMBER)).toEqual(numbers(DoorNumber));
  });

  it('each name comes back from its own number', () => {
    for (const [name, kind] of Object.entries(KIND_NUMBER)) expect(kindNameOf(kind)).toBe(name);
    for (const [name, perk] of Object.entries(PERK_NUMBER)) expect(perkNameOf(perk)).toBe(name);
    for (const [name, door] of Object.entries(DOOR_NUMBER)) expect(doorNameOf(door)).toBe(name);
  });

  it('an empty hand and an empty slot have no name, and say so', () => {
    expect(kindNameOf(WeaponKind.Fists)).toBeNull();
    expect(perkNameOf(Perk.None)).toBeNull();
  });

  it('a number the run has no word for is a bug, not a silent stand-in', () => {
    expect(() => kindNameOf(200)).toThrow(RangeError);
    expect(() => perkNameOf(200)).toThrow(RangeError);
    expect(() => doorNameOf(200)).toThrow(RangeError);
  });
});
