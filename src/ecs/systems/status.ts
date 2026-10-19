// Effects stored as tick deadlines are read here, in one place, so every system
// combines them the same way and none of them has to count anything down.
import { Buffs, Dodge, Slowed } from '../components';
import { world, type EntityId } from '../core/world';
import { FURY_MUL, HASTE_MUL } from '../weapons/defs';

export const hasted = (e: EntityId) => world.tick < Buffs.hasteUntil[e];
export const furious = (e: EntityId) => world.tick < Buffs.furyUntil[e];
export const slowed = (e: EntityId) => world.tick < Slowed.until[e];
export const dodging = (e: EntityId) => world.tick < Dodge.until[e];

// Haste and slow are separate fields with separate writers, so neither can erase the other.
export const speedMul = (e: EntityId) => (hasted(e) ? HASTE_MUL : 1) * (slowed(e) ? Slowed.factor[e] : 1);
export const dmgMul = (e: EntityId) => (furious(e) ? FURY_MUL : 1);
