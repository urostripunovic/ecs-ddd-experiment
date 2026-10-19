import type { BossId, PlayerId } from '../domain/shared/types';

export const PLAYER_ID = 'player-1' as PlayerId;
export const BOSS_ID = 'warden' as BossId;

// The same boss in every arena, but a new one each time as far as the rules go:
// its own phase and its own defeat.
export const bossIdFor = (arena: number) => (arena === 1 ? BOSS_ID : (`warden-${arena}` as BossId));
