import { initialBoss } from '../domain/boss/boss';
import type { Loadout } from '../domain/run/run';
import { ARENAS, PILLAR_HEIGHT, PILLAR_RADIUS } from '../ecs/arenas';
import { Ammo, BossPhase, C, Durability, Health, Jump, RunStatus, RunView, resetComponents, resetEntityComponents } from '../ecs/components';
import { clearOutbox } from '../ecs/core/outbox';
import { seedRng } from '../ecs/core/rng';
import { add, NO_HANDLE, resetWorld, toHandle, type Handle } from '../ecs/core/world';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../ecs/prefabs';
import { resetScripts } from '../ecs/systems/boss';
import { equip } from '../ecs/systems/weapons';
import { WEAPON_STOCK } from '../ecs/weapons/defs';
import { bossIdFor, PLAYER_ID } from './ids';
import { idMap } from './id-map';
import { KIND_NUMBER } from './run/loadout';
import { store } from './store';
import { clearTickLog } from './tick-log';

export { BOSS_ID, PLAYER_ID } from './ids';

// The seed fixes every random drop, so a run can be replayed exactly.
export type RunOptions = { bossHp?: number; seed?: number };
export type RunHandles = { player: Handle; boss: Handle };

// One object, updated in place by every build, so whoever holds it (the app,
// the camera) follows the player into the next arena without asking again.
export const handles: RunHandles = { player: NO_HANDLE, boss: NO_HANDLE };
let options: RunOptions = {};

export function startRun(opts: RunOptions = {}): RunHandles {
  options = opts;
  resetWorld();
  resetComponents();
  clearOutbox();
  clearTickLog();
  idMap.clear();
  store.reset();
  seedRng(opts.seed ?? 1);
  buildArena(store.run.arena, store.run.loadout);
  return handles;
}

// The spawn projection: the ECS world rebuilt purely from domain state. Arena 1
// and every arena after it are built by this one path, so a save/load would be too.
export function buildArena(arena: number, loadout: Loadout): void {
  resetWorld(true);
  resetEntityComponents();
  resetScripts();
  idMap.unbindHandles();
  const layout = ARENAS[arena - 1];

  // Pillars are pure simulation (cover), so the domain never hears of them.
  for (const [x, z] of layout.pillars) spawnPillar(x, z, PILLAR_RADIUS);

  const [px, pz] = layout.playerStart;
  const p = spawnPlayer(px, pz);
  Health.hp[p] = loadout.hp;
  idMap.bind(toHandle(p), { context: 'player', id: PLAYER_ID });

  let carriedKind = 0;
  if (loadout.weapon) {
    carriedKind = KIND_NUMBER[loadout.weapon.kind];
    const w = spawnWeapon(carriedKind, px, pz);
    Durability.value[w] = loadout.weapon.durability;
    Ammo.count[w] = loadout.weapon.ammo;
    equip(p, w);
    idMap.bind(toHandle(w), { context: 'weapon', id: loadout.weapon.id });
  }

  // The rest of the stock, laid out where this arena puts weapons.
  let spot = 0;
  for (let kind = 1; kind < WEAPON_STOCK.length; kind++) {
    const count = WEAPON_STOCK[kind] - (kind === carriedKind ? 1 : 0);
    for (let n = 0; n < count && spot < layout.weaponSpots.length; n++) {
      const [x, z] = layout.weaponSpots[spot++];
      spawnWeapon(kind, x, z);
    }
  }

  const bossId = bossIdFor(arena);
  const [bx, bz] = layout.bossStart;
  const b = spawnBoss(bx, bz, options.bossHp ?? 1200);
  if (layout.perch >= 0) {
    // Up on its perch: out of reach until it drops in.
    add(b, C.Airborne);
    Jump.fromHeight[b] = PILLAR_HEIGHT;
  }
  idMap.bind(toHandle(b), { context: 'boss', id: bossId });
  if (!store.bosses.has(bossId)) store.bosses.set(bossId, initialBoss(bossId));
  BossPhase.phase[b] = store.bosses.get(bossId)!.phase;

  RunView.arena = arena;
  RunView.arenas = store.run.arenas;
  RunView.status = RunStatus.Fighting;
  RunView.tunnelOpen = false;
  handles.player = toHandle(p);
  handles.boss = toHandle(b);
}
