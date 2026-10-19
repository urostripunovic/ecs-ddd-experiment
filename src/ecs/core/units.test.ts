import { describe, expect, it } from 'vitest';
import { startCutscene } from '../systems/cutscene';
import { waitTicks } from './script';
import { after, hp, inSeconds, inTicks, meters, seconds, share, shareOf, ticks } from './units';
import { world } from './world';

// Every source file except tests and units.ts itself, for the rules the compiler can't see.
const sources = import.meta.glob<string>('../../**/*.ts', { query: '?raw', import: 'default', eager: true });
const code = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts') && path !== './units.ts');
const offenders = (pattern: RegExp) => code.filter(([, src]) => pattern.test(src)).map(([path]) => path);

describe('units', () => {
  it('converts seconds to whole ticks and back', () => {
    expect(inTicks(seconds(4))).toBe(240);
    expect(inTicks(seconds(0.45))).toBe(27);
    expect(inSeconds(ticks(30))).toBe(0.5);
  });

  it('makes deadlines from the current tick', () => {
    world.tick = 100;
    expect(after(ticks(30))).toBe(130);
  });

  it('refuses values that cannot be right, when they are made', () => {
    expect(() => seconds(-1)).toThrow(RangeError);
    expect(() => ticks(1.5)).toThrow(RangeError);
    expect(() => share(1.2)).toThrow(RangeError);
    expect(() => hp(-5)).toThrow(RangeError);
    expect(() => meters(Number.NaN)).toThrow(RangeError);
    expect(shareOf(30, 120)).toBe(0.25);
  });

  it('keeps units apart at compile time', () => {
    world.tick = 0;
    // Each line below must fail to typecheck; if a brand stops working,
    // the unused @ts-expect-error fails `npm run typecheck` instead.
    // @ts-expect-error seconds are not ticks
    after(seconds(2));
    // @ts-expect-error a bare number says nothing about its unit
    after(30);
    // @ts-expect-error hit points are not a duration
    startCutscene(hp(30));
    // @ts-expect-error a coroutine waits in ticks, never in seconds
    waitTicks(seconds(1));
    expect(true).toBe(true);
  });

  it('deadlines are made only with after()', () => {
    // world.tick++ is the loop advancing the clock, not a deadline.
    expect(offenders(/world\.tick\s*\+(?!\+)/)).toEqual([]);
  });

  it('seconds become ticks only in units.ts', () => {
    expect(offenders(/[*/]\s*60\b/)).toEqual([]);
  });
});
