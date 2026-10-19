import { initialBoss } from '../domain/boss/boss';
import type { BossId, PlayerId } from '../domain/shared/types';
import { BossPhase, MatchStatus, MatchView, resetComponents } from '../ecs/components';
import { clearOutbox } from '../ecs/core/outbox';
import { seedRng } from '../ecs/core/rng';
import { resetWorld, toHandle, type Handle } from '../ecs/core/world';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../ecs/prefabs';
import { resetScripts } from '../ecs/systems/boss';
import { equip } from '../ecs/systems/weapons';
import { WeaponKind } from '../ecs/weapons/defs';
import { idMap } from './id-map';
import { store } from './store';
import { clearTickLog } from './tick-log';

export const PLAYER_ID = 'player-1' as PlayerId;
export const BOSS_ID = 'warden' as BossId;

// The seed fixes every random drop, so a run can be replayed exactly.
export type MatchOptions = { bossHp?: number; seed?: number };
export type MatchHandles = { player: Handle; boss: Handle };

// Rebuilds the ECS world from domain state. Today that is always a fresh
// match; a save/load would feed a stored phase through the same path.
export function startMatch(opts: MatchOptions = {}): MatchHandles {
  resetWorld();
  resetComponents();
  resetScripts();
  clearOutbox();
  clearTickLog();
  idMap.clear();
  store.reset();
  seedRng(opts.seed ?? 1);

  // Pillars are pure simulation (cover), so the domain never hears of them.
  for (const [x, z] of [[-9, -5], [9, -5], [-9, 7], [9, 7]] as const) spawnPillar(x, z, 1.4);

  const p = spawnPlayer(0, 12);
  const player = toHandle(p);
  idMap.bind(player, { context: 'player', id: PLAYER_ID });
  // A starting loadout is simulation setup, not a rule: nothing would save it.
  equip(p, spawnWeapon(WeaponKind.Gun, 0, 12));
  spawnWeapon(WeaponKind.Sword, -4, 9);
  spawnWeapon(WeaponKind.Spear, 4, 9);

  const b = spawnBoss(0, -8, opts.bossHp ?? 1200);
  const boss = toHandle(b);
  idMap.bind(boss, { context: 'boss', id: BOSS_ID });
  store.bosses.set(BOSS_ID, initialBoss(BOSS_ID));

  // Spawn projection: components mirror whatever the domain says is true.
  BossPhase.phase[b] = store.bosses.get(BOSS_ID)!.phase;
  MatchView.status = MatchStatus.Fighting;

  return { player, boss };
}
