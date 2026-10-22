// Armor plates: each blocks one hit completely and breaks. Kept apart from the
// rewards so hurt() can read it without importing the weapon systems.
import { Armor } from '../components';
import type { EntityId } from '../core/world';

export const MAX_PLATES = 3;

export const armorPlates = (entity: EntityId) => Math.max(0, Armor.gained[entity] - Armor.broken[entity]);
