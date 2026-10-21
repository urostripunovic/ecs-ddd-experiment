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
};

export const BossStyleKind = { Warden: 0, Unchained: 1 } as const;

export const WARDEN: BossDef = {
  name: 'The Warden',
  hp: hp(1200),
  radius: meters(1.3),
  evadeGrace: inTicks(seconds(4)),
  style: BossStyleKind.Warden,
};

// Arena 2's Warden: the same body, a faster temper. It fights with gap rings and
// a spiral instead of slow walks, and grows spikes on the pillars in phase 2.
export const UNCHAINED: BossDef = {
  name: 'The Warden, Unchained',
  hp: hp(1200),
  radius: meters(1.3),
  evadeGrace: inTicks(seconds(3)),
  style: BossStyleKind.Unchained,
};
