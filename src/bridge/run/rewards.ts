import type { Reward } from '../../domain/run/run';
import { spawnReward } from '../../ecs/prefabs';
import { REWARD_KIND } from './loadout';

// Where an offer's pedestals stand: a row in the open middle of every arena,
// clear of the pillars and of where the boss went down.
const ROW_Z = 3;
const SPACING = 3.5;

export function spawnPedestals(offer: readonly Reward[]): void {
  offer.forEach((reward, i) => spawnReward(i, REWARD_KIND[reward], (i - (offer.length - 1) / 2) * SPACING, ROW_Z));
}
