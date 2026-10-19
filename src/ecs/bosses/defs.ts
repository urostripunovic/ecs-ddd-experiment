// Bosses as data, like the weapons: what a boss is made of when it spawns.
// Its attacks are choreography and live with its scripts.
import { hp, inTicks, meters, seconds, type Hp, type Meters, type Ticks } from '../core/units';

export type BossDef = {
  readonly name: string;
  readonly hp: Hp;
  readonly radius: Meters;
  // No evading in the opening seconds, while the player is still finding range.
  readonly evadeGrace: Ticks;
};

export const WARDEN: BossDef = {
  name: 'The Warden',
  hp: hp(1200),
  radius: meters(1.3),
  evadeGrace: inTicks(seconds(4)),
};
