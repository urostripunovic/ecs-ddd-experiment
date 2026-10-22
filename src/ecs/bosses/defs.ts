// Bosses as data, like the weapons: what a boss is made of when it spawns.
// Its attacks are choreography and live with its scripts.
import { hp, inTicks, meters, seconds, type Hp, type Meters, type Ticks } from '../core/units';

export type BossDef = {
  readonly name: string;
  readonly hp: Hp;
  readonly radius: Meters;
  // No evading in the opening seconds, while the player is still finding range.
  readonly evadeGrace: Ticks;
  // Which scripts and chain gaps it fights with: BossStyleKind.
  readonly style: number;
  // 1 is its own pace; higher waits less between attacks and shoots a little faster.
  readonly pace: number;
  // Procedural bosses only (style Procedural): the body (see Body)
  // and the kit, the seed its moves are generated from (planFor). 0 otherwise.
  readonly body: number;
  readonly kit: number;
  // How deep in the run it is, which a procedural boss's moves follow (arenaFor sets it).
  readonly depth: number;
};

export const BossStyleKind = { Warden: 0, Unchained: 1, Final: 2, Procedural: 3 } as const;

export const WARDEN: BossDef = {
  name: 'The Warden',
  hp: hp(1200),
  radius: meters(1.3),
  evadeGrace: inTicks(seconds(4)),
  style: BossStyleKind.Warden,
  pace: 1,
  body: 0,
  kit: 0, depth: 0,
};

// Arena 2's Warden: the same body, a faster temper. It fights with gap rings and
// a spiral instead of slow walks, and grows spikes on the pillars in phase 2.
export const UNCHAINED: BossDef = {
  name: 'The Warden, Unchained',
  hp: hp(1200),
  radius: meters(1.3),
  evadeGrace: inTicks(seconds(3)),
  style: BossStyleKind.Unchained,
  pace: 1,
  body: 0,
  kit: 0, depth: 0,
};

// The last fight, always: an exam in three phases, one per lesson. The Warden's
// slams and jumps, then rings and the spiral among spiked pillars, then the storm.
export const FINAL: BossDef = {
  name: 'The Keeper',
  hp: hp(1400),
  radius: meters(1.5),
  evadeGrace: inTicks(seconds(4)),
  style: BossStyleKind.Final,
  pace: 1,
  body: 0,
  kit: 0, depth: 0,
};

// The procedural bodies (Stage C), indexed by Body: what each is made of. Its
// moves come from planFor; its name too, once arenaFor knows the kit.
// The Colossus is heavy and walks you down; the Lancer is lighter, for its
// charges; the Sentinel is a turret that never leaves its spot.
export const BODY_DEFS: readonly BossDef[] = [
  {
    name: 'The Colossus', hp: hp(1300), radius: meters(1.5), evadeGrace: inTicks(seconds(4)),
    style: BossStyleKind.Procedural, pace: 1, body: 0, kit: 0, depth: 0,
  },
  {
    name: 'The Lancer', hp: hp(1100), radius: meters(1.2), evadeGrace: inTicks(seconds(4)),
    style: BossStyleKind.Procedural, pace: 1, body: 1, kit: 0, depth: 0,
  },
  {
    name: 'The Sentinel', hp: hp(1200), radius: meters(1.4), evadeGrace: inTicks(seconds(4)),
    style: BossStyleKind.Procedural, pace: 1, body: 2, kit: 0, depth: 0,
  },
];
