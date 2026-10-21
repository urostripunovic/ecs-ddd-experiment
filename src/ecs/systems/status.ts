// Effects stored as tick deadlines are read here, in one place, so every system
// combines them the same way and none of them has to count anything down.
import { Buffs, Dodge, Slowed } from '../components';
import { world, type EntityId } from '../core/world';
import { FURY_MUL, HASTE_MUL } from '../weapons/defs';
import { hasPerk, lowHp, Perk, PERK_DMG_MUL, PERK_SPEED_MUL } from './perks';

export const hasted = (entity: EntityId) => world.tick < Buffs.hasteUntil[entity];
export const furious = (entity: EntityId) => world.tick < Buffs.furyUntil[entity];
export const slowed = (entity: EntityId) => world.tick < Slowed.until[entity];
export const dodging = (entity: EntityId) => world.tick < Dodge.until[entity];

// Haste and slow are separate fields with separate writers, so neither can erase the other.
// Perks only switch on at low hp, so they multiply in like any other effect.
const adrenaline = (entity: EntityId) => hasPerk(entity, Perk.Adrenaline) && lowHp(entity);
const lastStand = (entity: EntityId) => hasPerk(entity, Perk.LastStand) && lowHp(entity);
export const speedMul = (entity: EntityId) =>
  (hasted(entity) ? HASTE_MUL : 1) * (slowed(entity) ? Slowed.factor[entity] : 1) * (adrenaline(entity) ? PERK_SPEED_MUL : 1);
export const dmgMul = (entity: EntityId) => (furious(entity) ? FURY_MUL : 1) * (lastStand(entity) ? PERK_DMG_MUL : 1);
