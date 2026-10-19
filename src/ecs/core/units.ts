// Units as brands: free at runtime, but the compiler won't pass seconds where
// ticks are expected, or hit points where a duration is. Brand at the edges
// (definitions tables, constructors, signatures). The per-tick loops read plain
// numbers from typed arrays, which can't carry a brand.
//
// The constructors check the value once, when it's made, which is where a
// wrong number is cheap to catch: definitions run them at module load.
import { world, type Brand } from './world';

export const TICKS_PER_SECOND = 60;

// A length of time, in ticks.
export type Ticks = Brand<number, 'Ticks'>;
// A moment: the value world.tick will have when something starts or ends.
export type TickAt = Brand<number, 'TickAt'>;
// A length of time in seconds, for countdowns integrated with dt (cooldowns,
// reloads, bullet life) and physics over a duration.
export type Seconds = Brand<number, 'Seconds'>;
export type Hp = Brand<number, 'Hp'>;
// A part of a whole, 0..1: "half of max hp".
export type Share = Brand<number, 'Share'>;
// A distance or a radius. Positions stay plain numbers.
export type Meters = Brand<number, 'Meters'>;

function check(ok: boolean, unit: string, value: number): void {
  if (!ok) throw new RangeError(`not a valid ${unit}: ${value}`);
}

export function ticks(n: number): Ticks {
  check(Number.isInteger(n) && n >= 0, 'tick count', n);
  return n as Ticks;
}

export function seconds(s: number): Seconds {
  check(Number.isFinite(s) && s >= 0, 'number of seconds', s);
  return s as Seconds;
}

export function hp(n: number): Hp {
  check(Number.isFinite(n) && n >= 0, 'hp', n);
  return n as Hp;
}

export function share(n: number): Share {
  check(n >= 0 && n <= 1, 'share', n);
  return n as Share;
}

export function meters(n: number): Meters {
  check(Number.isFinite(n) && n >= 0, 'distance', n);
  return n as Meters;
}

// The only place seconds and ticks meet. Rounds to whole ticks, because the
// simulation can't act between them.
export const inTicks = (s: Seconds) => Math.round(s * TICKS_PER_SECOND) as Ticks;
export const inSeconds = (t: Ticks) => (t / TICKS_PER_SECOND) as Seconds;

export const plus = (a: Ticks, b: Ticks) => (a + b) as Ticks;
// Damage after a multiplier (a buff, a charged throw) is still damage.
export const times = (h: Hp, factor: number) => (h * factor) as Hp;

// The only way to make a deadline, so every "until" is measured from now.
export const after = (d: Ticks) => (world.tick + d) as TickAt;

// Unchecked, because it reads hp arrays every tick. whole must not be 0.
export const shareOf = (part: number, whole: number) => (part / whole) as Share;
